import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTelegramWebApp } from './telegram/useTelegramWebApp'
import { TabBar } from './components/TabBar'
import { HomePage } from './pages/HomePage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { TasksPage } from './pages/TasksPage'
import { ProfilePage } from './pages/ProfilePage'
import { useLoginWithTelegram } from '@nexora/shared'
import { useAuthStore } from '@nexora/shared'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

function AuthGate({ children }: { children: React.ReactNode }) {
  const { webApp, isReady } = useTelegramWebApp()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const loginWithTelegram = useLoginWithTelegram()
  const [authAttempted, setAuthAttempted] = useState(false)

  useEffect(() => {
    if (!isReady || isAuthenticated || authAttempted) return

    const initData = webApp?.initData
    if (initData) {
      setAuthAttempted(true)
      loginWithTelegram.mutate({ init_data: initData })
    } else {
      // No initData (running outside Telegram) — mark as attempted so we don't loop
      setAuthAttempted(true)
    }
  }, [isReady, isAuthenticated, authAttempted, webApp, loginWithTelegram])

  const isLoading = loginWithTelegram.isPending || (!authAttempted && isReady && !isAuthenticated)

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--tg-theme-bg-color)',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            border: '3px solid var(--tg-theme-hint-color)',
            borderTopColor: 'var(--tg-theme-button-color)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: 14 }}>Загрузка...</span>
      </div>
    )
  }

  return <>{children}</>
}

function AppInner() {
  const { webApp, isReady } = useTelegramWebApp()

  useEffect(() => {
    if (!webApp || !isReady) return
    webApp.ready()
    webApp.expand()

    // Wire up back button — theme sync happens inside useTelegramWebApp
    const handleBack = () => window.history.back()
    webApp.BackButton.onClick(handleBack)

    return () => {
      webApp.BackButton.offClick(handleBack)
    }
  }, [webApp, isReady])

  return (
    <AuthGate>
      <BrowserRouter>
        <div className="min-h-screen pb-20">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
          <TabBar />
        </div>
      </BrowserRouter>
    </AuthGate>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  )
}
