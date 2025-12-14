export type GroupRole = 'starosta' | 'deputy' | 'student'

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
