/** Раздел «Предметы» (#165) */

export type WorkKind = 'lab' | 'practice' | 'homework' | 'test' | 'coursework' | 'other'
export type MaterialKind = 'theory' | 'presentation' | 'manual' | 'lecture' | 'recording' | 'other'
export type ContentStatus = 'approved' | 'pending'

export interface SemesterOption {
  number: number
  course: number
  autumn: boolean
  is_current: boolean
  subjects: number
}

export interface SubjectDeadline {
  title: string
  date: string
  kind: 'work' | 'assignment'
  work_id: string | null
  assignment_id: string | null
}

export interface SubjectTag {
  tag: string
  key: string
  can_remove: boolean
}

export interface SubjectTagCount {
  tag: string
  key: string
  count: number
}

export interface SubjectSummary {
  id: string
  name: string
  is_custom: boolean
  tags: SubjectTag[]
  teachers: string[]
  lesson_types: string[]
  first_semester: number | null
  last_semester: number | null
  /** Таблица с оценками (#165) */
  grades_url?: string | null
  works_total: number
  works_passed: number
  points: number
  max_points: number
  required: number | null
  materials: number
  pending: number
  next_deadline: SubjectDeadline | null
}

export interface SubjectList {
  group_code: string
  can_write: boolean
  current_semester: number | null
  selected_semester: number | null
  semesters: SemesterOption[]
  subjects: SubjectSummary[]
  group_tags: SubjectTagCount[]
  tag_suggestions: string[]
}

export interface SubjectWorkView {
  id: string
  kind: WorkKind
  number: number | null
  title: string
  max_points: number | null
  deadline: string | null
  description: string | null
  url: string | null
  semester: number | null
  status: ContentStatus
  author_name: string | null
  is_mine: boolean
  passed: boolean
  points: number | null
}

export interface SubjectMaterialView {
  id: string
  kind: MaterialKind
  title: string
  url: string | null
  lecture_date: string | null
  semester: number | null
  status: ContentStatus
  author_name: string | null
  is_mine: boolean
}

export interface SubjectScheduleSlot {
  weekday: number
  pair_number: number
  start_time: string
  end_time: string
  lesson_type: string | null
  room: string | null
  location: string | null
  teacher: string | null
  link: string | null
  /** Период, в который идут пары (YYYY-MM-DD) */
  date_from?: string | null
  date_to?: string | null
}

export interface SubjectLectureLink {
  title: string
  url: string
  source: 'schedule' | 'material'
  lecture_date: string | null
  /** Добавленная вручную лекция — сам материал (статус, правка) */
  material?: SubjectMaterialView | null
}

export interface SubjectDetail extends SubjectSummary {
  group_code: string | null
  can_moderate: boolean
  /** false — заявка в группу не подтверждена: только просмотр */
  can_write: boolean
  schedule: SubjectScheduleSlot[]
  works: SubjectWorkView[]
  materials_list: SubjectMaterialView[]
  lectures: SubjectLectureLink[]
  deadlines: SubjectDeadline[]
  required_left: number | null
}

export interface SubjectWorkInput {
  kind: WorkKind
  number?: number | null
  title: string
  max_points?: number | null
  deadline?: string | null
  description?: string | null
  url?: string | null
  semester?: number | null
}

export interface SubjectMaterialInput {
  kind: MaterialKind
  title: string
  url: string
  lecture_date?: string | null
  semester?: number | null
}
