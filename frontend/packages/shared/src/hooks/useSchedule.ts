import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi } from './useApi'
import { format, addDays, startOfWeek } from 'date-fns'
import type { OverrideCreateRequest } from '../types'

export function useTodaySchedule(groupCode?: string) {
  const api = useApi()
  const today = format(new Date(), 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['schedule', 'day', today, groupCode],
    queryFn: () => api.schedule.getDay(today, groupCode ?? ''),
    enabled: !!groupCode,
  })
}

export function useWeekSchedule(groupCode?: string, weekOffset = 0) {
  const api = useApi()
  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 })
  const startDate = format(weekStart, 'yyyy-MM-dd')

  return useQuery({
    queryKey: ['schedule', 'week', startDate, groupCode],
    queryFn: () =>
      api.schedule.getWeek({
        group: groupCode ?? '',
        start_date: startDate,
      }),
    enabled: !!groupCode,
    staleTime: 1000 * 60 * 5,
  })
}

export function useDaySchedule(date: string, groupCode?: string) {
  const api = useApi()

  return useQuery({
    queryKey: ['schedule', 'day', date, groupCode],
    queryFn: () => api.schedule.getDay(date, groupCode ?? ''),
    enabled: !!groupCode && !!date,
  })
}

export function useCreateScheduleOverride() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: OverrideCreateRequest) => api.schedule.createOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
    },
  })
}

export function useDeleteScheduleOverride() {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.schedule.deleteOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule'] })
    },
  })
}

export function useMyScheduleOverrides() {
  const api = useApi()
  return useQuery({
    queryKey: ['schedule', 'my-overrides'],
    queryFn: () => api.schedule.getMyOverrides(),
  })
}
