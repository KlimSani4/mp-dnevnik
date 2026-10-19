import { format, differenceInDays, addDays, isAfter, isBefore, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'

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

export const COLUMNS: { key: TaskState; label: string }[] = [
  { key: 'todo', label: 'Нужно сделать' },
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
  review: 'border-t-amber-500',
  done: 'border-t-green-500',
}

export const COLUMN_COUNT_COLORS: Record<string, string> = {
  todo: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
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
