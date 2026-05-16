import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import type { GroupCreateRequest, GroupRole, GroupSearchParams, GroupUpdateRequest, Subject } from '../types'

export function useMyGroups() {
  const api = useApi()

  return useQuery({
    queryKey: ['groups', 'my'],
    queryFn: () => api.groups.getMy(),
    staleTime: 1000 * 60 * 10,
  })
}

export function useSearchGroups(params?: GroupSearchParams) {
  const api = useApi()

  return useQuery({
    queryKey: ['groups', 'search', params],
    queryFn: () => api.groups.list(params),
    enabled: !!params?.search && params.search.length >= 2,
  })
}

export function useGroup(code: string) {
  const api = useApi()

  return useQuery({
    queryKey: ['groups', code],
    queryFn: () => api.groups.getByCode(code),
    enabled: !!code,
  })
}

export function useCreateGroup() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: GroupCreateRequest) => api.groups.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useJoinGroup() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (code: string) => api.groups.join(code),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useGroupSubjects(code?: string) {
  const api = useApi()

  return useQuery({
    queryKey: ['groups', code, 'subjects'],
    queryFn: () => api.groups.getSubjects(code!),
    enabled: !!code,
    staleTime: 1000 * 60 * 10,
  })
}

export function useUpdateGroup() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ code, data }: { code: string; data: GroupUpdateRequest }) =>
      api.groups.update(code, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useGroupStudents(code?: string) {
  const api = useApi()

  return useQuery({
    queryKey: ['groups', code, 'students'],
    queryFn: () => api.groups.getStudents(code!),
    enabled: !!code,
    staleTime: 1000 * 30,
  })
}

export function useVerifyStudent() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ code, userId }: { code: string; userId: string }) =>
      api.groups.verify(code, userId),
    onSuccess: (_data, { code }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', code, 'students'] })
    },
  })
}

export function useChangeStudentRole() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ code, userId, role }: { code: string; userId: string; role: GroupRole }) =>
      api.groups.changeRole(code, userId, { role }),
    onSuccess: (_data, { code }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', code, 'students'] })
    },
  })
}
