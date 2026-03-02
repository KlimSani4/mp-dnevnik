import { format, differenceInDays, addDays, isAfter, isBefore, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'

/* ─── Types ─── */

export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskState = 'todo' | 'doing' | 'review' | 'done'

export interface Subject {
  id: string
  name: string
}

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
  subject: Subject
  created_at: string
}

export interface Task {
  id: string
  state: TaskState
  assignment: Assignment
  updated_at: string
}

/* ─── Constants ─── */

export const SUBJECTS: Subject[] = [
  { id: 's1', name: 'Проектная деятельность' },
  { id: 's2', name: 'Методы МО' },
  { id: 's3', name: 'Тестирование ПО' },
  { id: 's4', name: 'История России' },
  { id: 's5', name: 'Иностранный язык' },
  { id: 's6', name: 'Трансляция и компиляция' },
]

export const AUTHORS: Record<string, string> = {
  a1: 'Анатолий Жмышенко',
  a2: 'Виктория Кравцова',
  a3: 'Дмитрий Смирнов',
  a4: 'Елена Петрова',
}

export const COLUMNS: { key: TaskState; label: string }[] = [
  { key: 'todo', label: 'Нужно сделать' },
  { key: 'doing', label: 'В работе' },
  { key: 'review', label: 'На проверке' },
  { key: 'done', label: 'Зачтено' },
]

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный',
}

export const PRIORITY_BADGE_VARIANT: Record<Priority, 'default' | 'normal' | 'high' | 'urgent'> = {
  low: 'default',
  normal: 'normal',
  high: 'high',
  urgent: 'urgent',
}

export const DEADLINE_FILTER_OPTIONS = [
  { value: '', label: 'Все сроки' },
  { value: 'burning', label: 'Горит на этой неделе' },
  { value: 'this-month', label: 'В этом месяце' },
  { value: 'hide-overdue', label: 'Без просроченных' },
]

export const COLUMN_COLORS: Record<string, string> = {
  todo: 'border-t-blue-500',
  doing: 'border-t-violet-500',
  review: 'border-t-amber-500',
  done: 'border-t-green-500',
}

export const COLUMN_COUNT_COLORS: Record<string, string> = {
  todo: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  doing: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  review: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  done: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400',
}

export const PRIORITY_BORDER_COLORS: Record<Priority, string> = {
  urgent: 'border-l-danger-500',
  high: 'border-l-warning-500',
  normal: 'border-l-info-500',
  low: 'border-l-surface-300 dark:border-l-surface-600',
}

/* ─── Helpers ─── */

export function today() {
  return startOfDay(new Date())
}

export function isBurning(deadline: string): boolean {
  const dl = startOfDay(new Date(deadline))
  const now = today()
  return (isBefore(dl, addDays(now, 4)) && isAfter(dl, addDays(now, -1))) || differenceInDays(dl, now) < 0
}

export function isOverdue(deadline: string): boolean {
  return isBefore(startOfDay(new Date(deadline)), today())
}

export function formatDeadline(deadline: string): string {
  return format(new Date(deadline), 'd MMMM yyyy', { locale: ru })
}

export function daysLeft(deadline: string): number {
  return differenceInDays(startOfDay(new Date(deadline)), today())
}

export function getDayWord(n: number): string {
  const abs = Math.abs(n)
  if (abs % 10 === 1 && abs % 100 !== 11) return 'день'
  if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100)) return 'дня'
  return 'дней'
}

/* ─── Mock Data ─── */

export function createMockTasks(): Task[] {
  const now = new Date()

  return [
    {
      id: 't1',
      state: 'todo',
      updated_at: now.toISOString(),
      assignment: {
        id: 'a1',
        title: 'Спринт 3 — CI/CD пайплайн',
        description: 'Настроить GitHub Actions: lint, test, build, deploy. Написать Dockerfile и docker-compose. Добавить healthcheck.',
        deadline: addDays(now, 2).toISOString(),
        priority: 'urgent',
        link: null,
        votes_up: 5,
        votes_down: 1,
        is_verified: true,
        author_id: 'a1',
        subject: SUBJECTS[0],
        created_at: addDays(now, -3).toISOString(),
      },
    },
    {
      id: 't2',
      state: 'doing',
      updated_at: now.toISOString(),
      assignment: {
        id: 'a2',
        title: 'ЛР №3 — Градиентный спуск',
        description: 'Реализовать стохастический градиентный спуск для линейной регрессии. Сравнить с batch и mini-batch. Python + NumPy.',
        deadline: addDays(now, 5).toISOString(),
        priority: 'high',
        link: 'https://lms.mospolytech.ru/mod/assign/view.php?id=12345',
        votes_up: 3,
        votes_down: 0,
        is_verified: true,
        author_id: 'a2',
        subject: SUBJECTS[1],
        created_at: addDays(now, -5).toISOString(),
      },
    },
    {
      id: 't3',
      state: 'doing',
      updated_at: now.toISOString(),
      assignment: {
        id: 'a3',
        title: 'Эссе — My Future Profession',
        description: 'Написать эссе на 250-300 слов о будущей профессии. Использовать Present Simple и Future Simple.',
        deadline: addDays(now, 10).toISOString(),
        priority: 'normal',
        link: null,
        votes_up: 1,
        votes_down: 0,
        is_verified: false,
        author_id: 'a3',
        subject: SUBJECTS[4],
        created_at: addDays(now, -1).toISOString(),
      },
    },
    {
      id: 't4',
      state: 'todo',
      updated_at: now.toISOString(),
      assignment: {
        id: 'a4',
        title: 'ЛР №2 — Unit-тестирование',
        description: 'Покрыть unit-тестами модуль авторизации. pytest + coverage ≥ 80%. Мутационное тестирование через mutmut.',
        deadline: addDays(now, 1).toISOString(),
        priority: 'urgent',
        link: null,
        votes_up: 7,
        votes_down: 2,
        is_verified: true,
        author_id: 'a4',
        subject: SUBJECTS[2],
        created_at: addDays(now, -7).toISOString(),
      },
    },
    {
      id: 't5',
      state: 'review',
      updated_at: addDays(now, -1).toISOString(),
      assignment: {
        id: 'a5',
        title: 'Реферат — Реформы Петра I',
        description: 'Реферат 15-20 страниц. Структура: введение, 3 главы, заключение. Источники — не менее 10. ГОСТ оформления.',
        deadline: addDays(now, 14).toISOString(),
        priority: 'high',
        link: null,
        votes_up: 4,
        votes_down: 0,
        is_verified: true,
        author_id: 'a1',
        subject: SUBJECTS[3],
        created_at: addDays(now, -14).toISOString(),
      },
    },
    {
      id: 't6',
      state: 'review',
      updated_at: addDays(now, -2).toISOString(),
      assignment: {
        id: 'a6',
        title: 'ЛР №4 — Лексический анализатор',
        description: 'Реализовать лексер для подмножества языка C. Токенизация: ключевые слова, идентификаторы, литералы, операторы.',
        deadline: addDays(now, -1).toISOString(),
        priority: 'normal',
        link: null,
        votes_up: 2,
        votes_down: 1,
        is_verified: false,
        author_id: 'a2',
        subject: SUBJECTS[5],
        created_at: addDays(now, -10).toISOString(),
      },
    },
    {
      id: 't7',
      state: 'review',
      updated_at: addDays(now, -1).toISOString(),
      assignment: {
        id: 'a7',
        title: 'Спринт 2 — MVP бэкенд',
        description: 'REST API для CRUD заданий. FastAPI + SQLAlchemy async + PostgreSQL. Swagger документация.',
        deadline: addDays(now, 3).toISOString(),
        priority: 'normal',
        link: 'https://github.com/student/nexora-api',
        votes_up: 3,
        votes_down: 0,
        is_verified: true,
        author_id: 'a3',
        subject: SUBJECTS[0],
        created_at: addDays(now, -8).toISOString(),
      },
    },
    {
      id: 't8',
      state: 'done',
      updated_at: addDays(now, -3).toISOString(),
      assignment: {
        id: 'a8',
        title: 'ЛР №1 — Smoke-тестирование',
        description: 'Написать smoke-тесты для веб-приложения. Selenium + Python. Отчёт по шаблону.',
        deadline: addDays(now, -5).toISOString(),
        priority: 'normal',
        link: null,
        votes_up: 2,
        votes_down: 0,
        is_verified: true,
        author_id: 'a4',
        subject: SUBJECTS[2],
        created_at: addDays(now, -20).toISOString(),
      },
    },
    {
      id: 't9',
      state: 'done',
      updated_at: addDays(now, -5).toISOString(),
      assignment: {
        id: 'a9',
        title: 'ЛР №2 — Деревья решений',
        description: 'Обучить модель Decision Tree на датасете Iris. Визуализация дерева, confusion matrix, accuracy.',
        deadline: addDays(now, -10).toISOString(),
        priority: 'high',
        link: null,
        votes_up: 6,
        votes_down: 1,
        is_verified: true,
        author_id: 'a1',
        subject: SUBJECTS[1],
        created_at: addDays(now, -25).toISOString(),
      },
    },
    {
      id: 't10',
      state: 'done',
      updated_at: addDays(now, -2).toISOString(),
      assignment: {
        id: 'a10',
        title: 'ЛР №3 — Синтаксический анализ',
        description: 'Реализовать рекурсивный нисходящий парсер для арифметических выражений. Построение AST.',
        deadline: addDays(now, -3).toISOString(),
        priority: 'normal',
        link: 'https://github.com/student/parser-lab',
        votes_up: 4,
        votes_down: 0,
        is_verified: true,
        author_id: 'a2',
        subject: SUBJECTS[5],
        created_at: addDays(now, -15).toISOString(),
      },
    },
    {
      id: 't11',
      state: 'done',
      updated_at: addDays(now, -4).toISOString(),
      assignment: {
        id: 'a11',
        title: 'Презентация — British Education',
        description: 'Подготовить презентацию на 10 слайдов о системе образования в Великобритании.',
        deadline: addDays(now, -7).toISOString(),
        priority: 'low',
        link: null,
        votes_up: 1,
        votes_down: 0,
        is_verified: false,
        author_id: 'a3',
        subject: SUBJECTS[4],
        created_at: addDays(now, -18).toISOString(),
      },
    },
    {
      id: 't12',
      state: 'todo',
      updated_at: now.toISOString(),
      assignment: {
        id: 'a12',
        title: 'ПЗ — Холодная война',
        description: 'Подготовить доклад на 5-7 минут. Карибский кризис, гонка вооружений, разрядка. Презентация обязательна.',
        deadline: addDays(now, -2).toISOString(),
        priority: 'high',
        link: null,
        votes_up: 3,
        votes_down: 0,
        is_verified: true,
        author_id: 'a4',
        subject: SUBJECTS[3],
        created_at: addDays(now, -12).toISOString(),
      },
    },
  ]
}
