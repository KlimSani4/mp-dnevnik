import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import type {
  AssignmentCreateRequest,
  AssignmentSearchParams,
  AssignmentUpdateRequest,
  AssignmentVoteRequest,
  Task,
  TaskUpdateRequest,
  TaskSearchParams,
  BulkTaskUpdateRequest,
} from '../types'

/**
 * Задание показывается в трёх местах: список заданий (['assignments']), доска задач
 * (['tasks']) и главная (['dashboard']). После любого изменения задания обновляем все три,
 * иначе страница показывает старые данные до перезагрузки (#103).
 */
function refreshAssignmentViews(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['assignments'] }),
    queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ])
}

export function useAssignments(params: AssignmentSearchParams) {
  const api = useApi()

  return useQuery({
    queryKey: ['assignments', params],
    queryFn: () => api.assignments.list(params),
    enabled: !!params.group_id,
  })
}

export function useAssignment(id: string) {
  const api = useApi()

  return useQuery({
    queryKey: ['assignments', id],
    queryFn: () => api.assignments.get(id),
    enabled: !!id,
  })
}

export function useCreateAssignment() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: AssignmentCreateRequest) => api.assignments.create(data),
    onSuccess: () => refreshAssignmentViews(queryClient),
  })
}

export function useUpdateAssignment() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignmentUpdateRequest }) =>
      api.assignments.update(id, data),
    onSuccess: () => refreshAssignmentViews(queryClient),
  })
}

export function useDeleteAssignment() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.assignments.delete(id),
    // Убираем задание с доски сразу, не дожидаясь ответа сервера; при ошибке возвращаем
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] })
      for (const [key, prev] of snapshots) {
        if (prev) {
          queryClient.setQueryData<Task[]>(key, prev.filter((t) => t.assignment.id !== id))
        }
      }
      return { snapshots }
    },
    onError: (_err, _id, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) {
        queryClient.setQueryData(key, data)
      }
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: ['assignments', id], exact: true })
    },
    onSettled: () => refreshAssignmentViews(queryClient),
  })
}

export function useVoteAssignment() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AssignmentVoteRequest }) =>
      api.assignments.vote(id, data),
    onSuccess: () => refreshAssignmentViews(queryClient),
  })
}

export function useTasks(params: TaskSearchParams) {
  const api = useApi()

  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => api.tasks.list(params),
    enabled: !!params.group_id,
  })
}

export function useUpdateTask() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ assignmentId, data }: { assignmentId: string; data: TaskUpdateRequest }) =>
      api.tasks.update(assignmentId, data),
    onMutate: async ({ assignmentId, data }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks'] })
      const snapshots = queryClient.getQueriesData<Task[]>({ queryKey: ['tasks'] })
      for (const [key, prev] of snapshots) {
        if (!prev) continue
        queryClient.setQueryData<Task[]>(
          key,
          prev.map((t) =>
            t.assignment.id === assignmentId
              ? { ...t, state: data.state, updated_at: new Date().toISOString() }
              : t,
          ),
        )
      }
      return { snapshots }
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshots) return
      for (const [key, data] of ctx.snapshots) {
        queryClient.setQueryData(key, data)
      }
    },
    onSettled: () => refreshAssignmentViews(queryClient),
  })
}

export function useBulkUpdateTasks() {
  const api = useApi()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: BulkTaskUpdateRequest) => api.tasks.bulkUpdate(data),
    onSuccess: () => refreshAssignmentViews(queryClient),
  })
}
