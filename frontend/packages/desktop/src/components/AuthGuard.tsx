import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@nexora/shared'

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

export function AuthGuard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  if (!SKIP_AUTH && !isAuthenticated) {
    return <Navigate to="/onboarding" replace />
  }

  return <Outlet />
}
