import { format, differenceInDays, addDays, isAfter, isBefore, startOfDay } from 'date-fns'
import { dateLocale, translatePlural, type MessageKey } from '../i18n'

/* ─── Types ─── */

export type Priority = 'low' | 'normal' | 'high' | 'urgent'
export type TaskState = 'todo' | 'review' | 'done'

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

// label — ключ перевода: в компонентах выводить через t(label)
export const COLUMNS: { key: TaskState; label: MessageKey }[] = [
  { key: 'todo', label: 'assign.col.todo' },
  { key: 'review', label: 'assign.col.review' },
  { key: 'done', label: 'assign.col.done' },
]

export const PRIORITY_LABELS: Record<Priority, MessageKey> = {
  low: 'assign.priority.low',
  normal: 'assign.priority.normal',
  high: 'assign.priority.high',
  urgent: 'assign.priority.urgent',
}

export const PRIORITY_BADGE_VARIANT: Record<Priority, 'default' | 'normal' | 'high' | 'urgent'> = {
  low: 'default',
  normal: 'normal',
  high: 'high',
  urgent: 'urgent',
}

export const DEADLINE_FILTER_OPTIONS: { value: string; label: MessageKey }[] = [
  { value: '', label: 'assign.filter.allDeadlines' },
  { value: 'burning', label: 'assign.filter.burning' },
  { value: 'this-month', label: 'assign.filter.thisMonth' },
  { value: 'hide-overdue', label: 'assign.filter.hideOverdue' },
]

export const COLUMN_COLORS: Record<string, string> = {
  todo: 'border-t-blue-500',
  review: 'border-t-amber-500',
  done: 'border-t-green-500',
}

export const COLUMN_COUNT_COLORS: Record<string, string> = {
  todo: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  review: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  done: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400',
}

export const PRIORITY_BORDER_COLORS: Record<Priority, string> = {
  urgent: 'border-danger-500/60 bg-danger-50/60 after:border-danger-500/60 dark:border-danger-500/70 dark:bg-danger-500/10 dark:after:border-danger-500/70',
  high: 'border-warning-500/60 bg-warning-50/60 after:border-warning-500/60 dark:border-warning-500/70 dark:bg-warning-500/10 dark:after:border-warning-500/70',
  normal: 'border-info-500/50 bg-info-50/60 after:border-info-500/50 dark:border-info-500/60 dark:bg-info-500/10 dark:after:border-info-500/60',
  low: 'border-surface-300 bg-surface-50 after:border-surface-300 dark:border-surface-600 dark:bg-surface-800/60 dark:after:border-surface-600',
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
  return format(new Date(deadline), 'd MMMM yyyy', { locale: dateLocale() })
}

export function daysLeft(deadline: string): number {
  return differenceInDays(startOfDay(new Date(deadline)), today())
}

/** «день / дня / дней» или «day / days» для числа n на текущем языке. */
export function getDayWord(n: number): string {
  return translatePlural('plural.dayWord', n)
}

/* ─── Приоритет: цвет и значок для каждого уровня (#102) ─── */

export const PRIORITY_ORDER: Priority[] = ['low', 'normal', 'high', 'urgent']

export const PRIORITY_META: Record<
  Priority,
  { icon: string; hint: MessageKey; tile: string; field: string }
> = {
  low: {
    icon: 'chevrons-down',
    hint: 'assign.priority.low.hint',
    tile: 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-300',
    field: '!border-surface-300 dark:!border-surface-600',
  },
  normal: {
    icon: 'minus',
    hint: 'assign.priority.normal.hint',
    tile: 'bg-info-100 text-info-600 dark:bg-info-500/15 dark:text-info-500',
    field: '!border-info-500/60',
  },
  high: {
    icon: 'chevrons-up',
    hint: 'assign.priority.high.hint',
    tile: 'bg-warning-100 text-warning-600 dark:bg-warning-500/15 dark:text-warning-500',
    field: '!border-warning-500/70 !bg-warning-50/60 dark:!bg-warning-500/5',
  },
  urgent: {
    icon: 'flame',
    hint: 'assign.priority.urgent.hint',
    tile: 'bg-danger-100 text-danger-600 dark:bg-danger-500/15 dark:text-danger-500',
    field: '!border-danger-500/70 !bg-danger-50/60 dark:!bg-danger-500/5',
  },
}
