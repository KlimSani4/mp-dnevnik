import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useState, useCallback } from 'react'
import { Card, Badge, ProgressBar, Icon, Button, Input } from '../components/ui'
import {
  useGroupSubjects,
  useGroupContext,
  useMyGroups,
  useUpdateSubjectRequirements,
  useGroup,
} from '@nexora/shared'
import type { Subject } from '@nexora/shared'

interface AssignmentGroup {
  type: string
  done: number
  total: number
}

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

/** Get subject requirements from group settings */
function getRequirements(
  settings: Record<string, unknown>,
  subjectId: string,
): { total?: number; type_breakdown?: Record<string, number> } {
  const reqs = settings.subject_requirements as Record<string, unknown> | undefined
  if (!reqs) return {}
  return (reqs[subjectId] as { total?: number; type_breakdown?: Record<string, number> }) ?? {}
}

/* ─── Requirements Editor ─── */

interface RequirementsEditorProps {
  subjectId: string
  groupCode: string
  currentTotal?: number
  onClose: () => void
}

function RequirementsEditor({ subjectId, groupCode, currentTotal, onClose }: RequirementsEditorProps) {
  const updateRequirements = useUpdateSubjectRequirements()
  const [total, setTotal] = useState(String(currentTotal ?? ''))

  const handleSave = useCallback(() => {
    const num = parseInt(total, 10)
    updateRequirements.mutate(
      {
        code: groupCode,
        subjectId,
        total: isNaN(num) ? undefined : num,
      },
      { onSuccess: onClose },
    )
  }, [total, groupCode, subjectId, updateRequirements, onClose])

  return (
    <div
      className="mt-2 p-3 rounded-lg border border-primary-200 dark:border-primary-500/30 bg-primary-50/50 dark:bg-primary-500/5 space-y-2"
      onClick={(e) => e.preventDefault()}
    >
      <p className="text-xs font-medium text-surface-600 dark:text-surface-400">Требуемое число заданий</p>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="например: 8"
          className="!py-1 !text-sm w-28"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
        >
          {updateRequirements.isPending ? '...' : 'Сохранить'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </div>
  )
}

/* ─── Main Page ─── */

export function SubjectsPage() {
  const { groupId, groupCode } = useGroupContext()
  const subjectsQuery = useGroupSubjects(groupCode ?? undefined)
  const myGroupsQuery = useMyGroups()
  const groupQuery = useGroup(groupCode ?? '')

  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null)

  // Determine if current user is starosta/deputy/moderator
  const myMembership = myGroupsQuery.data?.find((m) => m.group.code === groupCode)
  const isStarosta = myMembership?.role && ['starosta', 'deputy', 'moderator'].includes(myMembership.role)

  const groupSettings = (groupQuery.data?.settings ?? {}) as Record<string, unknown>

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
            const requirements = getRequirements(groupSettings, subject.id)
            const progress = (() => {
              if (subject.assignments && subject.assignments.length > 0) {
                return getSubjectProgress(subject)
              }
              // If requirements set, progress = 0 (no done yet from assignments)
              return 0
            })()
            const admitted = isAdmitted(progress)
            const assignmentsLabel = (() => {
              if (formatAssignments(subject.assignments)) return formatAssignments(subject.assignments)
              if (requirements.total != null) return `0/${requirements.total}`
              return ''
            })()
            const isEditing = editingSubjectId === subject.id

            return (
              <div key={subject.id} className="block group">
                <Link
                  to={`/assignments?subject=${subject.id}`}
                  className="block"
                  onClick={(e) => isEditing && e.preventDefault()}
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
                          {subject.is_custom && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400 shrink-0">
                              личный
                            </span>
                          )}
                        </div>
                        {subject.teacher && (
                          <div className="flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400">
                            <Icon name="users" size={14} className="shrink-0" />
                            <span className="truncate">{subject.teacher}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isStarosta && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              setEditingSubjectId(isEditing ? null : subject.id)
                            }}
                            className={clsx(
                              'p-1 rounded transition-colors',
                              isEditing
                                ? 'text-primary-500 bg-primary-50 dark:bg-primary-500/10'
                                : 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 opacity-0 group-hover:opacity-100',
                            )}
                            title="Установить требования"
                          >
                            <Icon name="settings" size={14} />
                          </button>
                        )}
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

                    {/* Requirements editor */}
                    {isEditing && groupCode && (
                      <RequirementsEditor
                        subjectId={subject.id}
                        groupCode={groupCode}
                        currentTotal={requirements.total}
                        onClose={() => setEditingSubjectId(null)}
                      />
                    )}

                    {/* Show set requirements if no assignments but total is set */}
                    {!subject.assignments?.length && requirements.total != null && !isEditing && (
                      <p className="mt-2 text-xs text-surface-400 dark:text-surface-500">
                        Требуется: {requirements.total} заданий
                      </p>
                    )}
                  </Card>
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
