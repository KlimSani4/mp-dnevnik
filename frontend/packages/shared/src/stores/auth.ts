import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthTokens } from '../types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean

  setTokens: (tokens: AuthTokens) => void
  setUser: (user: User) => void
  logout: () => void
  getAccessToken: () => string | null
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,

      setTokens: (tokens: AuthTokens) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          isAuthenticated: true,
        }),

      setUser: (user: User) => set({ user }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
        }),

      getAccessToken: () => get().accessToken,
    }),
    {
      name: 'nexora-auth',
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
)
