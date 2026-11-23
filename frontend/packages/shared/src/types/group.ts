// assistant — помощник старосты (раньше «moderator»), не путать с модератором платформы
export type GroupRole = 'starosta' | 'deputy' | 'student' | 'assistant'

export interface Group {
  id: string
  code: string
  name: string
  owner_id: string
  settings: Record<string, unknown>
  created_at: string
}

export interface GroupMembership {
  id: string
  user_id: string
  group_id: string
  role: GroupRole
  verified: boolean
  group: Group
}

export interface GroupCreateRequest {
  code: string
  name: string
}

export interface GroupUpdateRequest {
  name?: string
  settings?: Record<string, unknown>
}

export interface GroupSearchParams {
  search?: string
  offset?: number
  limit?: number
}

export interface GroupStudentUser {
  id: string
  display_name: string | null
}

/** Контакт Telegram — приходит только старосте и его помощникам (#148) */
export interface TelegramContact {
  username: string | null
  name: string | null
  profile_url: string | null
}

export type JoinedVia = 'site' | 'bot' | 'invite'

export interface GroupStudent {
  id: string
  user_id: string
  group_id: string
  role: GroupRole
  verified: boolean
  user: GroupStudentUser
  /** Когда подана заявка */
  created_at: string
  updated_at: string
  joined_via?: JoinedVia | null
  telegram?: TelegramContact | null
}

export interface RoleUpdateRequest {
  role: GroupRole
}
