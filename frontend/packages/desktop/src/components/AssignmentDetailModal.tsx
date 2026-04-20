import clsx from 'clsx'
import { format, formatDistanceToNow, isPast, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Modal, Button, Badge, Avatar, Icon } from './ui'
import {
  type Priority,
  type TaskState,
  type Task,
  PRIORITY_LABELS,
  PRIORITY_BADGE_VARIANT,
  AUTHORS,
} from '../types/assignments'

/* ─── Types ─── */

interface AssignmentDetailModalProps {
  task: Task | null
  onClose: () => void
  onStateChange: (taskId: string, newState: TaskState) => void
  onVote: (assignmentId: string, vote: 1 | -1) => void
  userVote?: 1 | -1 | null
}

/* ─── Constants ─── */

const STATE_LABELS: Record<TaskState, string> = {
  todo: 'Нужно сделать',
  doing: 'В работе',
  review: 'На проверке',
  done: 'Зачтено',
}

/* ─── Helpers ─── */

function formatDeadline(deadline: string): string {
  return format(new Date(deadline), 'd MMMM yyyy, HH:mm', { locale: ru })
}

function formatDeadlineShort(deadline: string): string {
  return format(new Date(deadline), 'd MMM yyyy', { locale: ru })
}

function formatCreatedAt(date: string): string {
  return format(new Date(date), 'd MMMM yyyy', { locale: ru })
}

function getRelativeDeadline(deadline: string): string {
  const dl = startOfDay(new Date(deadline))
  if (isPast(dl)) {
    return `Просрочено ${formatDistanceToNow(dl, { locale: ru, addSuffix: true })}`
  }
  return `Осталось ${formatDistanceToNow(dl, { locale: ru })}`
}

function isOverdue(deadline: string): boolean {
  return isPast(startOfDay(new Date(deadline)))
}

function pluralize(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n)
  if (abs % 10 === 1 && abs % 100 !== 11) return forms[0]
  if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100)) return forms[1]
  return forms[2]
}

/* ─── Component ─── */

function AssignmentDetailModal({
  task,
  onClose,
  onStateChange,
  onVote,
  userVote = null,
}: AssignmentDetailModalProps) {
  if (!task) return null

  const { assignment } = task
  const overdue = isOverdue(assignment.deadline)
  const authorName = AUTHORS[assignment.author_id] ?? 'Неизвестный'

  return (
    <Modal open={!!task} onClose={onClose} className="!max-w-2xl">
      {/* ─── Custom Header ─── */}
      <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-surface-200 dark:border-surface-700">
        <div className="flex-1 min-w-0 pr-4">
          {/* Subject name */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-primary-500 dark:text-primary-400">
              {assignment.subject.name}
            </span>
            {assignment.is_verified && (
              <Badge variant="verified" size="sm">
                <Icon name="check" size={10} className="mr-0.5" />
                Подтверждено
              </Badge>
            )}
          </div>

          {/* Title */}
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 leading-tight mb-3">
            {assignment.title}
          </h2>

          {/* Tags row: deadline + priority + state */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Deadline tag */}
            <div
              className={clsx(
                'inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg',
                overdue
                  ? 'bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400'
                  : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
              )}
            >
              <Icon name="clock" size={14} />
              <span>{formatDeadlineShort(assignment.deadline)}</span>
            </div>

            {/* Priority */}
            <Badge variant={PRIORITY_BADGE_VARIANT[assignment.priority]}>
              {PRIORITY_LABELS[assignment.priority]}
            </Badge>

            {/* Current state */}
            <Badge variant={task.state === 'done' ? 'success' : 'default'}>
              {STATE_LABELS[task.state]}
            </Badge>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="btn btn-ghost btn-icon shrink-0 -mt-1 -mr-2"
          aria-label="Закрыть"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      {/* ─── Body ─── */}
      <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto">
        {/* Votes Section */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-3">
            <span className="text-sm text-surface-700 dark:text-surface-300">
              <span className="font-semibold text-success-600 dark:text-success-400">
                {assignment.votes_up}
              </span>
              {' '}
              {pluralize(assignment.votes_up, ['подтвердил', 'подтвердили', 'подтвердили'])}
              {' / '}
              <span className="font-semibold text-danger-600 dark:text-danger-400">
                {assignment.votes_down}
              </span>
              {' '}
              {pluralize(assignment.votes_down, ['оспаривает', 'оспаривают', 'оспаривают'])}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onVote(assignment.id, 1)}
              className={clsx(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                userVote === 1
                  ? 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400 ring-1 ring-success-300 dark:ring-success-500/30'
                  : 'text-surface-500 hover:text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10 dark:hover:text-success-400',
              )}
              aria-label="Подтвердить"
            >
              <Icon name="thumbs-up" size={16} />
            </button>
            <button
              onClick={() => onVote(assignment.id, -1)}
              className={clsx(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
                userVote === -1
                  ? 'bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-400 ring-1 ring-danger-300 dark:ring-danger-500/30'
                  : 'text-surface-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10 dark:hover:text-danger-400',
              )}
              aria-label="Оспорить"
            >
              <Icon name="thumbs-down" size={16} />
            </button>
          </div>
        </div>

        {/* Deadline details */}
        <div className="flex items-center gap-2 text-sm">
          <Icon
            name="clock"
            size={16}
            className={clsx(
              overdue
                ? 'text-danger-500'
                : 'text-surface-400 dark:text-surface-500',
            )}
          />
          <span
            className={clsx(
              'font-medium',
              overdue
                ? 'text-danger-600 dark:text-danger-400'
                : 'text-surface-700 dark:text-surface-300',
            )}
          >
            {overdue ? 'Просрочено' : 'Дедлайн'}:{' '}
            {formatDeadline(assignment.deadline)}
          </span>
          <span className="text-xs text-surface-400 dark:text-surface-500">
            ({getRelativeDeadline(assignment.deadline)})
          </span>
        </div>

        {/* Description */}
        <div>
          <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 mb-2">
            Описание
          </h3>
          <p className="text-sm text-surface-600 dark:text-surface-400 leading-relaxed whitespace-pre-wrap">
            {assignment.description}
          </p>
        </div>

        {/* External Link */}
        {assignment.link && (
          <a
            href={assignment.link}
            target="_blank"
            rel="noopener noreferrer"
            className={clsx(
              'flex items-center gap-2 px-4 py-3 rounded-xl',
              'bg-primary-50 dark:bg-primary-500/10',
              'border border-primary-200 dark:border-primary-500/20',
              'text-primary-600 dark:text-primary-400',
              'hover:bg-primary-100 dark:hover:bg-primary-500/15',
              'transition-colors group',
            )}
          >
            <Icon name="link" size={16} className="shrink-0" />
            <span className="text-sm font-medium truncate flex-1">
              {assignment.link}
            </span>
            <Icon
              name="chevron-right"
              size={16}
              className="shrink-0 opacity-50 group-hover:opacity-100 transition-opacity"
            />
          </a>
        )}

        {/* Author + creation date */}
        <div className="flex items-center gap-3 pt-2 border-t border-surface-200 dark:border-surface-700">
          <Avatar name={authorName} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
              {authorName}
            </p>
            <p className="text-xs text-surface-400 dark:text-surface-500">
              Создано {formatCreatedAt(assignment.created_at)}
            </p>
          </div>
        </div>
      </div>

      {/* ─── Footer: Action Buttons ─── */}
      <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-200 dark:border-surface-700">
        {task.state === 'todo' && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Icon name="chevron-right" size={16} />}
              onClick={() => onStateChange(task.id, 'review')}
            >
              Сдал
            </Button>
          </>
        )}

        {task.state === 'doing' && (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Отмена
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Icon name="chevron-right" size={16} />}
              onClick={() => onStateChange(task.id, 'review')}
            >
              Сдал
            </Button>
          </>
        )}

        {task.state === 'review' && (
          <>
            <Button
              variant="danger"
              size="sm"
              icon={<Icon name="x" size={16} />}
              onClick={() => onStateChange(task.id, 'todo')}
            >
              Не сдал
            </Button>
            <Button
              variant="success"
              size="sm"
              icon={<Icon name="check" size={16} />}
              onClick={() => onStateChange(task.id, 'done')}
            >
              Зачтено
            </Button>
          </>
        )}

        {task.state === 'done' && (
          <>
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon name="chevron-left" size={16} />}
              onClick={() => onStateChange(task.id, 'todo')}
            >
              Вернуть в работу
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
            >
              Закрыть
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

export { AssignmentDetailModal }
export type { AssignmentDetailModalProps }
