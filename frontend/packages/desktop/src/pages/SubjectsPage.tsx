import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Card, Badge, ProgressBar, Icon } from '../components/ui'
import { useGroupSubjects, useGroupContext } from '@nexora/shared'
import type { Subject } from '@nexora/shared'

interface AssignmentGroup {
  type: string
  done: number
  total: number
}

// The API Subject type may not have assignment breakdown.
// We'll show what we have: name, teacher (if available).
// Progress is shown as 0/unknown if no assignment data.

function getSubjectProgress(subject: Subject & { assignments?: AssignmentGroup[] }): number {
  const assignments = subject.assignments
  if (!assignments || assignments.length === 0) return 0
  const totalDone = assignments.reduce((sum: number, a: AssignmentGroup) => sum + a.done, 0)
  const totalAll = assignments.reduce((sum: number, a: AssignmentGroup) => sum + a.total, 0)
  if (totalAll === 0) return 100
  return Math.round((totalDone / totalAll) * 100)
}

function formatAssignments(assignments?: AssignmentGroup[]): string {
  if (!assignments || assignments.length === 0) return ''
  return assignments
    .map((a) => `${a.done}/${a.total} ${a.type}`)
    .join(', ')
}

function isAdmitted(progress: number): boolean {
  return progress >= 70
}

export function SubjectsPage() {
  const { groupCode } = useGroupContext()
  const subjectsQuery = useGroupSubjects(groupCode ?? undefined)

  const subjects = (subjectsQuery.data ?? []) as Array<Subject & { assignments?: AssignmentGroup[]; teacher?: string; control?: string }>

  if (!groupCode) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
              Мои предметы
            </h1>
          </div>
        </div>
        <div className="text-center py-20">
          <p className="text-surface-500 dark:text-surface-400 font-medium">Группа не выбрана</p>
          <p className="text-sm text-surface-400 dark:text-surface-500 mt-1">
            Укажите группу в настройках, чтобы увидеть предметы
          </p>
        </div>
      </div>
    )
  }

  if (subjectsQuery.isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
              Мои предметы
            </h1>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-32 bg-surface-200 dark:bg-surface-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
            Мои предметы
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            {subjects.length > 0
              ? `Группа ${groupCode} — ${subjects.length} предметов`
              : `Группа ${groupCode}`}
          </p>
        </div>
      </div>

      {subjects.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-surface-500 dark:text-surface-400 font-medium">Предметы не найдены</p>
          <p className="text-sm text-surface-400 dark:text-surface-500 mt-1">
            Список предметов для вашей группы пока пуст
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {subjects.map((subject) => {
            const progress = getSubjectProgress(subject)
            const admitted = isAdmitted(progress)
            const assignmentsLabel = formatAssignments(subject.assignments)

            return (
              <Link
                key={subject.id}
                to={`/assignments?subject=${subject.id}`}
                className="block group"
              >
                <Card
                  variant="hover"
                  className="h-full transition-shadow group-hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-base font-semibold text-surface-900 dark:text-surface-50 truncate">
                          {subject.name}
                        </h3>
                      </div>
                      {subject.teacher && (
                        <div className="flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400">
                          <Icon name="users" size={14} className="shrink-0" />
                          <span className="truncate">{subject.teacher}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={admitted ? 'success' : 'urgent'}>
                        {admitted ? 'ДОПУСК' : 'НЕДОПУСК'}
                      </Badge>
                      <Icon
                        name="chevron-right"
                        size={18}
                        className="text-surface-400 dark:text-surface-500 group-hover:text-primary-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <ProgressBar
                      value={progress}
                      color={admitted ? 'success' : 'danger'}
                      showLabel
                      trend={assignmentsLabel || undefined}
                    />
                  </div>

                  {subject.assignments && subject.assignments.length > 0 && (
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {subject.assignments.map((a: AssignmentGroup) => (
                          <span
                            key={a.type}
                            className={clsx(
                              'text-xs',
                              a.done === a.total
                                ? 'text-success-500'
                                : 'text-surface-500 dark:text-surface-400'
                            )}
                          >
                            <Icon
                              name={a.done === a.total ? 'check' : 'file'}
                              size={12}
                              className="inline-block mr-1 -mt-px"
                            />
                            {a.type}: {a.done}/{a.total}
                          </span>
                        ))}
                      </div>
                      {subject.control && (
                        <span className="text-xs text-surface-400 dark:text-surface-500 capitalize">
                          {subject.control}
                        </span>
                      )}
                    </div>
                  )}
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
