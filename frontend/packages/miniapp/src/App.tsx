import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useTelegramWebApp } from './telegram/useTelegramWebApp'
import { TabBar } from './components/TabBar'
import { HomePage } from './pages/HomePage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { TasksPage } from './pages/TasksPage'
import { ProfilePage } from './pages/ProfilePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

export function App() {
  const { webApp, isReady } = useTelegramWebApp()

  useEffect(() => {
    if (webApp && isReady) {
      webApp.ready()
      webApp.expand()
    }
  }, [webApp, isReady])

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  )
}
