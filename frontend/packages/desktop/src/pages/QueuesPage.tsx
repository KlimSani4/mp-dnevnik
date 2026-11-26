/**
 * Очередь на сдачу лабораторных (#62).
 *
 * Основной канал — бот (/queue), здесь те же очереди: список группы слева, выбранная
 * очередь справа (на телефоне — по очереди). Данные опрашиваются каждые несколько
 * секунд: очередь двигают из бота и с других устройств.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { clsx } from 'clsx'
import { format, parseISO } from 'date-fns'
import {
  ApiClientError,
  useCurrentUser,
  useGroupContext,
  useGroupQueues,
  useMyGroups,
  useOpenQueue,
  useQueue,
  useQueueAction,
  useQueueLessons,
} from '@nexora/shared'
import type {
  QueueAction,
  QueueDetail,
  QueueEntry,
  QueueMode,
  QueueStatus,
  QueueSummary,
} from '@nexora/shared'
import { Button, Card, Modal, Skeleton, DatePicker } from '../components/ui'
import { useT, type MessageKey } from '../i18n'

const MAX_LAB_CHIP = 12
const MODES: QueueMode[] = ['first_come', 'random', 'lab_number', 'debtors']

const STATUS_STYLE: Record<QueueStatus, string> = {
  open: 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
  started: 'bg-success-100 text-success-700 dark:bg-success-500/15 dark:text-success-500',
  closed: 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400',
}

// Тексты ошибок API → ключи перевода (сервер отвечает по-английски)
const ERRORS: Record<string, MessageKey> = {
  'Only the group head or assistant can manage the queue': 'queue.err.host',
  'Only approved group members can use the queue': 'queue.err.member',
  'Queue is closed': 'queue.err.closed',
  'Queue is already closed': 'queue.err.closed',
  'Queue for this lesson is already open': 'queue.err.exists',
  'You are already in this queue': 'queue.err.already',
  'You are already last': 'queue.err.last',
  'Nobody to let ahead': 'queue.err.nobody',
  'You can only ask someone ahead of you who is still waiting': 'queue.err.swapAhead',
  'You already have a pending swap request': 'queue.err.swapPending',
  'Swap request is no longer active': 'queue.err.swapGone',
}

function useErrorText() {
  const { t } = useT()
  return (e: unknown): string | null => {
    if (!e) return null
    if (e instanceof ApiClientError) {
      if (e.message.startsWith('At most ')) return t('queue.err.maxLabs', { n: e.message.split(' ')[2] })
      const key = ERRORS[e.message]
      if (key) return t(key)
    }
    return t('queue.err.generic')
  }
}

function hhmm(time: string | null): string {
  return time ? time.slice(0, 5) : ''
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

export function QueuesPage() {
  const { t } = useT()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { groupCode, isLoading: groupLoading } = useGroupContext()
  const listQuery = useGroupQueues(groupCode)
  const [opening, setOpening] = useState(false)
  const queues = listQuery.data ?? []
  const user = useCurrentUser().data
  const membership = useMyGroups().data?.find((m) => m.group.code === groupCode)
  // Открывать очередь может староста, заместитель, помощник или модератор платформы
  const canHost =
    !!user?.is_moderator || (!!membership?.verified && membership.role !== 'student')

  // На широком экране сразу показываем первую активную очередь
  useEffect(() => {
    if (id || !queues.length || window.matchMedia('(max-width: 767px)').matches) return
    const first = queues.find((q) => q.status !== 'closed') ?? queues[0]
    navigate(`/queues/${first.id}`, { replace: true })
  }, [id, queues, navigate])

  if (!groupLoading && !groupCode) {
    return (
      <div>
        <PageTitle />
        <Card className="text-center py-10">
          <p className="text-surface-600 dark:text-surface-300">{t('queue.noGroup')}</p>
          <Link to="/settings?section=group" className="mt-3 inline-block text-primary-600 dark:text-primary-400 font-medium">
            {t('queue.noGroupLink')}
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <PageTitle />
        {canHost && (
          <Button size="sm" onClick={() => setOpening(true)} icon={<span aria-hidden>＋</span>}>
            {t('queue.open')}
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <div className={clsx(id && 'hidden md:block')}>
          <QueueList queues={queues} loading={listQuery.isLoading || groupLoading} activeId={id} />
        </div>
        <div className={clsx(!id && 'hidden md:block', 'min-w-0')}>
          {id ? (
            <QueueView id={id} onBack={() => navigate('/queues')} />
          ) : (
            <Card className="text-center py-16 text-surface-500 dark:text-surface-400">
              {t('queue.pick')}
            </Card>
          )}
        </div>
      </div>

      {groupCode && canHost && (
        <OpenQueueModal
          open={opening}
          groupCode={groupCode}
          onClose={() => setOpening(false)}
          onOpened={(qid) => {
            setOpening(false)
            navigate(`/queues/${qid}`)
          }}
        />
      )}
    </div>
  )
}

function PageTitle() {
  const { t } = useT()
  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">{t('queue.title')}</h1>
      <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">{t('queue.subtitle')}</p>
    </div>
  )
}

// ─── Список ───

function QueueList({ queues, loading, activeId }: { queues: QueueSummary[]; loading: boolean; activeId?: string }) {
  const { t } = useT()
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    )
  }
  if (!queues.length) {
    return (
      <Card className="text-center py-8 text-sm text-surface-500 dark:text-surface-400">
        {t('queue.empty')}
        <div className="mt-2 text-xs">{t('queue.emptyHint')}</div>
      </Card>
    )
  }
  return (
    <ul className="space-y-2">
      {queues.map((q) => (
        <li key={q.id}>
          <Link
            to={`/queues/${q.id}`}
            className={clsx(
              'block rounded-xl border px-4 py-3 transition-colors',
              q.id === activeId
                ? 'border-primary-400 bg-primary-50/60 dark:border-primary-500 dark:bg-primary-500/10'
                : 'border-surface-200 bg-white hover:border-surface-300 dark:border-surface-700 dark:bg-surface-800 dark:hover:border-surface-600',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-surface-900 dark:text-surface-50 truncate">{q.title}</span>
              <StatusPill status={q.status} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-surface-500 dark:text-surface-400 tabular-nums">
              <span>{format(parseISO(q.lesson_date), 'dd.MM')}{q.start_time && ` · ${hhmm(q.start_time)}`}</span>
              <span>{t('queue.inLine', { n: q.waiting })}</span>
              {q.my_position != null && (
                <span className="ml-auto font-semibold text-primary-600 dark:text-primary-400">
                  {q.my_status === 'current' ? t('queue.youNow') : t('queue.youPos', { n: q.my_position })}
                </span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function StatusPill({ status }: { status: QueueStatus }) {
  const { t } = useT()
  return (
    <span className={clsx('shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold', STATUS_STYLE[status])}>
      {t(`queue.status.${status}` as MessageKey)}
    </span>
  )
}

// ─── Очередь ───

function QueueView({ id, onBack }: { id: string; onBack: () => void }) {
  const { t } = useT()
  const query = useQueue(id)
  const action = useQueueAction(id)
  const errorText = useErrorText()
  const q = query.data

  useEffect(() => action.reset(), [id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (query.isLoading) return <Skeleton className="h-96 rounded-xl" />
  if (!q) {
    return (
      <Card className="text-center py-10 text-surface-500">
        {errorText(query.error) ?? t('queue.err.generic')}
      </Card>
    )
  }

  const run = (a: QueueAction) => action.mutate(a)
  const active = q.status !== 'closed'
  const me = q.me && (q.me.status === 'waiting' || q.me.status === 'current') ? q.me : null

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="md:hidden text-sm text-primary-600 dark:text-primary-400">
        ← {t('queue.back')}
      </button>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">{q.title}</h2>
            <p className="mt-0.5 text-sm text-surface-500 dark:text-surface-400 tabular-nums">
              {format(parseISO(q.lesson_date), 'dd.MM.yyyy')}
              {q.start_time && ` · ${hhmm(q.start_time)}`}
              {' · '}{t(`queue.mode.${q.mode}` as MessageKey)}
              {' · '}{t('queue.maxLabs', { n: q.max_labs })}
            </p>
          </div>
          <StatusPill status={q.status} />
        </div>

        {q.is_host && active && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-100 pt-4 dark:border-surface-700">
            {q.status === 'open' && (
              <Button size="sm" variant="success" disabled={action.isPending} onClick={() => run({ type: 'start' })}>
                ▶ {t('queue.start')}
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={action.isPending} onClick={() => run({ type: 'close' })}>
              {t('queue.close')}
            </Button>
            {q.status === 'open' && (
              <span className="self-center text-xs text-surface-500 dark:text-surface-400">
                {t(`queue.startHint.${q.mode}` as MessageKey)}
              </span>
            )}
          </div>
        )}
      </Card>

      {action.error && (
        <div role="alert" className="rounded-lg bg-danger-50 px-4 py-2.5 text-sm text-danger-700 dark:bg-danger-500/10 dark:text-danger-500">
          {errorText(action.error)}
        </div>
      )}

      {q.incoming_swaps.map((s) => (
        <Card key={s.id} className="flex flex-wrap items-center gap-3 border border-warning-500/50 dark:border-warning-500/40">
          <span className="flex-1 text-sm text-surface-800 dark:text-surface-100">
            {t('queue.swapIncoming', { name: s.from_name })}
          </span>
          <Button size="sm" variant="success" disabled={action.isPending} onClick={() => run({ type: 'respond', swapId: s.id, accept: true })}>
            {t('queue.swapAccept')}
          </Button>
          <Button size="sm" variant="ghost" disabled={action.isPending} onClick={() => run({ type: 'respond', swapId: s.id, accept: false })}>
            {t('queue.swapDecline')}
          </Button>
        </Card>
      ))}

      {active && <MyCard q={q} me={me} busy={action.isPending} run={run} />}

      <Card padding="none">
        <div className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-wide text-surface-500 dark:text-surface-400">
          {t('queue.line')}
        </div>
        {q.entries.length === 0 ? (
          <p className="px-4 pb-5 text-sm text-surface-500 dark:text-surface-400">{t('queue.lineEmpty')}</p>
        ) : (
          <ol className="divide-y divide-surface-100 dark:divide-surface-700">
            {q.entries.map((e) => (
              <LineRow key={e.id} e={e} q={q} me={me} busy={action.isPending} run={run} />
            ))}
          </ol>
        )}
      </Card>

      {q.finished.length > 0 && <Finished entries={q.finished} />}
    </div>
  )
}

function MyCard({ q, me, busy, run }: { q: QueueDetail; me: QueueEntry | null; busy: boolean; run: (a: QueueAction) => void }) {
  const { t } = useT()
  const [editing, setEditing] = useState(false)
  const [labs, setLabs] = useState<number[]>(me?.labs ?? [])

  useEffect(() => {
    setLabs(me?.labs ?? [])
    setEditing(false)
  }, [me?.id, me?.labs.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const picker = (
    <LabPicker value={labs} max={q.max_labs} onChange={setLabs} />
  )

  if (!me) {
    return (
      <Card>
        <p className="text-sm font-medium text-surface-800 dark:text-surface-100">{t('queue.whichLabs', { n: q.max_labs })}</p>
        <div className="mt-3">{picker}</div>
        <Button className="mt-4" disabled={busy || !labs.length || labs.length > q.max_labs} onClick={() => run({ type: 'join', labs })}>
          {t('queue.join')}
        </Button>
      </Card>
    )
  }

  const current = me.status === 'current'
  const someoneAtDesk = q.entries.some((e) => e.status === 'current')
  const ahead = current ? 0 : me.position - 1 + (someoneAtDesk ? 1 : 0)
  const isLast = !current && me.position === q.entries.filter((e) => e.status === 'waiting').length

  return (
    <Card className={clsx(current && 'ring-2 ring-success-500')}>
      <div className="flex items-center gap-4">
        <div className={clsx(
          'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold tabular-nums',
          current
            ? 'bg-success-500 text-white'
            : 'bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300',
        )}>
          {current ? '▶' : me.position}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-surface-900 dark:text-surface-50">
            {current ? t('queue.yourTurn') : t('queue.youPosLong', { n: me.position })}
          </div>
          <div className="text-sm text-surface-500 dark:text-surface-400">
            {current ? t('queue.yourTurnHint') : t('queue.ahead', { n: ahead })}
            {' · '}{t('queue.labsShort', { labs: me.labs.join(', ') })}
          </div>
          {q.outgoing_swap && (
            <div className="mt-1 text-xs text-warning-600 dark:text-warning-500">
              {t('queue.swapWaiting', { name: q.outgoing_swap.to_name })}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-4">
          {picker}
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy || !labs.length || labs.length > q.max_labs} onClick={() => run({ type: 'labs', labs })}>
              {t('queue.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('queue.cancel')}</Button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!editing && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>{t('queue.editLabs')}</Button>
        )}
        <Button size="sm" variant="secondary" disabled={busy || isLast} onClick={() => run({ type: 'skip', toEnd: false })}>
          {t('queue.skip')}
        </Button>
        <Button size="sm" variant="secondary" disabled={busy || isLast} onClick={() => run({ type: 'skip', toEnd: true })}>
          {t('queue.toEnd')}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto text-danger-600 dark:text-danger-500" disabled={busy} onClick={() => run({ type: 'leave' })}>
          {t('queue.leave')}
        </Button>
      </div>
    </Card>
  )
}

function LineRow({ e, q, me, busy, run }: { e: QueueEntry; q: QueueDetail; me: QueueEntry | null; busy: boolean; run: (a: QueueAction) => void }) {
  const { t } = useT()
  const current = e.status === 'current'
  const canSwap =
    me?.status === 'waiting' && !q.outgoing_swap && e.status === 'waiting' && e.position < me.position

  return (
    <li className={clsx('px-4 py-3', current && 'bg-success-50/70 dark:bg-success-500/10', e.is_me && !current && 'bg-primary-50/50 dark:bg-primary-500/5')}>
      <div className="flex items-center gap-3">
        <span className={clsx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums',
          current ? 'bg-success-500 text-white' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
        )}>
          {current ? <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" /></span> : e.position}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-surface-900 dark:text-surface-50">
            {e.name}{e.is_me && <span className="ml-1.5 text-xs font-normal text-primary-600 dark:text-primary-400">{t('queue.you')}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            {current && <span className="mr-1 text-xs font-medium text-success-700 dark:text-success-500">{t('queue.atDesk')}</span>}
            {e.labs.map((n) => (
              <span key={n} className="rounded bg-surface-100 px-1.5 text-2xs font-medium tabular-nums text-surface-600 dark:bg-surface-700 dark:text-surface-300">
                {t('queue.labN', { n })}
              </span>
            ))}
            {e.skips > 0 && <span className="text-2xs text-surface-400">· {t('queue.skips', { n: e.skips })}</span>}
          </div>
        </div>
        {canSwap && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run({ type: 'swap', targetEntryId: e.id })}>
            ⇅ {t('queue.swapAsk')}
          </Button>
        )}
      </div>
      {current && q.is_host && (
        <div className="mt-3 flex flex-wrap gap-2 pl-11">
          <Button size="sm" variant="success" disabled={busy} onClick={() => run({ type: 'result', entryId: e.id, result: 'passed' })}>
            {t('queue.passed')}
          </Button>
          <Button size="sm" variant="danger" disabled={busy} onClick={() => run({ type: 'result', entryId: e.id, result: 'failed' })}>
            {t('queue.failed')}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => run({ type: 'result', entryId: e.id, result: 'absent' })}>
            {t('queue.absent')}
          </Button>
        </div>
      )}
    </li>
  )
}

function Finished({ entries }: { entries: QueueEntry[] }) {
  const { t } = useT()
  const passed = entries.filter((e) => e.status === 'passed').length
  return (
    <details className="group rounded-xl border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm text-surface-600 dark:text-surface-300">
        <span className="font-medium">{t('queue.finished')}</span>
        <span className="ml-2 tabular-nums">✓ {passed} · ✕ {entries.length - passed}</span>
      </summary>
      <ul className="divide-y divide-surface-100 border-t border-surface-100 dark:divide-surface-700 dark:border-surface-700">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className={e.status === 'passed' ? 'text-success-600' : 'text-danger-500'}>{e.status === 'passed' ? '✓' : '✕'}</span>
            <span className="flex-1 truncate text-surface-800 dark:text-surface-100">{e.name}</span>
            <span className="text-xs tabular-nums text-surface-500">{e.labs.map((n) => t('queue.labN', { n })).join(', ')}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function LabPicker({ value, max, onChange }: { value: number[]; max: number; onChange: (v: number[]) => void }) {
  const { t } = useT()
  const toggle = (n: number) =>
    onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => a - b))
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {Array.from({ length: MAX_LAB_CHIP }, (_, i) => i + 1).map((n) => {
          const on = value.includes(n)
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(n)}
              className={clsx(
                'h-9 rounded-lg text-sm font-medium tabular-nums transition-colors',
                on
                  ? 'bg-primary-500 text-white'
                  : 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600',
              )}
            >
              {n}
            </button>
          )
        })}
      </div>
      {value.length > max && (
        <p className="mt-2 text-xs text-danger-600 dark:text-danger-500">{t('queue.tooMany', { n: max })}</p>
      )}
    </div>
  )
}

// ─── Открыть очередь ───

function OpenQueueModal({ open, groupCode, onClose, onOpened }: {
  open: boolean
  groupCode: string
  onClose: () => void
  onOpened: (id: string) => void
}) {
  const { t } = useT()
  const errorText = useErrorText()
  const [date, setDate] = useState(todayIso)
  const [entryId, setEntryId] = useState<string | null>(null)
  const [mode, setMode] = useState<QueueMode>('first_come')
  const [maxLabs, setMaxLabs] = useState(3)
  const lessons = useQueueLessons(groupCode, date, open)
  const openQueue = useOpenQueue()

  useEffect(() => {
    if (!open) return
    setEntryId(null)
    openQueue.reset()
  }, [open, date]) // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => lessons.data ?? [], [lessons.data])

  return (
    <Modal open={open} onClose={onClose} title={t('queue.openTitle')} scrollOnOverflow>
      <div className="space-y-5">
        <DatePicker value={date} onChange={setDate} label={t('queue.date')} />

        <div>
          <div className="mb-2 text-sm font-medium text-surface-700 dark:text-surface-200">{t('queue.lesson')}</div>
          {lessons.isLoading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : lessons.error ? (
            <p className="text-sm text-danger-600">{errorText(lessons.error)}</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-surface-500">{t('queue.noLessons')}</p>
          ) : (
            <div className="space-y-1.5">
              {options.map((o) => (
                <button
                  key={o.entry_id}
                  type="button"
                  disabled={!!o.queue_id}
                  onClick={() => setEntryId(o.entry_id)}
                  className={clsx(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
                    entryId === o.entry_id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                      : 'border-surface-200 hover:border-surface-300 dark:border-surface-700',
                  )}
                >
                  <span className="tabular-nums text-surface-500">{hhmm(o.start_time)}</span>
                  <span className="flex-1 truncate font-medium text-surface-900 dark:text-surface-50">{o.title}</span>
                  {o.queue_id ? (
                    <span className="text-xs text-surface-500">{t('queue.alreadyOpen')}</span>
                  ) : o.lesson_type ? (
                    <span className="text-xs text-surface-500">{o.lesson_type}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-surface-700 dark:text-surface-200">{t('queue.order')}</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={clsx(
                  'rounded-lg border px-3 py-2 text-left transition-colors',
                  mode === m ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10' : 'border-surface-200 hover:border-surface-300 dark:border-surface-700',
                )}
              >
                <div className="text-sm font-medium text-surface-900 dark:text-surface-50">{t(`queue.mode.${m}` as MessageKey)}</div>
                <div className="mt-0.5 text-xs text-surface-500 dark:text-surface-400">{t(`queue.modeHint.${m}` as MessageKey)}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-surface-500 dark:text-surface-400">{t('queue.swapNote')}</p>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-surface-700 dark:text-surface-200">{t('queue.maxLabsLabel')}</div>
          <div className="inline-flex rounded-lg bg-surface-100 p-1 dark:bg-surface-700">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMaxLabs(n)}
                className={clsx(
                  'h-8 w-10 rounded-md text-sm font-medium tabular-nums',
                  maxLabs === n ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-800 dark:text-surface-50' : 'text-surface-500',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {openQueue.error && <p role="alert" className="text-sm text-danger-600">{errorText(openQueue.error)}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t('queue.cancel')}</Button>
          <Button
            disabled={!entryId || openQueue.isPending}
            onClick={() =>
              entryId &&
              openQueue.mutate(
                { group_code: groupCode, entry_id: entryId, lesson_date: date, mode, max_labs: maxLabs },
                { onSuccess: (q) => onOpened(q.id) },
              )
            }
          >
            {t('queue.openSubmit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
