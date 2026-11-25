/** Очередь на сдачу лабораторных (#62) */

export type QueueMode = 'first_come' | 'random' | 'lab_number' | 'debtors'
export type QueueStatus = 'open' | 'started' | 'closed'
export type QueueEntryStatus = 'waiting' | 'current' | 'passed' | 'failed' | 'left'
export type QueueResult = 'passed' | 'failed' | 'absent'

export interface QueueEntry {
  id: string
  user_id: string
  name: string
  labs: number[]
  position: number
  status: QueueEntryStatus
  skips: number
  is_me: boolean
  joined_at: string
  finished_at: string | null
}

export interface QueueSwap {
  id: string
  from_entry_id: string
  to_entry_id: string
  from_name: string
  to_name: string
  status: 'pending' | 'accepted' | 'declined' | 'cancelled'
  created_at: string
}

export interface QueueSummary {
  id: string
  group_code: string
  title: string
  lesson_date: string
  start_time: string | null
  mode: QueueMode
  status: QueueStatus
  max_labs: number
  waiting: number
  done: number
  my_position: number | null
  my_status: QueueEntryStatus | null
}

export interface QueueDetail extends QueueSummary {
  is_host: boolean
  entries: QueueEntry[]
  finished: QueueEntry[]
  me: QueueEntry | null
  incoming_swaps: QueueSwap[]
  outgoing_swap: QueueSwap | null
}

export interface QueueLessonOption {
  entry_id: string
  title: string
  lesson_type: string | null
  start_time: string
  end_time: string
  room: string | null
  queue_id: string | null
}

export interface QueueCreateRequest {
  group_code: string
  entry_id: string
  lesson_date: string
  mode: QueueMode
  max_labs: number
}
