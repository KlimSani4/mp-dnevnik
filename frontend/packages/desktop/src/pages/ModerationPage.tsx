import { useState } from 'react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { Badge, Button, Card } from '../components/ui'
import { APPLICATION_STATUS, SUPPORT_STATUS } from '../components/SupportSection'
import {
  useCurrentUser,
  useModerationAudit,
  useModerationStats,
  useModerators,
  useReviewTeacherApplication,
  useSupportRequests,
  useTeacherApplications,
  useUpdateSupportRequest,
} from '@nexora/shared'
import type { DayPoint, SupportRequest, SupportStatus } from '@nexora/shared'
import { useT, type MessageKey } from '../i18n'

type Tab = 'stats' | 'support' | 'teachers' | 'moderators' | 'audit'

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'stats', label: 'mod.tab.stats' },
  { id: 'support', label: 'mod.tab.support' },
  { id: 'teachers', label: 'mod.tab.teachers' },
  { id: 'moderators', label: 'mod.tab.moderators' },
  { id: 'audit', label: 'mod.tab.audit' },
]

/** Страница модератора платформы (#99). Видна только при user.is_moderator. */
export function ModerationPage() {
  const { t } = useT()
  const user = useCurrentUser().data
  const [tab, setTab] = useState<Tab>('stats')

  if (user && !user.is_moderator) {
    return (
      <div className="text-center py-20">
        <p className="font-medium text-surface-700 dark:text-surface-300">{t('mod.noAccess')}</p>
        <p className="text-sm text-surface-400 mt-1">{t('mod.noAccessHint')}</p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50 mb-6">{t('mod.title')}</h1>
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              tab === id
                ? 'bg-primary-500 text-white'
                : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700'
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>
      {user && tab === 'stats' && <StatsTab />}
      {user && tab === 'support' && <SupportTab />}
      {user && tab === 'teachers' && <TeachersTab />}
      {user && tab === 'moderators' && <ModeratorsTab />}
      {user && tab === 'audit' && <AuditTab />}
    </div>
  )
}

/* ─── Статистика ─── */

function StatsTab() {
  const { t } = useT()
  const { data, isLoading } = useModerationStats()
  if (isLoading || !data) return <p className="text-sm text-surface-400">{t('common.loading')}</p>

  const tiles: { label: MessageKey; value: number; sub?: string }[] = [
    { label: 'mod.stats.users', value: data.users_total, sub: t('mod.stats.newWeek', { n: data.users_new_7d }) },
    { label: 'mod.stats.active7', value: data.active_7d },
    { label: 'mod.stats.active30', value: data.active_30d },
    { label: 'mod.stats.groups', value: data.groups_total },
    { label: 'mod.stats.assignments', value: data.assignments_total, sub: t('mod.stats.newWeek', { n: data.assignments_new_7d }) },
    { label: 'mod.stats.notifications', value: data.notifications_7d },
    { label: 'mod.stats.supportOpen', value: data.support_open },
    { label: 'mod.stats.teacherPending', value: data.teacher_pending },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <Card key={tile.label} padding="default">
            <div className="text-xs text-surface-500 dark:text-surface-400">{t(tile.label)}</div>
            <div className="text-2xl font-semibold text-surface-900 dark:text-surface-50 mt-1">{tile.value}</div>
            {tile.sub && <div className="text-xs text-surface-400 mt-0.5">{tile.sub}</div>}
          </Card>
        ))}
      </div>
      <DayChart title={t('mod.stats.activeByDay')} points={data.active_by_day} />
      <DayChart title={t('mod.stats.newByDay')} points={data.new_users_by_day} />
    </div>
  )
}

function DayChart({ title, points }: { title: string; points: DayPoint[] }) {
  const { locale } = useT()
  const max = Math.max(1, ...points.map((p) => p.value))
  return (
    <Card padding="lg">
      <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300 mb-4">{title}</h3>
      <div className="flex items-end gap-1 h-32">
        {points.map((p) => (
          <div
            key={p.day}
            className="flex-1 rounded-t bg-primary-500/80 hover:bg-primary-500 min-h-[2px]"
            style={{ height: `${(p.value / max) * 100}%` }}
            title={`${format(new Date(p.day), 'd MMM', { locale })}: ${p.value}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-2xs text-surface-400 mt-1">
        <span>{points[0] && format(new Date(points[0].day), 'd MMM', { locale })}</span>
        <span>{points.at(-1) && format(new Date(points.at(-1)!.day), 'd MMM', { locale })}</span>
      </div>
    </Card>
  )
}

/* ─── Обращения ─── */

const STATUS_FILTERS: (SupportStatus | undefined)[] = ['new', 'in_progress', 'closed', undefined]

function SupportTab() {
  const { t } = useT()
  const [status, setStatus] = useState<SupportStatus | undefined>('new')
  const { data, isLoading } = useSupportRequests(status)

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s ?? 'all'}
            onClick={() => setStatus(s)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium',
              status === s ? 'bg-primary-500 text-white' : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'
            )}
          >
            {s ? t(SUPPORT_STATUS[s].label) : t('notif.filter.all')}
          </button>
        ))}
      </div>
      {isLoading ? (
        <p className="text-sm text-surface-400">{t('common.loading')}</p>
      ) : !data?.length ? (
        <p className="text-sm text-surface-400 py-10 text-center">{t('mod.support.empty')}</p>
      ) : (
        <div className="space-y-3">
          {data.map((r) => <SupportItem key={r.id} request={r} />)}
        </div>
      )}
    </div>
  )
}

function SupportItem({ request }: { request: SupportRequest }) {
  const { t, locale } = useT()
  const [reply, setReply] = useState('')
  const update = useUpdateSupportRequest()
  const st = SUPPORT_STATUS[request.status]

  return (
    <Card padding="default">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-sm font-medium text-surface-900 dark:text-surface-50">
          {request.user.display_name || t('common.student')}
          <span className="ml-2 text-xs font-normal text-surface-400">
            {format(new Date(request.created_at), 'd MMM, HH:mm', { locale })}
          </span>
        </div>
        <Badge variant={st.variant} size="sm">{t(st.label)}</Badge>
      </div>
      <p className="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap">{request.message}</p>
      {request.reply && (
        <p className="mt-2 border-l-2 border-primary-500 pl-3 text-sm text-surface-900 dark:text-surface-50 whitespace-pre-wrap">
          {request.reply}
        </p>
      )}
      {request.status !== 'closed' && (
        <div className="mt-3 space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder={t('mod.support.replyPlaceholder')}
            className="w-full rounded-lg border border-surface-200 bg-white p-2 text-sm dark:border-surface-600 dark:bg-surface-800 dark:text-surface-50"
          />
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant="primary"
              disabled={!reply.trim() || update.isPending}
              onClick={() => update.mutate({ id: request.id, data: { reply: reply.trim() } })}
            >
              {t('mod.support.replyClose')}
            </Button>
            {request.status === 'new' && (
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => update.mutate({ id: request.id, data: { status: 'in_progress' } })}
              >
                {t('mod.support.take')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: request.id, data: { status: 'closed' } })}
            >
              {t('mod.support.close')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

/* ─── Заявки преподавателей ─── */

function TeachersTab() {
  const { t, locale } = useT()
  const { data, isLoading } = useTeacherApplications('pending')
  const review = useReviewTeacherApplication()

  if (isLoading) return <p className="text-sm text-surface-400">{t('common.loading')}</p>
  if (!data?.length) return <p className="text-sm text-surface-400 py-10 text-center">{t('mod.teachers.empty')}</p>

  return (
    <div className="space-y-3">
      {data.map((a) => (
        <Card key={a.id} padding="default">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-surface-900 dark:text-surface-50">{a.full_name}</div>
              <div className="text-xs text-surface-500 dark:text-surface-400">
                {[a.department, a.user.display_name, format(new Date(a.created_at), 'd MMM', { locale })].filter(Boolean).join(' · ')}
              </div>
              {a.comment && <p className="mt-1 text-sm text-surface-700 dark:text-surface-300">{a.comment}</p>}
            </div>
            <Badge variant={APPLICATION_STATUS[a.status].variant} size="sm">{t(APPLICATION_STATUS[a.status].label)}</Badge>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="primary" disabled={review.isPending} onClick={() => review.mutate({ id: a.id, approve: true })}>
              {t('mod.teachers.approve')}
            </Button>
            <Button size="sm" variant="ghost" disabled={review.isPending} onClick={() => review.mutate({ id: a.id, approve: false })}>
              {t('mod.teachers.reject')}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

/* ─── Модераторы (только просмотр) ─── */

function ModeratorsTab() {
  const { t, locale } = useT()
  const { data, isLoading } = useModerators()
  return (
    <Card padding="lg">
      <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">{t('mod.moderators.hint')}</p>
      {isLoading ? (
        <p className="text-sm text-surface-400">{t('common.loading')}</p>
      ) : (
        <div className="divide-y divide-surface-100 dark:divide-surface-700">
          {data?.map((m) => (
            <div key={m.id} className="flex justify-between py-2.5 text-sm">
              <span className="text-surface-900 dark:text-surface-50">{m.display_name || m.id}</span>
              <span className="text-surface-400">
                {m.granted_at ? t('mod.moderators.since', { date: format(new Date(m.granted_at), 'd MMM yyyy', { locale }) }) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ─── Журнал ─── */

const ACTION_LABELS: Record<string, MessageKey> = {
  moderator_granted: 'mod.audit.moderator_granted',
  moderator_revoked: 'mod.audit.moderator_revoked',
  support_replied: 'mod.audit.support_replied',
  support_status_changed: 'mod.audit.support_status_changed',
  teacher_approved: 'mod.audit.teacher_approved',
  teacher_rejected: 'mod.audit.teacher_rejected',
}

function AuditTab() {
  const { t, locale } = useT()
  const { data, isLoading } = useModerationAudit()
  if (isLoading) return <p className="text-sm text-surface-400">{t('common.loading')}</p>
  if (!data?.length) return <p className="text-sm text-surface-400 py-10 text-center">{t('mod.audit.empty')}</p>
  return (
    <Card padding="lg">
      <div className="divide-y divide-surface-100 dark:divide-surface-700">
        {data.map((e) => (
          <div key={e.id} className="flex justify-between gap-3 py-2.5 text-sm">
            <span className="text-surface-900 dark:text-surface-50">
              {ACTION_LABELS[e.action] ? t(ACTION_LABELS[e.action]) : e.action}
              <span className="ml-2 text-surface-400">{e.user_name || t('mod.audit.server')}</span>
            </span>
            <span className="text-surface-400 whitespace-nowrap">{format(new Date(e.created_at), 'd MMM, HH:mm', { locale })}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
