export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskState = 'todo' | 'doing' | 'review' | 'done'

export interface Assignment {
  id: string
  title: string
  description: string
  deadline: string
  priority: Priority
  link: string | null
  votes_up: number
  votes_down: number
  is_verified: boolean
  author_id: string
  subject: {
    id: string
    name: string
  }
  created_at: string
}

export interface AssignmentCreateRequest {
  group_id: string
  subject_id: string
  title: string
  description: string
  deadline: string
  priority: Priority
  link?: string
}

export interface AssignmentUpdateRequest {
  title?: string
  description?: string
  deadline?: string
  priority?: Priority
  link?: string
}

export interface AssignmentVoteRequest {
  vote: 1 | -1
}

export interface AssignmentSearchParams {
  group_id: string
  subject_id?: string
  upcoming_only?: boolean
  search?: string
  priority?: string
  offset?: number
  limit?: number
}

export interface Task {
  id: string
  state: TaskState
  assignment: Assignment
  updated_at: string
}

export interface TaskUpdateRequest {
  state: TaskState
}

export interface TaskSearchParams {
  group_id: string
  state?: TaskState
}

export interface BulkTaskUpdateItem {
  assignment_id: string
  state: TaskState
}

export interface BulkTaskUpdateRequest {
  updates: BulkTaskUpdateItem[]
}
