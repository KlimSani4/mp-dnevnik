import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Layout } from './layouts/Layout'
import { AuthGuard } from './components/AuthGuard'
import { HomePage } from './pages/HomePage'
import { SchedulePage } from './pages/SchedulePage'
import { AssignmentsPage } from './pages/AssignmentsPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { SettingsPage } from './pages/SettingsPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { ModerationPage } from './pages/ModerationPage'
import { JoinPage } from './pages/JoinPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route element={<AuthGuard />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/schedule" element={<SchedulePage />} />
              <Route path="/assignments" element={<AssignmentsPage />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/moderation" element={<ModerationPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
