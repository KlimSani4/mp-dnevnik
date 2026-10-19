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
} from '../types/assignments'
import { useAuthorName } from '../hooks/useAuthorName'

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

  const authorName = useAuthorName(task?.assignment.author_id) ?? 'Неизвестный'

  if (!task) return null

  const { assignment } = task
  const actionState: TaskState = task.state === 'review' || task.state === 'done' ? task.state : 'todo'
  const overdue = isOverdue(assignment.deadline)

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
    <Modal open={!!task} onClose={handleClose} hideCloseButton scrollOnOverflow className="!max-w-2xl !overflow-visible !rounded-2xl !border-[#d4d4d4] !bg-[#eeeeee] dark:!border-surface-700 dark:!bg-surface-900">
      <div className="-mx-6 -my-4 relative">
        {/* ─── Custom Header ─── */}
      <div className="mx-2 mt-2 flex items-start justify-between rounded-2xl bg-white px-4 pt-5 pb-4 dark:bg-surface-800">
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
                <Badge variant={actionState === 'done' ? 'success' : 'default'}>
                  {STATE_LABELS[actionState]}
                </Badge>
              </div>
            </>
          )}

          {editMode && (
            <p className="text-sm text-surface-500 dark:text-surface-400">Редактирование задания</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Закрыть"
          className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-200 bg-surface-50 text-surface-600 transition hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600"
        >
          <Icon name="x" size={18} />
        </button>
      </div>

      {/* ─── Body ─── */}
      <div className="space-y-2 bg-[#eeeeee] px-2 py-3 dark:bg-surface-900">
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
            <div className="flex items-center justify-between rounded-2xl bg-white p-3 shadow-sm dark:bg-surface-800">
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
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 text-sm shadow-sm dark:bg-surface-800">
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
            <div className="rounded-2xl bg-white p-3 shadow-sm dark:bg-surface-800">
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
            <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-surface-800">
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
      <div className="mx-2 mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        {/* Edit and delete controls */}
        {!editMode && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white p-2 shadow-sm dark:bg-surface-800">
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
          </div>
        )}

        {/* State actions or edit save/cancel */}
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl bg-white p-2 shadow-sm dark:bg-surface-800">
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
              {actionState === 'todo' && (
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

              {actionState === 'review' && (
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

              {actionState === 'done' && (
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
    </div>
    </Modal>
  )
}

export { AssignmentDetailModal }
export type { AssignmentDetailModalProps }
