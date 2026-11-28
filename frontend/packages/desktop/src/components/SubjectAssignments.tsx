/**
 * «Работы и задания» на странице предмета (#165).
 *
 * Работа и задание — одно и то же: задание с типом (лаба, практика, ДЗ, КР…).
 * Галочка — «Зачтено» в один клик, клик по строке — полная карточка задания
 * (статус, балл, голоса, правка). Лабы считаются в допуск, «Сдал» в очереди
 * отмечает их сам.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  useCreateAssignment,
  useGroupContext,
  useGroupSubjects,
  useTasks,
  useUpdateTask,
  useVoteAssignment,
} from '@nexora/shared'
import type { Task, WorkKind } from '@nexora/shared'
import { Badge, Button, Card, Icon } from './ui'
import { AssignmentDetailModal } from './AssignmentDetailModal'
import { CreateAssignmentModal, toCreateRequest } from './CreateAssignmentModal'
import { useT, type MessageKey } from '../i18n'
import { fmt } from '../pages/SubjectsPage'
import {
  formatDeadline,
  isOverdue,
  PRIORITY_BADGE_VARIANT,
  PRIORITY_LABELS,
  WORK_KINDS,
  workLabel,
} from '../types/assignments'

const STATE_LABEL: Record<string, MessageKey> = {
  todo: 'assign.col.todo',
  doing: 'assign.col.todo',
  review: 'assign.col.review',
  done: 'assign.col.done',
}

/** Фильтр по типу: «task» — обычные задания без типа */
type KindFilter = 'all' | 'task' | WorkKind

/** Несделанные сверху; дальше по дедлайну (без него — в конце), потом по номеру. */
function order(a: Task, b: Task): number {
  const da = a.state === 'done' ? 1 : 0
  const db = b.state === 'done' ? 1 : 0
  if (da !== db) return da - db
  const ta = a.assignment.deadline ? new Date(a.assignment.deadline).getTime() : Number.MAX_SAFE_INTEGER
  const tb = b.assignment.deadline ? new Date(b.assignment.deadline).getTime() : Number.MAX_SAFE_INTEGER
  if (ta !== tb) return ta - tb
  return (a.assignment.number ?? 999) - (b.assignment.number ?? 999)
}

export function SubjectAssignments({ subjectId, canWrite }: { subjectId: string; canWrite: boolean }) {
  const { t } = useT()
  const { groupId, groupCode } = useGroupContext()
  const tasksQuery = useTasks({ group_id: groupId ?? '' })
  const subjects = useGroupSubjects(groupCode ?? undefined).data ?? []
  const updateTask = useUpdateTask()
  const vote = useVoteAssignment()
  const create = useCreateAssignment()
  const [openId, setOpenId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<KindFilter>('all')

  const all = useMemo(
    () => (tasksQuery.data ?? []).filter((x) => x.assignment.subject.id === subjectId).sort(order),
    [tasksQuery.data, subjectId],
  )
  const counts = useMemo(() => {
    const c = new Map<KindFilter, number>()
    for (const x of all) {
      const k: KindFilter = x.assignment.kind ?? 'task'
      c.set(k, (c.get(k) ?? 0) + 1)
    }
    return c
  }, [all])
  const tasks = filter === 'all' ? all : all.filter((x) => (x.assignment.kind ?? 'task') === filter)
  // id задачи без статуса генерируется заново на каждый запрос — держимся за id задания
  const selected = all.find((x) => x.assignment.id === openId) ?? null
  const left = all.filter((x) => x.state !== 'done').length
  const chips = (['all', ...WORK_KINDS, 'task'] as KindFilter[]).filter((k) => k === 'all' || counts.has(k))

  const toggleDone = (task: Task) =>
    updateTask.mutate({
      assignmentId: task.assignment.id,
      data: { state: task.state === 'done' ? 'todo' : 'done' },
    })

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
          {t('subjects.worksTitle')}
          {all.length > 0 && (
            <span className="ml-2 font-normal text-surface-400">{t('subjects.assignmentsLeft', { n: left, total: all.length })}</span>
          )}
        </h2>
        <div className="flex items-center gap-3">
          <Link to={`/assignments?subject=${subjectId}`} className="inline-flex items-center gap-1 text-xs font-medium text-surface-500 hover:text-primary-600 dark:text-surface-400">
            {t('subjects.assignmentsAll')}<Icon name="arrow-right" size={12} />
          </Link>
          {canWrite && groupId && (
            <Button size="sm" variant="secondary" icon={<Icon name="plus" size={14} />} onClick={() => setCreating(true)}>
              {t('subjects.add')}
            </Button>
          )}
        </div>
      </div>

      {chips.length > 2 && (
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {chips.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={clsx(
                'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                filter === k
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-300',
              )}
            >
              {k === 'all' ? t('subjects.kindAll') : t(k === 'task' ? 'subjects.kindTasks' : (`subjects.kindPlural.${k}` as MessageKey))}
              {k !== 'all' && <span className="ml-1 opacity-70">{counts.get(k)}</span>}
            </button>
          ))}
        </div>
      )}

      {tasksQuery.isLoading ? (
        <p className="px-4 pb-4 text-sm text-surface-400">…</p>
      ) : tasks.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-surface-400">{t('subjects.worksEmptyNew')}</p>
      ) : (
        <ul className="divide-y divide-surface-100 dark:divide-surface-700">
          {tasks.map((task) => {
            const a = task.assignment
            const done = task.state === 'done'
            const overdue = !done && isOverdue(a.deadline)
            return (
              <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-50 dark:hover:bg-surface-800/60">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={done}
                  aria-label={t('subjects.markDone')}
                  title={t('subjects.markDone')}
                  disabled={!canWrite}
                  onClick={() => toggleDone(task)}
                  className={clsx(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                    done
                      ? 'border-success-500 bg-success-500 text-white'
                      : task.state === 'review'
                        ? 'border-warning-500'
                        : 'border-surface-300 hover:border-success-500 dark:border-surface-600',
                  )}
                >
                  {done && <Icon name="check" size={12} />}
                </button>
                <button type="button" onClick={() => setOpenId(a.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block truncate text-sm font-medium', done ? 'text-surface-400 line-through' : 'text-surface-900 dark:text-surface-50')}>
                      {a.kind && (
                        <span className={clsx('mr-1.5 rounded px-1 py-px text-xs font-semibold', done ? 'bg-surface-100 text-surface-400 dark:bg-surface-700' : 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300')}>
                          {workLabel(a.kind, a.number)}
                        </span>
                      )}
                      {a.title}
                    </span>
                    <span className="block text-xs text-surface-400">
                      {t(STATE_LABEL[task.state] ?? 'assign.col.todo')}
                      {a.is_personal && ` · ${t('subjects.personal')}`}
                    </span>
                  </span>
                  {a.priority !== 'normal' && a.priority !== 'low' && !done && (
                    <Badge variant={PRIORITY_BADGE_VARIANT[a.priority]}>{t(PRIORITY_LABELS[a.priority])}</Badge>
                  )}
                  {a.max_points != null && (
                    <span className={clsx('shrink-0 text-xs tabular-nums', task.points != null ? 'font-medium text-surface-700 dark:text-surface-200' : 'text-surface-400')}>
                      {t('subjects.assignmentPoints', { got: task.points != null ? fmt(task.points) : '—', max: fmt(a.max_points) })}
                    </span>
                  )}
                  {a.link && <Icon name="link" size={14} className="shrink-0 text-surface-400" />}
                  <span className={clsx('w-28 shrink-0 text-right text-xs tabular-nums', overdue ? 'font-semibold text-danger-600 dark:text-danger-500' : 'text-surface-500 dark:text-surface-400')}>
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
          // Модалку не закрываем: после «Сдал» сразу можно вписать балл
          if (selected) updateTask.mutate({ assignmentId: selected.assignment.id, data: { state } })
        }}
        onVote={(assignmentId, v) => vote.mutate({ id: assignmentId, data: { vote: v } })}
      />
      {groupId && (
        <CreateAssignmentModal
          open={creating}
          onClose={() => setCreating(false)}
          subjects={subjects}
          groupCode={groupCode}
          defaultSubjectId={subjectId}
          defaultKind={filter !== 'all' && filter !== 'task' ? filter : 'lab'}
          onSubmit={(data) => {
            create.mutate(toCreateRequest(data, groupId))
            setCreating(false)
          }}
        />
      )}
    </Card>
  )
}
