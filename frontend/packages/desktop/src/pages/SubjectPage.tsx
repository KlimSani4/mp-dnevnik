/**
 * Страница предмета (#165): сводка, работы с личным учётом, материалы, лекции,
 * дедлайны и расписание.
 *
 * Добавить работу или материал может любой участник: от старосты, заместителя или
 * помощника — сразу, от остальных — «на проверке», пока ведущий не подтвердит.
 */
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { format, parseISO } from 'date-fns'
import { ApiClientError, useGroupContext, useSubject, useSubjectAction, useSubjectList, useUpdateSubjectRequirements } from '@nexora/shared'
import type {
  MaterialKind,
  SubjectAction,
  SubjectDetail,
  SubjectMaterialView,
} from '@nexora/shared'
import { Button, Card, Icon, Input, Modal, Skeleton } from '../components/ui'
import { DeadlineChip, fmt, LoadError, ReadOnlyNote } from './SubjectsPage'
import { SubjectAssignments } from '../components/SubjectAssignments'
import { useT, type MessageKey } from '../i18n'

const WEEKDAYS: MessageKey[] = ['wd.mon', 'wd.tue', 'wd.wed', 'wd.thu', 'wd.fri', 'wd.sat', 'wd.sun' as MessageKey]
const MATERIAL_KINDS: MaterialKind[] = ['theory', 'presentation', 'manual', 'lecture', 'recording', 'other']

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function SubjectPage() {
  const { t } = useT()
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const semester = Number(params.get('semester')) || null
  const query = useSubject(id, semester)
  const action = useSubjectAction(id, semester)
  // 'newLecture' — добавление из блока «Лекции»: тип сразу «Лекция», а не «Теория»
  const [materialForm, setMaterialForm] = useState<SubjectMaterialView | 'new' | 'newLecture' | null>(null)
  const s = query.data
  const run = (a: SubjectAction) => action.mutate(a)

  const back = (
    <Link to={`/subjects${semester ? `?semester=${semester}` : ''}`} className="mb-4 inline-flex items-center gap-1 text-sm text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-100">
      <Icon name="arrow-left" size={14} />{t('subjects.back')}
    </Link>
  )

  if (query.isLoading) {
    return <div>{back}<Skeleton className="h-28 rounded-xl" /><div className="mt-4 grid gap-3 sm:grid-cols-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div></div>
  }
  if (!s) {
    return <div>{back}<LoadError error={query.error} onRetry={() => query.refetch()} /></div>
  }

  const pending =
    s.materials_list.filter((m) => m.status === 'pending').length +
    s.lectures.filter((l) => l.material?.status === 'pending').length
  const labsLeft = s.required_left

  return (
    <div className="space-y-5">
      <div>
        {back}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">{s.name}</h1>
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">
              {[s.teachers.join(', '), s.lesson_types.join(' · '), semesterLabel(t, s)].filter(Boolean).join(' — ')}
            </p>
          </div>
          {s.can_moderate && pending > 0 && (
            <span className="rounded-full bg-warning-100 px-2.5 py-1 text-xs font-semibold text-warning-600 dark:bg-warning-500/15 dark:text-warning-500">
              {t('subjects.pendingReview', { n: pending })}
            </span>
          )}
        </div>
        <TagEditor detail={s} semester={semester} busy={action.isPending} run={run} readOnly={!s.can_write} />
      </div>

      {!s.can_write && <ReadOnlyNote />}

      {action.error && !materialForm && (
        <div role="alert" className="rounded-lg bg-danger-50 px-4 py-2.5 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-500">
          {action.error instanceof ApiClientError && action.error.status === 403 ? t('subjects.err.forbidden') : t('subjects.err.generic')}
        </div>
      )}

      {/* Сводка */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label={t('subjects.stat.works')} value={s.works_total ? `${s.works_passed} / ${s.works_total}` : '—'} />
        <Stat label={t('subjects.stat.points')} value={s.max_points ? `${fmt(s.points)} / ${fmt(s.max_points)}` : '—'} />
        <Stat
          label={t('subjects.stat.admission')}
          value={labsLeft == null ? '—' : labsLeft === 0 ? t('subjects.admittedShort') : t('subjects.leftLabs', { n: labsLeft })}
          tone={labsLeft === 0 ? 'good' : undefined}
          extra={s.group_code && s.can_moderate && !s.is_custom ? <RequirementEditor code={s.group_code} subjectId={s.id} current={s.required} /> : null}
        />
        <Stat
          label={t('subjects.stat.deadline')}
          value={s.next_deadline ? format(parseISO(s.next_deadline.date), 'dd.MM') : '—'}
          hint={s.next_deadline?.title}
        />
        <GradesStat url={s.grades_url ?? null} canEdit={s.can_moderate || s.is_custom} busy={action.isPending} run={run} />
      </div>

      {/* Задания из раздела «Задания» по этому предмету */}
      <SubjectAssignments subjectId={s.id} canWrite={s.can_write} />

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Материалы */}
        <Section
          title={t('subjects.materials')}
          action={s.can_write && <Button size="sm" variant="secondary" icon={<Icon name="plus" size={14} />} onClick={() => setMaterialForm('new')}>{t('subjects.add')}</Button>}
        >
          {s.materials_list.length === 0 ? (
            <Empty text={t('subjects.materialsEmpty')} />
          ) : (
            <ul className="divide-y divide-surface-100 dark:divide-surface-700">
              {s.materials_list.map((m) => (
                <MaterialRow key={m.id} m={m} canModerate={s.can_moderate} busy={action.isPending} run={run} onEdit={() => setMaterialForm(m)} />
              ))}
            </ul>
          )}
        </Section>

        {/* Лекции */}
        <Section title={t('subjects.lectures')} action={s.can_write && <Button size="sm" variant="ghost" onClick={() => setMaterialForm('newLecture')}>{t('subjects.addRecording')}</Button>}>
          {s.lectures.length === 0 ? (
            <Empty text={t('subjects.lecturesEmpty')} />
          ) : (
            <ul className="divide-y divide-surface-100 dark:divide-surface-700">
              {s.lectures.map((l) => l.material ? (
                <MaterialRow key={l.material.id} m={l.material} canModerate={s.can_moderate} busy={action.isPending} run={run} onEdit={() => setMaterialForm(l.material ?? null)} />
              ) : (
                <li key={l.url} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon name={l.source === 'schedule' ? 'video' : 'play'} size={16} className="shrink-0 text-primary-500" />
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-medium text-surface-800 hover:text-primary-600 dark:text-surface-100">
                    {l.title}
                  </a>
                  <span className="shrink-0 text-xs text-surface-400">
                    {l.lecture_date ? format(parseISO(l.lecture_date), 'dd.MM') : l.source === 'schedule' ? t('subjects.fromSchedule') : host(l.url)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Дедлайны */}
        <Section title={t('subjects.deadlines')}>
          {s.deadlines.length === 0 ? (
            <Empty text={t('subjects.deadlinesEmpty')} />
          ) : (
            <ul className="divide-y divide-surface-100 dark:divide-surface-700">
              {s.deadlines.map((d, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <DeadlineChip date={d.date} />
                  {d.kind === 'assignment' ? (
                    <Link to={`/assignments?subject=${s.id}`} className="min-w-0 flex-1 truncate text-sm text-surface-800 hover:text-primary-600 dark:text-surface-100">{d.title}</Link>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm text-surface-800 dark:text-surface-100">{d.title}</span>
                  )}
                  <span className="shrink-0 text-2xs text-surface-400">{t('subjects.dlTask')}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Расписание */}
        <Section title={t('subjects.schedule')}>
          {s.schedule.length === 0 ? (
            <Empty text={t('subjects.scheduleEmpty')} />
          ) : (
            <ul className="divide-y divide-surface-100 dark:divide-surface-700">
              {s.schedule.map((slot, i) => {
                const phase = slotPhase(slot.date_from, slot.date_to)
                return (
                <li
                  key={i}
                  className={clsx('flex items-center gap-3 px-4 py-2.5 text-sm', phase === 'past' && 'opacity-45')}
                  title={phase === 'past' ? t('subjects.slotPast') : undefined}
                >
                  <span className="w-8 shrink-0 font-medium text-surface-900 dark:text-surface-50">{t(WEEKDAYS[slot.weekday - 1] ?? 'wd.mon')}</span>
                  <span className="w-24 shrink-0 tabular-nums text-surface-500">{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx('block truncate', phase === 'past' ? 'text-surface-500 line-through decoration-surface-300' : 'text-surface-700 dark:text-surface-200')}>
                      {[slot.lesson_type, slot.room || slot.location, slot.teacher].filter(Boolean).join(' · ')}
                    </span>
                    {(slot.date_from || slot.date_to || slot.week_parity) && (
                      <span className="block text-xs tabular-nums text-surface-400">
                        {[
                          period(slot.date_from, slot.date_to),
                          slot.week_parity && t(slot.week_parity === 'even' ? 'subjects.weekEven' : 'subjects.weekOdd'),
                          phase === 'past' && t('subjects.slotPast'),
                          phase === 'future' && t('subjects.slotFuture'),
                        ].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                  {slot.link && (
                    <a href={slot.link} target="_blank" rel="noopener noreferrer" className="shrink-0 text-primary-600 dark:text-primary-400" title={t('subjects.webinar')}>
                      <Icon name="video" size={16} />
                    </a>
                  )}
                </li>
                )
              })}
            </ul>
          )}
        </Section>
      </div>

      <p className="text-xs text-surface-400">{s.can_moderate ? t('subjects.hostNote') : t('subjects.memberNote')}</p>

      {materialForm && (
        <MaterialForm initial={typeof materialForm === 'string' ? null : materialForm} defaultKind={materialForm === 'newLecture' ? 'lecture' : 'theory'} canModerate={s.can_moderate} busy={action.isPending}
          onClose={() => { setMaterialForm(null); action.reset() }}
          onSubmit={(data) => action.mutateAsync(typeof materialForm === 'string'
            ? { type: 'addMaterial', data: { ...data, semester } }
            : { type: 'updateMaterial', materialId: materialForm.id, data }).then(() => setMaterialForm(null))}
          error={action.error}
        />
      )}
    </div>
  )
}

function semesterLabel(t: ReturnType<typeof useT>['t'], s: SubjectDetail): string {
  if (!s.first_semester) return ''
  const last = s.last_semester ?? s.first_semester
  return last === s.first_semester ? t('subjects.semN', { n: s.first_semester }) : t('subjects.semRange', { from: s.first_semester, to: last })
}

function Stat({ label, value, hint, tone, extra }: { label: string; value: string; hint?: string; tone?: 'good'; extra?: React.ReactNode }) {
  return (
    <Card className="min-w-0">
      <div className="text-xs font-medium text-surface-500 dark:text-surface-400">{label}</div>
      <div className={clsx('mt-1 truncate text-xl font-semibold tabular-nums', tone === 'good' ? 'text-success-600 dark:text-success-500' : 'text-surface-900 dark:text-surface-50')}>{value}</div>
      {hint && <div className="mt-0.5 truncate text-xs text-surface-500 dark:text-surface-400" title={hint}>{hint}</div>}
      {extra}
    </Card>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5">
        <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50">{title}</h2>
        {action}
      </div>
      {children}
    </Card>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 pb-4 text-sm text-surface-400">{text}</p>
}

function Pending({ mine }: { mine: boolean }) {
  const { t } = useT()
  return (
    <span className="shrink-0 rounded bg-warning-100 px-1.5 py-0.5 text-2xs font-semibold text-warning-600 dark:bg-warning-500/15 dark:text-warning-500">
      {t(mine ? 'subjects.pendingMine' : 'subjects.pending')}
    </span>
  )
}

function ModerationButtons({ status, isMine, canModerate, busy, onApprove, onEdit, onDelete }: {
  status: string; isMine: boolean; canModerate: boolean; busy: boolean
  onApprove: () => void; onEdit: () => void; onDelete: () => void
}) {
  const { t } = useT()
  const canEdit = canModerate || (isMine && status === 'pending')
  return (
    <div className="flex shrink-0 items-center gap-1">
      {canModerate && status === 'pending' && (
        <Button size="sm" variant="success" disabled={busy} onClick={onApprove}>{t('subjects.approve')}</Button>
      )}
      {canEdit && (
        <>
          <button type="button" onClick={onEdit} title={t('subjects.edit')} className="rounded p-1.5 text-surface-400 hover:bg-surface-100 hover:text-surface-700 dark:hover:bg-surface-700">
            <Icon name="pencil" size={14} />
          </button>
          <button type="button" disabled={busy} onClick={onDelete} title={t(status === 'pending' && canModerate && !isMine ? 'subjects.reject' : 'subjects.delete')} className="rounded p-1.5 text-surface-400 hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/10">
            <Icon name="x" size={14} />
          </button>
        </>
      )}
    </div>
  )
}

/** Прошёл ли период пар: past — закончились, future — ещё не начались. */
function slotPhase(from?: string | null, to?: string | null): 'past' | 'now' | 'future' {
  const today = format(new Date(), 'yyyy-MM-dd')
  if (to && to < today) return 'past'
  if (from && from > today) return 'future'
  return 'now'
}

function period(from?: string | null, to?: string | null): string {
  const d = (x: string) => format(parseISO(x), 'dd.MM')
  if (from && to) return from === to ? d(from) : `${d(from)} – ${d(to)}`
  if (from) return `с ${d(from)}`
  return to ? `по ${d(to)}` : ''
}

/** «Оценки» в сводке: ссылка на таблицу оценок всей группы. Видят все, прикрепляет ведущий. */
function GradesStat({ url, canEdit, busy, run }: { url: string | null; canEdit: boolean; busy: boolean; run: (a: SubjectAction) => void }) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(url ?? '')
  const label = <div className="text-xs font-medium text-surface-500 dark:text-surface-400">{t('subjects.stat.grades')}</div>
  if (editing) {
    return (
      <Card className="min-w-0">
        {label}
        <form
          className="mt-1.5 space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            run({ type: 'setGradesUrl', url: value.trim() || null })
            setEditing(false)
          }}
        >
          <Input autoFocus type="url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://docs.google.com/…" />
          <div className="flex gap-1.5">
            <Button type="submit" size="sm" disabled={busy}>{t('subjects.save')}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(url ?? '') }}>{t('groupLeave.cancel')}</Button>
          </div>
        </form>
      </Card>
    )
  }
  return (
    <Card className="min-w-0">
      {label}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xl font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
        >
          <span className="truncate">{t('subjects.gradesOpen')}</span><Icon name="external-link" size={16} className="shrink-0" />
        </a>
      ) : (
        <div className="mt-1 text-xl font-semibold text-surface-900 dark:text-surface-50">—</div>
      )}
      <div className="mt-0.5 truncate text-xs text-surface-500 dark:text-surface-400">
        {url ? t('subjects.gradesHint') : canEdit ? '' : t('subjects.gradesNone')}
      </div>
      {canEdit && (
        <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs text-primary-600 hover:underline dark:text-primary-400">
          {t(url ? 'subjects.gradesEdit' : 'subjects.gradesAdd')}
        </button>
      )}
    </Card>
  )
}

function MaterialRow({ m, canModerate, busy, run, onEdit }: { m: SubjectMaterialView; canModerate: boolean; busy: boolean; run: (a: SubjectAction) => void; onEdit: () => void }) {
  const { t } = useT()
  return (
    <li className={clsx('flex items-center gap-3 px-4 py-2.5', m.status === 'pending' && 'bg-warning-50/40 dark:bg-warning-500/5')}>
      <Icon
        name={m.kind === 'lecture' || m.kind === 'recording' ? 'play' : m.kind === 'presentation' ? 'files' : 'file'}
        size={16}
        className={clsx('shrink-0', m.kind === 'lecture' || m.kind === 'recording' ? 'text-primary-500' : 'text-surface-400')}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {m.url ? (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium text-surface-800 hover:text-primary-600 dark:text-surface-100">{m.title}</a>
          ) : (
            <span className="truncate text-sm font-medium">{m.title}</span>
          )}
          {m.status === 'pending' && <Pending mine={m.is_mine} />}
        </div>
        <div className="text-xs text-surface-400">
          {t(`subjects.mkind.${m.kind}` as MessageKey)}{m.url ? ` · ${host(m.url)}` : ''}
          {m.status === 'pending' && m.author_name ? ` · ${t('subjects.by', { name: m.author_name })}` : ''}
        </div>
      </div>
      <ModerationButtons
        status={m.status} isMine={m.is_mine} canModerate={canModerate} busy={busy}
        onApprove={() => run({ type: 'approveMaterial', materialId: m.id })}
        onEdit={onEdit}
        onDelete={() => run({ type: 'deleteMaterial', materialId: m.id })}
      />
    </li>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-surface-600 dark:text-surface-300">{label}</span>
      {children}
    </label>
  )
}

const selectCls = 'w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm dark:border-surface-600 dark:bg-surface-800'

function MaterialForm({ initial, defaultKind = 'theory', canModerate, busy, onClose, onSubmit, error }: {
  initial: SubjectMaterialView | null; defaultKind?: MaterialKind; canModerate: boolean; busy: boolean; onClose: () => void
  onSubmit: (d: { kind: MaterialKind; title: string; url: string; lecture_date: string | null }) => Promise<void>
  error: unknown
}) {
  const { t } = useT()
  const [kind, setKind] = useState<MaterialKind>(initial?.kind ?? defaultKind)
  const [title, setTitle] = useState(initial?.title ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const [date, setDate] = useState(initial?.lecture_date ?? '')
  return (
    <Modal open onClose={onClose} title={t(initial ? 'subjects.editMaterial' : defaultKind === 'lecture' ? 'subjects.addLecture' : 'subjects.addMaterial')}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit({ kind, title: title.trim(), url: url.trim(), lecture_date: date || null }).catch(() => {})
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('subjects.f.kind')}>
            <select value={kind} onChange={(e) => setKind(e.target.value as MaterialKind)} className={selectCls}>
              {MATERIAL_KINDS.map((k) => <option key={k} value={k}>{t(`subjects.mkind.${k}` as MessageKey)}</option>)}
            </select>
          </Field>
          <Field label={t('subjects.f.date')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
        <Field label={t('subjects.f.title')}><Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('subjects.f.materialPh')} /></Field>
        <Field label={t('subjects.f.link')}><Input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://disk.yandex.ru/…" /></Field>
        {error != null && <p role="alert" className="text-sm text-danger-600">{error instanceof ApiClientError && error.status === 422 ? t('subjects.err.invalid') : t('subjects.err.generic')}</p>}
        <p className="text-xs text-surface-500">{t('subjects.linksOnly')}{!canModerate && !initial ? ` ${t('subjects.willReview')}` : ''}</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>{t('groupLeave.cancel')}</Button>
          <Button type="submit" disabled={busy || !title.trim() || !url.trim()}>{t(initial ? 'subjects.save' : 'subjects.add')}</Button>
        </div>
      </form>
    </Modal>
  )
}

function RequirementEditor({ code, subjectId, current }: { code: string; subjectId: string; current: number | null }) {
  const { t } = useT()
  const update = useUpdateSubjectRequirements()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(current != null ? String(current) : '')
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 text-xs text-primary-600 hover:underline dark:text-primary-400">
        {t(current != null ? 'subjects.changeRequired' : 'subjects.setRequired')}
      </button>
    )
  }
  return (
    <form
      className="mt-2 flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const n = parseInt(value, 10)
        update.mutate({ code, subjectId, total: Number.isNaN(n) ? undefined : n }, { onSuccess: () => setOpen(false) })
      }}
    >
      <input autoFocus inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('subjects.requiredPh')} className="w-16 rounded-md border border-surface-200 bg-transparent px-2 py-1 text-sm dark:border-surface-600" />
      <Button size="sm" type="submit" disabled={update.isPending}>{t('subjects.save')}</Button>
    </form>
  )
}

function TagEditor({ detail, semester, busy, run, readOnly }: { detail: SubjectDetail; semester: number | null; busy: boolean; run: (a: SubjectAction) => void; readOnly: boolean }) {
  const { t } = useT()
  const { groupCode } = useGroupContext()
  const list = useSubjectList(groupCode, semester ?? null).data
  const [adding, setAdding] = useState(false)
  const [value, setValue] = useState('')
  const have = new Set(detail.tags.map((x) => x.key))
  const suggestions = [
    ...(list?.group_tags.map((x) => x.tag) ?? []),
    ...(list?.tag_suggestions ?? []),
  ].filter((x, i, arr) => !have.has(x.toLowerCase()) && arr.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i)
  const q = value.trim().toLowerCase().replace(/^#/, '')
  const matches = suggestions.filter((x) => !q || x.toLowerCase().includes(q)).slice(0, 8)
  const add = (tag: string) => {
    const clean = tag.trim().replace(/^#/, '')
    if (!clean) return
    run({ type: 'addTags', tags: [clean] })
    setValue('')
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {detail.tags.map((tg) => (
        <span key={tg.key} className="inline-flex items-center gap-1 rounded-full bg-primary-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
          #{tg.tag}
          {tg.can_remove ? (
            <button type="button" disabled={busy} onClick={() => run({ type: 'removeTag', key: tg.key })} title={t('subjects.tags.remove')} className="rounded-full p-0.5 hover:bg-primary-100 dark:hover:bg-primary-500/20">
              <Icon name="x" size={11} />
            </button>
          ) : <span className="w-1" />}
        </span>
      ))}
      {readOnly ? null : !adding ? (
        <button type="button" onClick={() => setAdding(true)} className="rounded-full border border-dashed border-surface-300 px-2.5 py-0.5 text-xs text-surface-500 hover:border-primary-400 hover:text-primary-600 dark:border-surface-600">
          + {t(detail.tags.length ? 'subjects.tags.add' : 'subjects.tags.addFirst')}
        </button>
      ) : (
        <div className="relative">
          <form onSubmit={(e) => { e.preventDefault(); add(value) }} className="flex items-center gap-1">
            <input
              autoFocus
              value={value}
              maxLength={32}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setAdding(false), setValue(''))}
              placeholder={t('subjects.tags.placeholder')}
              aria-label={t('subjects.tags.add')}
              className="w-44 rounded-full border border-primary-300 bg-white px-3 py-0.5 text-xs focus:outline-none dark:bg-surface-800"
            />
            <button type="button" onClick={() => { setAdding(false); setValue('') }} className="text-xs text-surface-400 hover:text-surface-700">{t('groupLeave.cancel')}</button>
          </form>
          {matches.length > 0 && (
            <div className="absolute left-0 top-full z-20 mt-1 flex w-72 flex-wrap gap-1 rounded-lg border border-surface-200 bg-white p-2 shadow-lg dark:border-surface-700 dark:bg-surface-800">
              {matches.map((m) => (
                <button key={m} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => add(m)} className="rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-700 hover:bg-primary-50 hover:text-primary-700 dark:bg-surface-700 dark:text-surface-200">
                  #{m}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
