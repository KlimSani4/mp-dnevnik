import { useQuery } from '@tanstack/react-query'
import { useApi } from './useApi'
import type { DashboardParams } from '../types'

export function useDashboard(params?: DashboardParams) {
  const api = useApi()

  return useQuery({
    queryKey: ['dashboard', params],
    queryFn: () => api.dashboard.get(params!),
    enabled: !!params?.group_id && !!params?.group_code,
    staleTime: 1000 * 60 * 2,
  })
}
