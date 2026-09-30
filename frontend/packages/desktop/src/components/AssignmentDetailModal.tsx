import clsx from 'clsx'
import { format, formatDistanceToNow, isPast, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'
import { useState, useCallback } from 'react'
import { Modal, Button, Badge, Avatar, Icon, Input, Select } from './ui'
import { useUpdateAssignment, useDeleteAssignment } from '@nexora/shared'
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
  review: 'На проверке',
  done: 'Зачтено',
}

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Низкий' },
  { value: 'normal', label: 'Обычный' },
  { value: 'high', label: 'Высокий' },
  { value: 'urgent', label: 'Срочный' },
]

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

/** Format ISO datetime → date string for <input type="date"> */
function isoToDateInput(iso: string): string {
  return iso.slice(0, 10)
}

/* ─── Component ─── */

function AssignmentDetailModal({
  task,
  onClose,
  onStateChange,
  onVote,
  userVote = null,
}: AssignmentDetailModalProps) {
  const updateAssignment = useUpdateAssignment()
  const deleteAssignment = useDeleteAssignment()

  const [editMode, setEditMode] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Edit form state — initialised when task changes
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editDeadline, setEditDeadline] = useState('')
  const [editPriority, setEditPriority] = useState<string>('normal')
  const [editLink, setEditLink] = useState('')

  const enterEditMode = useCallback(() => {
    if (!task) return
    const a = task.assignment
    setEditTitle(a.title)
    setEditDescription(a.description ?? '')
    setEditDeadline(isoToDateInput(a.deadline))
    setEditPriority(a.priority)
    setEditLink(a.link ?? '')
    setEditMode(true)
  }, [task])

  const cancelEdit = useCallback(() => {
    setEditMode(false)
  }, [])

  const handleSave = useCallback(() => {
    if (!task) return
    updateAssignment.mutate(
      {
        id: task.assignment.id,
        data: {
          title: editTitle.trim(),
          description: editDescription.trim() || undefined,
          deadline: editDeadline ? new Date(editDeadline).toISOString() : undefined,
          priority: editPriority as Priority,
          link: editLink.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditMode(false)
        },
      },
    )
  }, [task, updateAssignment, editTitle, editDescription, editDeadline, editPriority, editLink])

  const handleDelete = useCallback(() => {
    if (!task) return
    deleteAssignment.mutate(task.assignment.id, {
      onSuccess: () => {
        setShowDeleteConfirm(false)
        onClose()
      },
    })
  }, [task, deleteAssignment, onClose])

  const handleClose = useCallback(() => {
    setEditMode(false)
    setShowDeleteConfirm(false)
    onClose()
  }, [onClose])

  if (!task) return null

  const { assignment } = task
  const overdue = isOverdue(assignment.deadline)
  const authorName = AUTHORS[assignment.author_id] ?? 'Неизвестный'

  /* ─── Delete confirm dialog ─── */
  if (showDeleteConfirm) {
    return (
      <Modal open onClose={() => setShowDeleteConfirm(false)} className="!max-w-sm">
        <div className="px-6 py-5 text-center space-y-3">
          <div className="mx-auto w-12 h-12 rounded-full bg-danger-50 dark:bg-danger-500/10 flex items-center justify-center">
            <Icon name="trash-2" size={22} className="text-danger-500" />
          </div>
          <h3 className="text-base font-semibold text-surface-900 dark:text-surface-50">
            Удалить задание?
          </h3>
          <p className="text-sm text-surface-500 dark:text-surface-400">
            Это действие нельзя отменить
          </p>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 pb-5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDeleteConfirm(false)}
          >
            Отмена
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon={<Icon name="trash-2" size={16} />}
            onClick={handleDelete}
          >
            {deleteAssignment.isPending ? 'Удаление...' : 'Удалить'}
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open={!!task} onClose={handleClose} className="!max-w-2xl">
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

          {!editMode && (
            <>
              {/* Title */}
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 leading-tight mb-3">
                {assignment.title}
              </h2>

              {/* Tags row: deadline + priority + state */}
              <div className="flex flex-wrap items-center gap-2">
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
                <Badge variant={PRIORITY_BADGE_VARIANT[assignment.priority]}>
                  {PRIORITY_LABELS[assignment.priority]}
                </Badge>
                <Badge variant={task.state === 'done' ? 'success' : 'default'}>
                  {STATE_LABELS[task.state]}
                </Badge>
              </div>
            </>
          )}

          {editMode && (
            <p className="text-sm text-surface-500 dark:text-surface-400">Редактирование задания</p>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          className="btn btn-ghost btn-icon shrink-0 -mt-1 -mr-2"
          aria-label="Закрыть"
        >
          <Icon name="x" size={20} />
        </button>
      </div>

      {/* ─── Body ─── */}
      <div className="px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto">
        {editMode ? (
          /* ─── Edit form ─── */
          <div className="space-y-4">
            <Input
              label="Название"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Название задания"
            />
            <div className="flex flex-col gap-1">
              <label
                htmlFor="edit-description"
                className="text-sm font-medium text-surface-700 dark:text-surface-300"
              >
                Описание
              </label>
              <textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Что нужно сделать..."
                rows={4}
                className="input resize-none"
              />
            </div>
            <Input
              label="Дедлайн"
              type="date"
              value={editDeadline}
              onChange={(e) => setEditDeadline(e.target.value)}
            />
            <Select
              label="Приоритет"
              options={PRIORITY_OPTIONS}
              value={editPriority}
              onChange={setEditPriority}
            />
            <Input
              label="Ссылка на задание"
              type="url"
              value={editLink}
              onChange={(e) => setEditLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
        ) : (
          /* ─── View mode ─── */
          <>
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
          </>
        )}
      </div>

      {/* ─── Footer ─── */}
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-surface-200 dark:border-surface-700">
        {/* Left side: edit/delete controls */}
        <div className="flex items-center gap-2">
          {!editMode && (
            <>
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon name="pencil" size={14} />}
                onClick={enterEditMode}
              >
                Редактировать
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon name="trash-2" size={14} />}
                onClick={() => setShowDeleteConfirm(true)}
                className="!text-danger-500 hover:!bg-danger-50 dark:hover:!bg-danger-500/10"
              >
                Удалить
              </Button>
            </>
          )}
        </div>

        {/* Right side: state actions or edit save/cancel */}
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button variant="secondary" size="sm" onClick={cancelEdit}>
                Отмена
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
              >
                {updateAssignment.isPending ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </>
          ) : (
            <>
              {task.state === 'todo' && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleClose}
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
                    onClick={handleClose}
                  >
                    Закрыть
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export { AssignmentDetailModal }
export type { AssignmentDetailModalProps }
