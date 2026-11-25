import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import type { QueueCreateRequest, QueueDetail, QueueResult } from '../types'

// Очередь меняется с нескольких устройств и из бота — опрашиваем, пока страница открыта (#62)
const LIVE_MS = 4_000

export function useGroupQueues(groupCode: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: ['queues', 'list', groupCode],
    queryFn: () => api.queues.list(groupCode!),
    enabled: !!groupCode,
    refetchInterval: LIVE_MS * 2,
  })
}

export function useQueue(id: string | null) {
  const api = useApi()
  return useQuery({
    queryKey: ['queues', 'detail', id],
    queryFn: () => api.queues.get(id!),
    enabled: !!id,
    refetchInterval: LIVE_MS,
  })
}

export function useQueueLessons(groupCode: string | null, date: string, enabled: boolean) {
  const api = useApi()
  return useQuery({
    queryKey: ['queues', 'lessons', groupCode, date],
    queryFn: () => api.queues.lessons(groupCode!, date),
    enabled: enabled && !!groupCode,
  })
}

export function useOpenQueue() {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: QueueCreateRequest) => api.queues.open(data),
    onSuccess: (q) => {
      qc.setQueryData(['queues', 'detail', q.id], q)
      qc.invalidateQueries({ queryKey: ['queues', 'list'] })
      qc.invalidateQueries({ queryKey: ['queues', 'lessons'] })
    },
  })
}

export type QueueAction =
  | { type: 'join'; labs: number[] }
  | { type: 'labs'; labs: number[] }
  | { type: 'leave' }
  | { type: 'skip'; toEnd: boolean }
  | { type: 'start' }
  | { type: 'close' }
  | { type: 'result'; entryId: string; result: QueueResult }
  | { type: 'swap'; targetEntryId: string }
  | { type: 'respond'; swapId: string; accept: boolean }

/** Любое действие с очередью: ответ — свежая очередь, кладём её в кэш сразу. */
export function useQueueAction(id: string) {
  const api = useApi()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: QueueAction): Promise<QueueDetail> => {
      const q = api.queues
      switch (a.type) {
        case 'join': return q.join(id, a.labs)
        case 'labs': return q.updateLabs(id, a.labs)
        case 'leave': return q.leave(id)
        case 'skip': return q.skip(id, a.toEnd)
        case 'start': return q.start(id)
        case 'close': return q.close(id)
        case 'result': return q.result(id, a.entryId, a.result)
        case 'swap': return q.requestSwap(id, a.targetEntryId)
        case 'respond': return q.respondSwap(a.swapId, a.accept)
      }
    },
    onSuccess: (q) => {
      qc.setQueryData(['queues', 'detail', id], q)
      qc.invalidateQueries({ queryKey: ['queues', 'list'] })
    },
  })
}
