import type { ApiClient } from './client'
import type {
  AuthTokens,
  TelegramAuthRequest,
  TelegramBotInitResponse,
  TelegramBotPollResponse,
  RefreshTokenRequest,
  User,
  UserUpdateRequest,
  UserDataExport,
  Group,
  GroupMembership,
  GroupCreateRequest,
  GroupInvite,
  GroupInvitePreview,
  GroupUpdateRequest,
  GroupSearchParams,
  GroupStudent,
  RoleUpdateRequest,
  Subject,
  DaySchedule,
  ScheduleEntry,
  ScheduleParams,
  OverrideCreateRequest,
  ScheduleOverrideResponse,
  Assignment,
  AssignmentCreateRequest,
  AssignmentUpdateRequest,
  AssignmentVoteRequest,
  AssignmentSearchParams,
  Task,
  TaskUpdateRequest,
  TaskSearchParams,
  BulkTaskUpdateRequest,
  DashboardResponse,
  DashboardParams,
  NotificationListResponse,
  NotificationListParams,
  NotificationPreferencesResponse,
  NotificationPreferencesUpdate,
  ModerationStats,
  SupportRequest,
  SupportStatus,
  SupportRequestUpdate,
  MySupportRequest,
  TeacherApplication,
  ApplicationStatus,
  MyTeacherApplication,
  TeacherApplicationCreate,
  Moderator,
  AuditEntry,
  GroupOverview,
  QueueCreateRequest,
  QueueDetail,
  QueueLessonOption,
  QueueResult,
  QueueSummary,
} from '../types'

export function createAuthApi(client: ApiClient) {
  return {
    loginWithTelegram(data: TelegramAuthRequest) {
      return client.post<AuthTokens>('/auth/telegram', data)
    },
    devLogin(data: { telegram_id: string }) {
      return client.post<AuthTokens>('/auth/dev', data)
    },
    refresh(data: RefreshTokenRequest) {
      return client.post<AuthTokens>('/auth/refresh', data)
    },
    logout() {
      return client.post<void>('/auth/logout')
    },
    telegramBotInit() {
      return client.post<TelegramBotInitResponse>('/auth/telegram/init')
    },
    telegramBotPoll(token: string) {
      return client.get<TelegramBotPollResponse>(`/auth/telegram/poll/${token}`)
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
    /** switch — выйти из текущей группы: человек состоит максимум в одной (#162) */
    create(data: GroupCreateRequest, switchGroup = false) {
      return client.post<Group>(switchGroup ? '/groups?switch=true' : '/groups', data)
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
    join(code: string, switchGroup = false) {
      return client.post<GroupMembership>(
        `/groups/${encodeURIComponent(code)}/join${switchGroup ? '?switch=true' : ''}`,
      )
    },
    /** Ссылка-приглашение группы (#147) */
    invite(code: string) {
      return client.get<GroupInvite>(`/groups/${encodeURIComponent(code)}/invite`)
    },
    resetInvite(code: string) {
      return client.post<GroupInvite>(`/groups/${encodeURIComponent(code)}/invite/reset`)
    },
    invitePreview(token: string) {
      return client.get<GroupInvitePreview>(`/groups/invite/${encodeURIComponent(token)}`)
    },
    joinByInvite(token: string, switchGroup = false) {
      return client.post<GroupMembership>(
        `/groups/invite/${encodeURIComponent(token)}/join${switchGroup ? '?switch=true' : ''}`,
      )
    },
    /** Выйти из группы (#157) */
    leave(code: string) {
      return client.delete<void>(`/groups/${encodeURIComponent(code)}/membership`)
    },
    verify(code: string, userId: string) {
      return client.post<void>(`/groups/${code}/verify/${userId}`)
    },
    reject(code: string, userId: string) {
      return client.post<void>(`/groups/${code}/reject/${userId}`)
    },
    getSubjects(code: string) {
      return client.get<Subject[]>(`/groups/${code}/subjects`)
    },
    getStudents(code: string) {
      return client.get<GroupStudent[]>(`/groups/${code}/students`)
    },
    changeRole(code: string, userId: string, data: RoleUpdateRequest) {
      return client.patch<void>(`/groups/${code}/students/${userId}/role`, data)
    },
    createCustomSubject(code: string, data: { name: string }) {
      return client.post<Subject>(`/groups/${code}/subjects/custom`, data)
    },
    updateSubjectRequirements(
      code: string,
      subjectId: string,
      data: { total?: number; type_breakdown?: Record<string, number> },
    ) {
      return client.patch<Group>(`/groups/${code}/subjects/${subjectId}/requirements`, data)
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
    exportCalendar(params: { group_code: string; start_date?: string; weeks?: number }) {
      return client.getBlob('/schedule/export', params)
    },
    createOverride(data: OverrideCreateRequest) {
      return client.post<ScheduleOverrideResponse>('/schedule/override', data)
    },
    deleteOverride(id: string) {
      return client.delete<void>(`/schedule/override/${id}`)
    },
    getMyOverrides() {
      return client.get<ScheduleOverrideResponse[]>('/schedule/overrides/my')
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
    bulkUpdate(data: BulkTaskUpdateRequest) {
      return client.patch<Task[]>('/tasks/bulk', data)
    },
  }
}

export function createDashboardApi(client: ApiClient) {
  return {
    get(params: DashboardParams) {
      return client.get<DashboardResponse>('/dashboard', params)
    },
  }
}

export function createNotificationsApi(client: ApiClient) {
  return {
    getList(params?: NotificationListParams) {
      return client.get<NotificationListResponse>('/notifications', params as Record<string, unknown>)
    },
    markRead(id: string) {
      return client.patch<void>(`/notifications/${id}`, { is_read: true })
    },
    markAllRead() {
      return client.patch<void>('/notifications/read-all', {})
    },
    getPreferences() {
      return client.get<NotificationPreferencesResponse>('/notifications/settings')
    },
    updatePreferences(data: NotificationPreferencesUpdate) {
      return client.patch<NotificationPreferencesResponse>('/notifications/settings', data)
    },
  }
}

/** Модерация платформы (#99). Доступно только модераторам; выдать роль через API нельзя. */
export function createModerationApi(client: ApiClient) {
  return {
    getStats() {
      return client.get<ModerationStats>('/moderation/stats')
    },
    getSupport(status?: SupportStatus) {
      return client.get<SupportRequest[]>('/moderation/support', status ? { status } : undefined)
    },
    updateSupport(id: string, data: SupportRequestUpdate) {
      return client.patch<SupportRequest>(`/moderation/support/${id}`, data)
    },
    getTeacherApplications(status: ApplicationStatus = 'pending') {
      return client.get<TeacherApplication[]>('/moderation/teacher-applications', { status })
    },
    approveTeacher(id: string) {
      return client.post<TeacherApplication>(`/moderation/teacher-applications/${id}/approve`)
    },
    rejectTeacher(id: string) {
      return client.post<TeacherApplication>(`/moderation/teacher-applications/${id}/reject`)
    },
    getModerators() {
      return client.get<Moderator[]>('/moderation/moderators')
    },
    getAudit() {
      return client.get<AuditEntry[]>('/moderation/audit')
    },
    getGroups(q?: string) {
      return client.get<GroupOverview[]>('/moderation/groups', q ? { q } : undefined)
    },
  }
}

/** Обращения в поддержку и заявка преподавателя от имени пользователя (#99). */
export function createSupportApi(client: ApiClient) {
  return {
    create(message: string) {
      return client.post<MySupportRequest>('/support', { message })
    },
    mine() {
      return client.get<MySupportRequest[]>('/support/my')
    },
    getTeacherApplication() {
      return client.get<MyTeacherApplication | null>('/users/me/teacher-application')
    },
    applyTeacher(data: TeacherApplicationCreate) {
      return client.post<MyTeacherApplication>('/users/me/teacher-application', data)
    },
  }
}

/** Очередь на сдачу лабораторных (#62). Основной канал — бот, сайт работает с теми же данными. */
export function createQueuesApi(client: ApiClient) {
  return {
    list(group: string) {
      return client.get<QueueSummary[]>('/queues', { group })
    },
    lessons(group: string, date: string) {
      return client.get<QueueLessonOption[]>('/queues/lessons', { group, date })
    },
    open(data: QueueCreateRequest) {
      return client.post<QueueDetail>('/queues', data)
    },
    get(id: string) {
      return client.get<QueueDetail>(`/queues/${id}`)
    },
    join(id: string, labs: number[]) {
      return client.post<QueueDetail>(`/queues/${id}/join`, { labs })
    },
    updateLabs(id: string, labs: number[]) {
      return client.patch<QueueDetail>(`/queues/${id}/me`, { labs })
    },
    leave(id: string) {
      return client.delete<QueueDetail>(`/queues/${id}/me`)
    },
    skip(id: string, toEnd: boolean) {
      return client.post<QueueDetail>(`/queues/${id}/skip`, { to_end: toEnd })
    },
    start(id: string) {
      return client.post<QueueDetail>(`/queues/${id}/start`)
    },
    close(id: string) {
      return client.post<QueueDetail>(`/queues/${id}/close`)
    },
    result(id: string, entryId: string, result: QueueResult) {
      return client.post<QueueDetail>(`/queues/${id}/entries/${entryId}/result`, { result })
    },
    requestSwap(id: string, targetEntryId: string) {
      return client.post<QueueDetail>(`/queues/${id}/swaps`, { target_entry_id: targetEntryId })
    },
    respondSwap(swapId: string, accept: boolean) {
      return client.post<QueueDetail>(`/queues/swaps/${swapId}/${accept ? 'accept' : 'decline'}`)
    },
  }
}
