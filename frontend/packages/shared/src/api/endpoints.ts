import type { ApiClient } from './client'
import type {
  AuthTokens,
  TelegramAuthRequest,
  RefreshTokenRequest,
  User,
  UserUpdateRequest,
  UserDataExport,
  Group,
  GroupMembership,
  GroupCreateRequest,
  GroupUpdateRequest,
  GroupSearchParams,
  DaySchedule,
  ScheduleEntry,
  ScheduleParams,
  OverrideCreateRequest,
  Assignment,
  AssignmentCreateRequest,
  AssignmentUpdateRequest,
  AssignmentVoteRequest,
  AssignmentSearchParams,
  Task,
  TaskUpdateRequest,
  TaskSearchParams,
} from '../types'

export function createAuthApi(client: ApiClient) {
  return {
    loginWithTelegram(data: TelegramAuthRequest) {
      return client.post<AuthTokens>('/auth/telegram', data)
    },
    refresh(data: RefreshTokenRequest) {
      return client.post<AuthTokens>('/auth/refresh', data)
    },
    logout() {
      return client.post<void>('/auth/logout')
    },
  }
}

export function createUsersApi(client: ApiClient) {
  return {
    getMe() {
      return client.get<User>('/users/me')
    },
    updateMe(data: UserUpdateRequest) {
      return client.patch<User>('/users/me', data)
    },
    deleteMe() {
      return client.delete<void>('/users/me')
    },
    exportData() {
      return client.get<UserDataExport>('/users/me/data')
    },
  }
}

export function createGroupsApi(client: ApiClient) {
  return {
    list(params?: GroupSearchParams) {
      return client.get<Group[]>('/groups', params)
    },
    create(data: GroupCreateRequest) {
      return client.post<Group>('/groups', data)
    },
    getMy() {
      return client.get<GroupMembership[]>('/groups/my')
    },
    getByCode(code: string) {
      return client.get<Group>(`/groups/${code}`)
    },
    update(code: string, data: GroupUpdateRequest) {
      return client.patch<Group>(`/groups/${code}`, data)
    },
    join(code: string) {
      return client.post<GroupMembership>(`/groups/${code}/join`)
    },
    verify(code: string, userId: string) {
      return client.post<void>(`/groups/${code}/verify/${userId}`)
    },
  }
}

export function createScheduleApi(client: ApiClient) {
  return {
    getWeek(params: ScheduleParams) {
      return client.get<DaySchedule[]>('/schedule', params)
    },
    getDay(date: string, group: string) {
      return client.get<DaySchedule>(`/schedule/day/${date}`, { group })
    },
    getGroupSchedule(code: string) {
      return client.get<ScheduleEntry[]>(`/schedule/group/${code}`)
    },
    createOverride(data: OverrideCreateRequest) {
      return client.post<void>('/schedule/override', data)
    },
    deleteOverride(id: string) {
      return client.delete<void>(`/schedule/override/${id}`)
    },
  }
}

export function createAssignmentsApi(client: ApiClient) {
  return {
    list(params: AssignmentSearchParams) {
      return client.get<Assignment[]>('/assignments', params)
    },
    get(id: string) {
      return client.get<Assignment>(`/assignments/${id}`)
    },
    create(data: AssignmentCreateRequest) {
      return client.post<Assignment>('/assignments', data)
    },
    update(id: string, data: AssignmentUpdateRequest) {
      return client.patch<Assignment>(`/assignments/${id}`, data)
    },
    delete(id: string) {
      return client.delete<void>(`/assignments/${id}`)
    },
    vote(id: string, data: AssignmentVoteRequest) {
      return client.post<void>(`/assignments/${id}/vote`, data)
    },
  }
}

export function createTasksApi(client: ApiClient) {
  return {
    list(params: TaskSearchParams) {
      return client.get<Task[]>('/tasks', params)
    },
    update(assignmentId: string, data: TaskUpdateRequest) {
      return client.patch<Task>(`/tasks/${assignmentId}`, data)
    },
  }
}
