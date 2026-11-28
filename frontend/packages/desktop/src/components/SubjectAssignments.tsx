/**
 * Задания, прикреплённые к предмету (#165): те же карточки, что в «Заданиях»,
 * только по одному предмету. Клик открывает ту же карточку задания — там можно
 * сменить статус, проголосовать, отредактировать.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import { useGroupContext, useTasks, useUpdateTask, useVoteAssignment } from '@nexora/shared'
import type { Task } from '@nexora/shared'
import { Badge, Card, Icon } from './ui'
import { AssignmentDetailModal } from './AssignmentDetailModal'
import { useT, type MessageKey } from '../i18n'
import { formatDeadline, isOverdue, PRIORITY_BADGE_VARIANT, PRIORITY_LABELS } from '../types/assignments'

const STATE_LABEL: Record<string, MessageKey> = {
  todo: 'assign.col.todo',
  doing: 'assign.col.todo',
  review: 'assign.col.review',
  done: 'assign.col.done',
}

const STATE_DOT: Record<string, string> = {
  todo: 'bg-surface-300 dark:bg-surface-600',
  doing: 'bg-surface-300 dark:bg-surface-600',
  review: 'bg-warning-500',
  done: 'bg-success-500',
}

/** Несделанные — сверху по дедлайну, сделанные — вниз. */
function order(a: Task, b: Task): number {
  const da = a.state === 'done' ? 1 : 0
  const db = b.state === 'done' ? 1 : 0
  if (da !== db) return da - db
  return new Date(a.assignment.deadline).getTime() - new Date(b.assignment.deadline).getTime()
}

export function SubjectAssignments({ subjectId }: { subjectId: string }) {
  const { t } = useT()
  const { groupId } = useGroupContext()
  const tasksQuery = useTasks({ group_id: groupId ?? '' })
  const updateTask = useUpdateTask()
  const vote = useVoteAssignment()
  const [openId, setOpenId] = useState<string | null>(null)

  const tasks = useMemo(
    () => (tasksQuery.data ?? []).filter((x) => x.assignment.subject.id === subjectId).sort(order),
    [tasksQuery.data, subjectId],
  )
  // Берём задание из свежих данных: после смены статуса карточка не устаревает
  const selected = tasks.find((x) => x.id === openId) ?? null
  const left = tasks.filter((x) => x.state !== 'done').length

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
          {t('subjects.assignments')}
          {tasks.length > 0 && (
            <span className="ml-2 font-normal text-surface-400">{t('subjects.assignmentsLeft', { n: left, total: tasks.length })}</span>
          )}
        </h2>
        <Link to={`/assignments?subject=${subjectId}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400">
          {t('subjects.assignmentsAll')}<Icon name="arrow-right" size={12} />
        </Link>
      </div>

      {tasksQuery.isLoading ? (
        <p className="px-4 pb-4 text-sm text-surface-400">…</p>
      ) : tasks.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-surface-400">{t('subjects.assignmentsEmpty')}</p>
      ) : (
        <ul className="divide-y divide-surface-100 dark:divide-surface-700">
          {tasks.map((task) => {
            const a = task.assignment
            const done = task.state === 'done'
            const overdue = !done && isOverdue(a.deadline)
            return (
              <li key={task.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(task.id)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/60"
                >
                  <span className={clsx('h-2 w-2 shrink-0 rounded-full', STATE_DOT[task.state] ?? STATE_DOT.todo)} title={t(STATE_LABEL[task.state] ?? 'assign.col.todo')} />
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block truncate text-sm font-medium', done ? 'text-surface-400 line-through' : 'text-surface-900 dark:text-surface-50')}>
                      {a.title}
                    </span>
                    <span className="block text-xs text-surface-400">
                      {t(STATE_LABEL[task.state] ?? 'assign.col.todo')}
                      {a.is_personal && ` · ${t('subjects.personal')}`}
                    </span>
                  </span>
                  {a.priority !== 'normal' && a.priority !== 'low' && (
                    <Badge variant={PRIORITY_BADGE_VARIANT[a.priority]}>{t(PRIORITY_LABELS[a.priority])}</Badge>
                  )}
                  {a.link && <Icon name="link" size={14} className="shrink-0 text-surface-400" />}
                  <span className={clsx('shrink-0 text-xs tabular-nums', overdue ? 'font-semibold text-danger-600 dark:text-danger-500' : 'text-surface-500 dark:text-surface-400')}>
                    {overdue ? t('assign.overdue') : formatDeadline(a.deadline)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <AssignmentDetailModal
        task={selected}
        onClose={() => setOpenId(null)}
        onStateChange={(_, state) => {
          if (selected) updateTask.mutate({ assignmentId: selected.assignment.id, data: { state } })
          setOpenId(null)
        }}
        onVote={(assignmentId, v) => vote.mutate({ id: assignmentId, data: { vote: v } })}
      />
    </Card>
  )
}
