import { useAuthStore } from '../stores/auth'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import type { Group, GroupCreateRequest, GroupRole, GroupSearchParams, GroupUpdateRequest, Subject } from '../types'

export function useMyGroups(options: { enabled?: boolean } = {}) {
  const api = useApi()

  return useQuery({
    queryKey: ['groups', 'my'],
    queryFn: () => api.groups.getMy(),
    staleTime: 1000 * 60 * 10,
    enabled: options.enabled ?? true,
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
    mutationFn: ({ switchGroup = false, ...data }: GroupCreateRequest & { switchGroup?: boolean }) =>
      api.groups.create(data, switchGroup),
    onSuccess: (group) => {
      // Новая группа сразу становится текущей: старой у человека больше нет (#162)
      useAuthStore.getState().setSelectedGroup(group.id, group.code)
      queryClient.invalidateQueries()
    },
  })
}

/** Выйти из группы (#157): сбрасывает выбранную группу, если вышли из неё */
export function useLeaveGroup() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (code: string) => api.groups.leave(code),
    onSuccess: (_data, code) => {
      if (useAuthStore.getState().selectedGroupCode === code) {
        useAuthStore.setState({ selectedGroupId: null, selectedGroupCode: null })
      }
      queryClient.invalidateQueries()
    },
  })
}

export function useJoinGroup() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (args: string | { code: string; switchGroup?: boolean }) =>
      typeof args === 'string'
        ? api.groups.join(args)
        : api.groups.join(args.code, args.switchGroup ?? false),
    onSuccess: (membership, args) => {
      if (typeof args !== 'string' && args.switchGroup) {
        useAuthStore.getState().setSelectedGroup(membership.group_id, args.code)
        queryClient.invalidateQueries()
      } else {
        queryClient.invalidateQueries({ queryKey: ['groups'] })
      }
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

/** Отклонить заявку в группу (#148) */
export function useRejectStudent() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ code, userId }: { code: string; userId: string }) =>
      api.groups.reject(code, userId),
    onSuccess: (_data, { code }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', code, 'students'] })
    },
  })
}

/** Удалить участника из группы: староста или модератор платформы */
export function useRemoveStudent() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ code, userId }: { code: string; userId: string }) =>
      api.groups.removeStudent(code, userId),
    onSuccess: (_data, { code }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', code, 'students'] })
      queryClient.invalidateQueries({ queryKey: ['moderation'] })
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

export function useCreateCustomSubject() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ code, name }: { code: string; name: string }) =>
      api.groups.createCustomSubject(code, { name }),
    onSuccess: (_data, { code }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', code, 'subjects'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    },
  })
}

export function useUpdateSubjectRequirements() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      code,
      subjectId,
      total,
      typeBreakdown,
    }: {
      code: string
      subjectId: string
      total?: number
      typeBreakdown?: Record<string, number>
    }): Promise<Group> =>
      api.groups.updateSubjectRequirements(code, subjectId, {
        total,
        type_breakdown: typeBreakdown,
      }),
    onSuccess: (_data, { code }) => {
      queryClient.invalidateQueries({ queryKey: ['groups', code] })
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
    },
  })
}

// ─── Ссылка-приглашение (#147) ───

export function useGroupInvite(code: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: ['groups', 'invite', code],
    queryFn: () => api.groups.invite(code!),
    enabled: !!code,
    staleTime: 5 * 60_000,
  })
}

export function useResetInvite() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (code: string) => api.groups.resetInvite(code),
    onSuccess: (invite) => queryClient.setQueryData(['groups', 'invite', invite.code], invite),
  })
}

export function useInvitePreview(token: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: ['groups', 'invite-preview', token],
    queryFn: () => api.groups.invitePreview(token!),
    enabled: !!token,
    retry: false,
  })
}

export function useJoinByInvite() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ token, switchGroup = false }: { token: string; switchGroup?: boolean }) =>
      api.groups.joinByInvite(token, switchGroup),
    onSuccess: (_membership, { switchGroup }) => {
      // После смены группы выбор сбросится и useGroupContext возьмёт новую (#162)
      if (switchGroup) useAuthStore.setState({ selectedGroupId: null, selectedGroupCode: null })
      queryClient.invalidateQueries()
    },
  })
}
