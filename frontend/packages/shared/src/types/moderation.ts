// Модерация платформы (#99)

export type SupportStatus = 'new' | 'in_progress' | 'closed'
export type ApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface UserBrief {
  id: string
  display_name: string | null
}

export interface SupportRequest {
  id: string
  message: string
  status: SupportStatus
  reply: string | null
  replied_at: string | null
  created_at: string
  user: UserBrief
}

export type MySupportRequest = Omit<SupportRequest, 'user'>

export interface SupportRequestUpdate {
  status?: SupportStatus
  reply?: string
}

export interface TeacherApplication {
  id: string
  full_name: string
  department: string | null
  comment: string | null
  status: ApplicationStatus
  reviewed_at: string | null
  created_at: string
  user: UserBrief
}

export interface MyTeacherApplication {
  id: string
  full_name: string
  department: string | null
  status: ApplicationStatus
  created_at: string
}

export interface TeacherApplicationCreate {
  full_name: string
  department?: string
  comment?: string
}

export interface Moderator {
  id: string
  display_name: string | null
  granted_at: string | null
}

export interface AuditEntry {
  id: string
  action: string
  resource: string | null
  resource_id: string | null
  created_at: string
  user_id: string | null
  user_name: string | null
}

export interface DayPoint {
  day: string
  value: number
}

export interface ModerationStats {
  users_total: number
  users_new_7d: number
  active_7d: number
  active_30d: number
  groups_total: number
  assignments_total: number
  assignments_new_7d: number
  notifications_7d: number
  support_open: number
  teacher_pending: number
  active_by_day: DayPoint[]
  new_users_by_day: DayPoint[]
  // Расширенная статистика (#152); необязательные — старый бэкенд их не присылает
  active_1d?: number
  users_new_prev_7d?: number
  assignments_new_prev_7d?: number
  users_requested_group?: number
  users_in_group?: number
  groups_active?: number
  groups_without_starosta?: number
  join_requests_pending?: number
  assignments_personal?: number
  assignments_by_day?: DayPoint[]
  tasks_by_state?: KeyValue[]
  tasks_done_7d?: number
  notifications_by_type_7d?: KeyValue[]
  support_by_status?: KeyValue[]
  support_median_reply_hours?: number | null
  top_groups?: TopGroup[]
}

export interface KeyValue {
  key: string
  value: number
}

export interface TopGroup {
  code: string
  members: number
  assignments_30d: number
}

/** Группа в списке модератора платформы (#150) */
export interface GroupOverview {
  code: string
  name: string | null
  members: number
  pending: number
  starosta_name: string | null
  created_at: string
}
