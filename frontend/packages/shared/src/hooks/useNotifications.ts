import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import { useAuthStore } from '../stores/auth'
import type { NotificationListParams, NotificationPreferencesUpdate } from '../types'

export function useNotifications(params?: NotificationListParams) {
  const api = useApi()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => api.notifications.getList(params),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 2,
  })
}

export function useMarkNotificationRead() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useNotificationPreferences() {
  const api = useApi()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.notifications.getPreferences(),
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10,
  })
}

export function useUpdateNotificationPreferences() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: NotificationPreferencesUpdate) => api.notifications.updatePreferences(data),
    onSuccess: (result) => {
      queryClient.setQueryData(['notification-preferences'], result)
    },
  })
}
