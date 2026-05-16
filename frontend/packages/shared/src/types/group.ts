export type GroupRole = 'starosta' | 'deputy' | 'student' | 'moderator'

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

export interface GroupStudent {
  id: string
  user_id: string
  group_id: string
  role: GroupRole
  verified: boolean
  user: GroupStudentUser
  created_at: string
  updated_at: string
}

export interface RoleUpdateRequest {
  role: GroupRole
}
