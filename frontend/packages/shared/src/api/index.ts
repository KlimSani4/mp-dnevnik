import { ApiClient, type ApiClientConfig } from './client'
import {
  createAuthApi,
  createUsersApi,
  createGroupsApi,
  createScheduleApi,
  createAssignmentsApi,
  createTasksApi,
  createDashboardApi,
} from './endpoints'

export { ApiClient, ApiClientError, ValidationClientError } from './client'
export type { ApiClientConfig } from './client'

export function createNexoraApi(config: ApiClientConfig) {
  const client = new ApiClient(config)

  return {
    auth: createAuthApi(client),
    users: createUsersApi(client),
    groups: createGroupsApi(client),
    schedule: createScheduleApi(client),
    assignments: createAssignmentsApi(client),
    tasks: createTasksApi(client),
    dashboard: createDashboardApi(client),
  }
}

export type NexoraApi = ReturnType<typeof createNexoraApi>
