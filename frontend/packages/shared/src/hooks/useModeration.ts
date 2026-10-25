import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import { useAuthStore } from '../stores/auth'
import type { ApplicationStatus, SupportRequestUpdate, SupportStatus, TeacherApplicationCreate } from '../types'

// ─── Модератор (#99) ───

export function useModerationStats(enabled = true) {
  const api = useApi()
  return useQuery({ queryKey: ['moderation', 'stats'], queryFn: () => api.moderation.getStats(), enabled, staleTime: 60_000 })
}

export function useSupportRequests(status?: SupportStatus) {
  const api = useApi()
  return useQuery({ queryKey: ['moderation', 'support', status ?? 'all'], queryFn: () => api.moderation.getSupport(status) })
}

export function useUpdateSupportRequest() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: SupportRequestUpdate }) => api.moderation.updateSupport(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moderation'] }),
  })
}

export function useTeacherApplications(status: ApplicationStatus = 'pending') {
  const api = useApi()
  return useQuery({
    queryKey: ['moderation', 'teacher-applications', status],
    queryFn: () => api.moderation.getTeacherApplications(status),
  })
}

export function useReviewTeacherApplication() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      approve ? api.moderation.approveTeacher(id) : api.moderation.rejectTeacher(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moderation'] }),
  })
}

export function useModerators() {
  const api = useApi()
  return useQuery({ queryKey: ['moderation', 'moderators'], queryFn: () => api.moderation.getModerators() })
}

export function useModerationAudit() {
  const api = useApi()
  return useQuery({ queryKey: ['moderation', 'audit'], queryFn: () => api.moderation.getAudit() })
}

// ─── Пользователь ───

export function useMySupportRequests() {
  const api = useApi()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({ queryKey: ['support', 'my'], queryFn: () => api.support.mine(), enabled: isAuthenticated })
}

export function useCreateSupportRequest() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (message: string) => api.support.create(message),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support', 'my'] }),
  })
}

export function useMyTeacherApplication() {
  const api = useApi()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  return useQuery({
    queryKey: ['teacher-application', 'my'],
    queryFn: () => api.support.getTeacherApplication(),
    enabled: isAuthenticated,
  })
}

export function useApplyTeacher() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TeacherApplicationCreate) => api.support.applyTeacher(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher-application', 'my'] }),
  })
}
