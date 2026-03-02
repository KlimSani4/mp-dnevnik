import { useMemo } from 'react'
import { ApiClient } from '../api/client'
import {
  createAuthApi,
  createUsersApi,
  createGroupsApi,
  createScheduleApi,
  createAssignmentsApi,
  createTasksApi,
} from '../api/endpoints'
import { useAuthStore } from '../stores/auth'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export function useApi() {
  const getAccessToken = useAuthStore((s) => s.getAccessToken)
  const logout = useAuthStore((s) => s.logout)

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl: API_BASE_URL,
        getToken: getAccessToken,
        onUnauthorized: logout,
      }),
    [getAccessToken, logout]
  )

  return useMemo(
    () => ({
      auth: createAuthApi(client),
      users: createUsersApi(client),
      groups: createGroupsApi(client),
      schedule: createScheduleApi(client),
      assignments: createAssignmentsApi(client),
      tasks: createTasksApi(client),
    }),
    [client]
  )
}
