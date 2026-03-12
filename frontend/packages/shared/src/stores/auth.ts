import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, AuthTokens } from '../types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  isAuthenticated: boolean
  selectedGroupId: string | null
  selectedGroupCode: string | null

  setTokens: (tokens: AuthTokens) => void
  setUser: (user: User) => void
  setSelectedGroup: (id: string, code: string) => void
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
      selectedGroupId: null,
      selectedGroupCode: null,

      setTokens: (tokens: AuthTokens) =>
        set({
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          isAuthenticated: true,
        }),

      setUser: (user: User) => set({ user }),

      setSelectedGroup: (id: string, code: string) =>
        set({ selectedGroupId: id, selectedGroupCode: code }),

      logout: () =>
        set({
          accessToken: null,
          refreshToken: null,
          user: null,
          isAuthenticated: false,
          selectedGroupId: null,
          selectedGroupCode: null,
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
