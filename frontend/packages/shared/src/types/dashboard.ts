import type { DaySchedule } from './schedule'
import type { Assignment, TaskState } from './assignment'

export interface TaskProgress {
  total: number
  done: number
  doing: number
  review: number
  todo: number
}

export interface DashboardResponse {
  today_schedule: DaySchedule
  burning_tasks: Assignment[]
  progress: TaskProgress
}

export interface DashboardParams {
  group_id: string
  group_code: string
}
