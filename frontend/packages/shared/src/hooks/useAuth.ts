import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import { useAuthStore } from '../stores/auth'
import type { TelegramAuthRequest, AuthTokens, UserUpdateRequest } from '../types'

export function useCurrentUser() {
  const api = useApi()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const setUser = useAuthStore((s) => s.setUser)

  return useQuery({
    queryKey: ['user', 'me'],
    queryFn: async () => {
      const user = await api.users.getMe()
      setUser(user)
      return user
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10,
  })
}

export function useLoginWithTelegram() {
  const api = useApi()
  const setTokens = useAuthStore((s) => s.setTokens)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: TelegramAuthRequest): Promise<AuthTokens> => api.auth.loginWithTelegram(data),
    onSuccess: (tokens) => {
      setTokens(tokens)
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })
}

export function useLogout() {
  const api = useApi()
  const logout = useAuthStore((s) => s.logout)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.auth.logout(),
    onSuccess: () => {
      logout()
      queryClient.clear()
    },
    onError: () => {
      logout()
      queryClient.clear()
    },
  })
}
