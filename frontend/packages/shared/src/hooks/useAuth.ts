import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import { useAuthStore } from '../stores/auth'
import type { TelegramAuthRequest, AuthTokens, UserUpdateRequest } from '../types'
import { ApiClientError } from '../api'

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

export function useTelegramBotAuth() {
  const api = useApi()
  const setTokens = useAuthStore((s) => s.setTokens)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (): Promise<{ token: string; botUrl: string }> => {
      const { token, bot_username } = await api.auth.telegramBotInit()
      const botUrl = `https://t.me/${bot_username}?start=${token}`
      return { token, botUrl }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })
}

export function useTelegramBotPoll(
  token: string | null,
  onSuccess: (tokens: { access_token: string; refresh_token: string; token_type: 'bearer' }) => void
) {
  const api = useApi()
  const setTokens = useAuthStore((s) => s.setTokens)
  const queryClient = useQueryClient()

  return useQuery({
    queryKey: ['auth', 'bot-poll', token],
    queryFn: async () => {
      if (!token) throw new Error('No token')
      const result = await api.auth.telegramBotPoll(token)
      return result
    },
    enabled: !!token,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data || data.status === 'pending') return 2000
      return false
    },
    retry: (failureCount, error) => {
      if (error instanceof ApiClientError && error.status === 404) return false
      return failureCount < 3
    },
    select: (data) => {
      if (data.status === 'complete') {
        setTokens({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          token_type: data.token_type,
          expires_in: 3600,
        })
        onSuccess(data)
        queryClient.invalidateQueries({ queryKey: ['user'] })
      }
      return data
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
