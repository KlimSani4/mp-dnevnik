export interface Notification {
  id: string
  title: string
  body: string
  type: 'schedule_change' | 'new_assignment' | 'deadline' | 'vote' | 'digest'
  is_read: boolean
  created_at: string
  metadata?: Record<string, unknown>
}

export interface NotificationListResponse {
  items: Notification[]
  total: number
  unread_count: number
}

export interface NotificationListParams {
  offset?: number
  limit?: number
  unread_only?: boolean
}
