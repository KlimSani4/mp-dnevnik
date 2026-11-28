/**
 * «Предметы» (#165): фильтры по курсу и семестру, карточки со сводкой.
 *
 * Семестр берётся из адреса (?semester=5 или ?semester=all), по умолчанию — текущий.
 * Курс и семестр сервер считает по коду группы; предмет помнит, в каких семестрах шёл.
 */
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { ApiClientError, useGroupContext, useSubjectList } from '@nexora/shared'
import type { SemesterOption, SubjectList, SubjectSummary } from '@nexora/shared'
import { Card, Icon, Skeleton } from '../components/ui'
import { applyFilters, readFilters, SubjectFilters, type Filters } from '../components/SubjectFilters'
import { NoGroupState } from '../components/NoGroupState'
import { useT } from '../i18n'

function parseSemester(raw: string | null): number | 'all' | null {
  if (raw === 'all') return 'all'
  const n = raw ? Number(raw) : NaN
  return Number.isInteger(n) && n > 0 ? n : null
}

export function SubjectsPage() {
  const { t } = useT()
  const { groupCode, isLoading: groupLoading } = useGroupContext()
  const [params, setParams] = useSearchParams()
  const requested = parseSemester(params.get('semester'))
  const query = useSubjectList(groupCode, requested)
  const data = query.data

  const setSemester = (value: number | 'all') => {
    const next = new URLSearchParams(params)
    next.set('semester', String(value))
    setParams(next, { replace: true })
  }

  if (!groupCode && !groupLoading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">{t('subjects.title')}</h1>
        <NoGroupState title="assign.noGroup.title" text="assign.noGroup.text" />
      </div>
    )
  }

  const selected: number | 'all' | null = requested === 'all' ? 'all' : (data?.selected_semester ?? null)
  const semesters = data?.semesters ?? []
  const filters = readFilters(params)
  const shown = useMemo(() => applyFilters(data?.subjects ?? [], filters), [data, params]) // eslint-disable-line react-hooks/exhaustive-deps
  const setFilters = (next: Partial<Filters>) => {
    const p = new URLSearchParams(params)
    const merged = { ...filters, ...next }
    const put = (k: string, v: string | string[]) => {
      const val = Array.isArray(v) ? v.join(',') : v
      if (val) p.set(k, val)
      else p.delete(k)
    }
    put('q', merged.q)
    put('tags', merged.tags)
    put('teacher', merged.teacher)
    put('type', merged.types)
    put('only', merged.only)
    put('sort', merged.sort === 'name' ? '' : merged.sort)
    setParams(p, { replace: true })
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">{t('subjects.title')}</h1>
        <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
          {t('subjects.subtitle', { group: groupCode ?? '' })}
        </p>
      </div>

      {data && !data.can_write && <ReadOnlyNote />}

      {semesters.length > 0 && (
        <SemesterFilter semesters={semesters} selected={selected} onSelect={setSemester} />
      )}

      {data && data.subjects.length > 0 && (
        <SubjectFilters list={data as SubjectList} filters={filters} onChange={setFilters} shown={shown.length} />
      )}

      {query.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : data && data.subjects.length > 0 && shown.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="font-medium text-surface-600 dark:text-surface-300">{t('subjects.filter.nothing')}</p>
          <button type="button" onClick={() => setFilters({ q: '', tags: [], teacher: '', types: [], only: [] })} className="mt-2 text-sm text-primary-600 hover:underline dark:text-primary-400">
            {t('subjects.filter.reset')}
          </button>
        </Card>
      ) : !data?.subjects.length ? (
        <Card className="py-12 text-center">
          <p className="font-medium text-surface-600 dark:text-surface-300">{t('subjects.emptySemester')}</p>
          <p className="mt-1 text-sm text-surface-400">{t('subjects.emptySemesterHint')}</p>
        </Card>
      ) : (
        <div className={clsx('grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3', query.isFetching && 'opacity-70 transition-opacity')}>
          {shown.map((s) => (
            <SubjectCard key={s.id} subject={s} semester={typeof selected === 'number' ? selected : null} activeTags={filters.tags} />
          ))}
        </div>
      )}
    </div>
  )
}

function SemesterFilter({ semesters, selected, onSelect }: {
  semesters: SemesterOption[]
  selected: number | 'all' | null
  onSelect: (value: number | 'all') => void
}) {
  const { t } = useT()
  const courses = [...new Set(semesters.map((s) => s.course))]
  const selectedCourse = typeof selected === 'number' ? Math.ceil(selected / 2) : null
  const inCourse = semesters.filter((s) => s.course === selectedCourse)

  const pick = (course: number) => {
    const options = semesters.filter((s) => s.course === course)
    const current = options.find((s) => s.is_current)
    onSelect((current ?? options[options.length - 1]).number)
  }

  return (
    <div className="mb-5 space-y-2">
      <div role="tablist" aria-label={t('subjects.course')} className="flex flex-wrap gap-1.5">
        {courses.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={selectedCourse === c}
            onClick={() => pick(c)}
            className={clsx(
              'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
              selectedCourse === c
                ? 'bg-primary-500 text-white'
                : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700',
            )}
          >
            {t('subjects.courseN', { n: c })}
          </button>
        ))}
        <button
          role="tab"
          aria-selected={selected === 'all'}
          onClick={() => onSelect('all')}
          className={clsx(
            'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
            selected === 'all'
              ? 'bg-primary-500 text-white'
              : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700',
          )}
        >
          {t('subjects.allSemesters')}
        </button>
      </div>
      {inCourse.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {inCourse.map((s) => (
            <button
              key={s.number}
              onClick={() => onSelect(s.number)}
              aria-pressed={selected === s.number}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selected === s.number
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                  : 'border-surface-200 text-surface-600 hover:border-surface-300 dark:border-surface-700 dark:text-surface-300',
              )}
            >
              {t(s.autumn ? 'subjects.semAutumn' : 'subjects.semSpring', { n: s.number })}
              <span className="tabular-nums text-surface-400">{s.subjects}</span>
              {s.is_current && <span className="h-1.5 w-1.5 rounded-full bg-success-500" title={t('subjects.current')} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DeadlineChip({ date, title }: { date: string; title?: string }) {
  const { t } = useT()
  const days = differenceInCalendarDays(parseISO(date), new Date())
  const urgent = days <= 2
  return (
    <span
      title={title}
      className={clsx(
        'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium tabular-nums',
        urgent ? 'bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-500' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
      )}
    >
      <Icon name="clock" size={11} />
      {days === 0 ? t('subjects.today') : days === 1 ? t('subjects.tomorrow') : format(parseISO(date), 'dd.MM')}
    </span>
  )
}

function SubjectCard({ subject: s, semester, activeTags }: { subject: SubjectSummary; semester: number | null; activeTags: string[] }) {
  const { t } = useT()
  const ratio = s.works_total ? s.works_passed / s.works_total : 0
  const left = s.required != null ? Math.max(0, s.required - s.works_passed) : null
  return (
    <Link to={`/subjects/${s.id}${semester ? `?semester=${semester}` : ''}`} className="group block">
      <Card variant="hover" className="flex h-full flex-col gap-3 transition-shadow group-hover:shadow-md">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-snug text-surface-900 dark:text-surface-50">{s.name}</h3>
            {s.pending > 0 && (
              <span className="shrink-0 rounded-full bg-warning-100 px-2 py-0.5 text-2xs font-semibold text-warning-600 dark:bg-warning-500/15 dark:text-warning-500" title={t('subjects.pendingHint')}>
                {t('subjects.pendingN', { n: s.pending })}
              </span>
            )}
            {s.is_custom && (
              <span className="shrink-0 rounded bg-surface-100 px-1.5 py-0.5 text-2xs font-medium text-surface-500 dark:bg-surface-700 dark:text-surface-400">
                {t('subjects.personal')}
              </span>
            )}
          </div>
          {s.teachers.length > 0 && (
            <p className="mt-0.5 truncate text-sm text-surface-500 dark:text-surface-400">{s.teachers.join(', ')}</p>
          )}
          {s.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {s.tags.slice(0, 5).map((tg) => (
                <span
                  key={tg.key}
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-2xs font-medium',
                    activeTags.includes(tg.key)
                      ? 'bg-primary-500 text-white'
                      : 'bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300',
                  )}
                >
                  #{tg.tag}
                </span>
              ))}
              {s.tags.length > 5 && <span className="text-2xs text-surface-400">+{s.tags.length - 5}</span>}
            </div>
          )}
        </div>

        {s.works_total > 0 ? (
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-surface-600 dark:text-surface-300">
                {t('subjects.worksPassed', { done: s.works_passed, total: s.works_total })}
              </span>
              {s.max_points > 0 && (
                <span className="tabular-nums font-medium text-surface-900 dark:text-surface-50">
                  {fmt(s.points)}<span className="text-surface-400"> / {fmt(s.max_points)}</span>
                </span>
              )}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-700">
              <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-surface-400">{t('subjects.noWorks')}</p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-1.5">
          {left != null && (
            <span className={clsx(
              'rounded-md px-1.5 py-0.5 text-2xs font-semibold',
              left === 0 ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
            )}>
              {left === 0 ? t('subjects.admittedShort') : t('subjects.leftToAdmit', { n: left })}
            </span>
          )}
          {s.next_deadline && <DeadlineChip date={s.next_deadline.date} title={s.next_deadline.title} />}
          {s.materials > 0 && (
            <span className="inline-flex items-center gap-1 text-2xs text-surface-500 dark:text-surface-400">
              <Icon name="file" size={11} />{t('subjects.materialsN', { n: s.materials })}
            </span>
          )}
        </div>
      </Card>
    </Link>
  )
}

export function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

export function ReadOnlyNote() {
  const { t } = useT()
  return (
    <div className="mb-4 rounded-lg bg-warning-50 px-4 py-2.5 text-sm text-warning-600 dark:bg-warning-500/10 dark:text-warning-500">
      {t('subjects.readOnly')}
    </div>
  )
}

/** Почему не загрузилось — по ответу сервера, а не одно «не удалось» на всё. */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useT()
  const e = error instanceof ApiClientError ? error : null
  let text = t('subjects.err.network')
  if (e?.code === 'NOT_MEMBER') text = t('subjects.err.notMember')
  else if (e?.status === 404) text = t('subjects.err.notFound')
  else if (e && e.status >= 500) text = t('subjects.err.server')
  else if (e) text = t('subjects.err.generic')
  return (
    <Card className="py-10 text-center">
      <p className="text-sm text-surface-600 dark:text-surface-300">{text}</p>
      {import.meta.env.DEV && e && e.status >= 500 && (
        <p className="mt-2 text-xs text-surface-400">{t('subjects.err.devMigrations')}</p>
      )}
      {e?.code !== 'NOT_MEMBER' && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          {t('subjects.err.retry')}
        </button>
      )}
    </Card>
  )
}
