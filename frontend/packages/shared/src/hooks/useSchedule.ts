import { useQuery } from '@tanstack/react-query'
import { useApi } from './useApi'
import { format, addDays, startOfWeek } from 'date-fns'

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
