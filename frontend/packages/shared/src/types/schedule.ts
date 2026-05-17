export type WeekParity = 'odd' | 'even' | null
export type OverrideType = 'cancel' | 'online' | 'link' | 'room' | 'note' | 'skip'
export type OverrideScope = 'group' | 'personal'

export interface Subject {
  id: string
  name: string
  short_name: string | null
  group_id: string | null
  is_custom: boolean
}

export interface ScheduleOverride {
  id: string
  scope: OverrideScope
  override_type: OverrideType
  value: string
  date: string
}

export interface ScheduleEntry {
  id: string
  pair_number: number
  start_time: string
  end_time: string
  location: string | null
  room: string | null
  teacher: string | null
  lesson_type: string | null
  week_parity: WeekParity
  subject: Subject
  overrides?: ScheduleOverride[]
}

export interface DaySchedule {
  schedule_date: string
  weekday: number
  weekday_name?: string
  entries: ScheduleEntry[]
}

export interface ScheduleParams {
  group: string
  start_date?: string
}

export interface OverrideCreateRequest {
  entry_id: string
  scope: OverrideScope
  override_type: OverrideType
  value: string
  target_date: string
}
