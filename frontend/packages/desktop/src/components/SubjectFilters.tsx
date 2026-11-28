/**
 * Фильтры «Предметов» (#165): поиск, теги, преподаватель, тип занятий, состояние,
 * сортировка. Всё хранится в адресе — фильтр можно переслать ссылкой.
 * Фильтрует уже загруженный список семестра на клиенте: предметов в семестре ~10–15.
 */
import { useState } from 'react'
import { clsx } from 'clsx'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import type { SubjectList, SubjectSummary } from '@nexora/shared'
import { Icon } from './ui'
import { useT, type MessageKey } from '../i18n'

export type Only = 'debt' | 'week' | 'materials' | 'noworks' | 'pending' | 'personal' | 'admitted'
export type LessonType = 'lab' | 'practice' | 'seminar' | 'lecture'
export type Sort = 'name' | 'deadline' | 'progress' | 'points'

export interface Filters {
  q: string
  tags: string[]
  teacher: string
  types: LessonType[]
  only: Only[]
  sort: Sort
}

const ONLY: Only[] = ['debt', 'admitted', 'week', 'materials', 'noworks', 'pending', 'personal']
const TYPES: LessonType[] = ['lecture', 'lab', 'practice', 'seminar']
const SORTS: Sort[] = ['name', 'deadline', 'progress', 'points']

// Тип занятия по названию из расписания rasp: «Лабораторная работа», «Практика»…
const TYPE_MATCH: Record<LessonType, RegExp> = {
  lecture: /лекц/i,
  lab: /лаб/i,
  practice: /практ/i,
  seminar: /семин/i,
}

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])

export function readFilters(p: URLSearchParams): Filters {
  const sort = p.get('sort') as Sort | null
  return {
    q: p.get('q') ?? '',
    tags: list(p.get('tags')),
    teacher: p.get('teacher') ?? '',
    types: list(p.get('type')).filter((x): x is LessonType => (TYPES as string[]).includes(x)),
    only: list(p.get('only')).filter((x): x is Only => (ONLY as string[]).includes(x)),
    sort: sort && SORTS.includes(sort) ? sort : 'name',
  }
}

const left = (s: SubjectSummary) => (s.required != null ? Math.max(0, s.required - s.works_passed) : null)
const daysTo = (s: SubjectSummary) =>
  s.next_deadline ? differenceInCalendarDays(parseISO(s.next_deadline.date), new Date()) : Infinity

function matchOnly(s: SubjectSummary, o: Only): boolean {
  switch (o) {
    case 'debt': return (left(s) ?? 0) > 0
    case 'admitted': return left(s) === 0
    case 'week': return daysTo(s) <= 7
    case 'materials': return s.materials > 0
    case 'noworks': return s.works_total === 0
    case 'pending': return s.pending > 0
    case 'personal': return s.is_custom
  }
}

export function applyFilters(subjects: SubjectSummary[], f: Filters): SubjectSummary[] {
  const q = f.q.trim().toLowerCase()
  const out = subjects.filter((s) => {
    if (q && !s.name.toLowerCase().includes(q) && !s.teachers.some((t) => t.toLowerCase().includes(q))
      && !s.tags.some((t) => t.key.includes(q))) return false
    if (f.tags.length && !s.tags.some((t) => f.tags.includes(t.key))) return false
    if (f.teacher && !s.teachers.includes(f.teacher)) return false
    if (f.types.length && !f.types.some((ty) => s.lesson_types.some((lt) => TYPE_MATCH[ty].test(lt)))) return false
    return f.only.every((o) => matchOnly(s, o))
  })
  const progress = (s: SubjectSummary) => (s.works_total ? s.works_passed / s.works_total : 1)
  const sorters: Record<Sort, (a: SubjectSummary, b: SubjectSummary) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, 'ru'),
    deadline: (a, b) => daysTo(a) - daysTo(b) || a.name.localeCompare(b.name, 'ru'),
    progress: (a, b) => progress(a) - progress(b) || a.name.localeCompare(b.name, 'ru'),
    points: (a, b) => b.points - a.points || a.name.localeCompare(b.name, 'ru'),
  }
  return out.sort(sorters[f.sort])
}

function Chip({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary-500 bg-primary-500 text-white'
          : 'border-surface-200 bg-white text-surface-600 hover:border-surface-300 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-300',
      )}
    >
      {children}
    </button>
  )
}

const selectCls =
  'rounded-lg border border-surface-200 bg-white px-2.5 py-2 text-sm text-surface-700 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200'

export function SubjectFilters({ list: data, filters: f, onChange, shown }: {
  list: SubjectList
  filters: Filters
  onChange: (next: Partial<Filters>) => void
  shown: number
}) {
  const { t } = useT()
  const [more, setMore] = useState(f.types.length > 0 || f.only.length > 0 || !!f.teacher)
  const subjects = data.subjects
  const teachers = [...new Set(subjects.flatMap((s) => s.teachers))].sort((a, b) => a.localeCompare(b, 'ru'))
  const types = TYPES.filter((ty) => subjects.some((s) => s.lesson_types.some((lt) => TYPE_MATCH[ty].test(lt))))
  const tagKeys = new Set(subjects.flatMap((s) => s.tags.map((x) => x.key)))
  const tags = data.group_tags.filter((x) => tagKeys.has(x.key) || f.tags.includes(x.key))
  const count = (o: Only) => subjects.filter((s) => matchOnly(s, o)).length
  const only = ONLY.filter((o) => count(o) > 0 || f.only.includes(o))
  const toggle = <T extends string>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
  const active = f.q || f.tags.length || f.teacher || f.types.length || f.only.length

  return (
    <div className="mb-5 space-y-3 rounded-xl border border-surface-200 bg-surface-50/60 p-3 dark:border-surface-700 dark:bg-surface-800/40">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[12rem] flex-1">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            value={f.q}
            onChange={(e) => onChange({ q: e.target.value })}
            placeholder={t('subjects.filter.search')}
            aria-label={t('subjects.filter.search')}
            className="w-full rounded-lg border border-surface-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-surface-700 dark:bg-surface-800"
          />
        </label>
        <select value={f.sort} onChange={(e) => onChange({ sort: e.target.value as Sort })} className={selectCls} aria-label={t('subjects.filter.sort')}>
          {SORTS.map((s) => <option key={s} value={s}>{t(`subjects.sort.${s}` as MessageKey)}</option>)}
        </select>
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className={clsx(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            more ? 'border-primary-300 text-primary-700 dark:text-primary-300' : 'border-surface-200 text-surface-600 dark:border-surface-700 dark:text-surface-300',
          )}
        >
          <Icon name="filter" size={14} />
          {t('subjects.filter.more')}
          {(f.types.length + f.only.length + (f.teacher ? 1 : 0)) > 0 && (
            <span className="rounded-full bg-primary-500 px-1.5 text-2xs text-white">{f.types.length + f.only.length + (f.teacher ? 1 : 0)}</span>
          )}
        </button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-surface-500">{t('subjects.filter.tags')}</span>
          {tags.map((tg) => (
            <Chip key={tg.key} active={f.tags.includes(tg.key)} onClick={() => onChange({ tags: toggle(f.tags, tg.key) })}>
              #{tg.tag}<span className="opacity-60">{tg.count}</span>
            </Chip>
          ))}
        </div>
      )}

      {more && (
        <div className="space-y-2.5 border-t border-surface-200 pt-3 dark:border-surface-700">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-surface-500">{t('subjects.filter.state')}</span>
            {only.map((o) => (
              <Chip key={o} active={f.only.includes(o)} onClick={() => onChange({ only: toggle(f.only, o) })}>
                {t(`subjects.only.${o}` as MessageKey)}<span className="opacity-60">{count(o)}</span>
              </Chip>
            ))}
          </div>
          {types.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs font-medium text-surface-500">{t('subjects.filter.type')}</span>
              {types.map((ty) => (
                <Chip key={ty} active={f.types.includes(ty)} onClick={() => onChange({ types: toggle(f.types, ty) })}>
                  {t(`subjects.ltype.${ty}` as MessageKey)}
                </Chip>
              ))}
            </div>
          )}
          {teachers.length > 1 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-surface-500">{t('subjects.filter.teacher')}</span>
              <select value={f.teacher} onChange={(e) => onChange({ teacher: e.target.value })} className={selectCls}>
                <option value="">{t('subjects.filter.anyTeacher')}</option>
                {teachers.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {active ? (
        <div className="flex items-center justify-between text-xs text-surface-500">
          <span>{t('subjects.filter.shown', { n: shown, total: subjects.length })}</span>
          <button type="button" onClick={() => onChange({ q: '', tags: [], teacher: '', types: [], only: [] })} className="font-medium text-primary-600 hover:underline dark:text-primary-400">
            {t('subjects.filter.reset')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
