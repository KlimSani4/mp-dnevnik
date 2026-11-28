import { useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import { Badge, Button, Card, Icon, SearchInput } from '../components/ui'
import { GroupMembers } from '../components/GroupMembers'
import { DaySeriesChart, Funnel, SegmentedBar, StatTile, fmt } from '../components/moderation/charts'
import { DELIVERY, MONITORING, type ToolLink } from '../components/moderation/tools'
import { APPLICATION_STATUS, SUPPORT_STATUS } from '../components/SupportSection'
import {
  useCurrentUser,
  useModerationAudit,
  useModerationGroups,
  useModerationStats,
  useModerators,
  useReviewTeacherApplication,
  useSupportRequests,
  useTeacherApplications,
  useUpdateSupportRequest,
} from '@nexora/shared'
import type { SupportRequest, SupportStatus } from '@nexora/shared'
import { useT, type MessageKey } from '../i18n'

type Tab = 'stats' | 'support' | 'teachers' | 'groups' | 'moderators' | 'audit' | 'tools'

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'stats', label: 'mod.tab.stats' },
  { id: 'support', label: 'mod.tab.support' },
  { id: 'teachers', label: 'mod.tab.teachers' },
  { id: 'groups', label: 'mod.tab.groups' },
  { id: 'moderators', label: 'mod.tab.moderators' },
  { id: 'audit', label: 'mod.tab.audit' },
  { id: 'tools', label: 'mod.tab.tools' },
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
      {user && tab === 'groups' && <GroupsTab />}
      {user && tab === 'moderators' && <ModeratorsTab />}
      {user && tab === 'audit' && <AuditTab />}
      {user && tab === 'tools' && <ToolsTab />}
    </div>
  )
}

/* ─── Статистика (#152) ─── */

const TASK_SEGMENTS: { key: string; label: MessageKey; color: string; ink?: 'dark' }[] = [
  { key: 'todo', label: 'mod.stats.task.todo', color: 'bg-[#71717a]' },
  { key: 'doing', label: 'mod.stats.task.doing', color: 'bg-[#3b82f6]' },
  { key: 'review', label: 'mod.stats.task.review', color: 'bg-[#f59e0b] dark:bg-[#d97706]', ink: 'dark' },
  { key: 'done', label: 'mod.stats.task.done', color: 'bg-[#15803d] dark:bg-[#16a34a]' },
]

const SUPPORT_SEGMENTS: { key: string; label: MessageKey; color: string; ink?: 'dark' }[] = [
  { key: 'new', label: 'support.status.new', color: 'bg-[#f59e0b] dark:bg-[#d97706]', ink: 'dark' },
  { key: 'in_progress', label: 'support.status.in_progress', color: 'bg-[#3b82f6]' },
  { key: 'closed', label: 'support.status.closed', color: 'bg-[#15803d] dark:bg-[#16a34a]' },
]

const NOTIFICATION_TYPES: Record<string, MessageKey> = {
  schedule_change: 'mod.stats.notif.schedule_change',
  new_assignment: 'mod.stats.notif.new_assignment',
  deadline: 'mod.stats.notif.deadline',
  vote: 'mod.stats.notif.vote',
  digest: 'mod.stats.notif.digest',
  class_reminder: 'mod.stats.notif.class_reminder',
}

function Section({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <Card padding="lg" className={className}>
      <h3 className="mb-4 text-sm font-semibold text-surface-800 dark:text-surface-100">{title}</h3>
      {children}
    </Card>
  )
}

function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-surface-500 dark:text-surface-400">{label}</span>
      <span
        className={clsx(
          'font-semibold tabular-nums',
          tone === 'warn' ? 'text-warning-600 dark:text-warning-500' : 'text-surface-900 dark:text-surface-50',
        )}
      >
        {value}
      </span>
    </div>
  )
}

function StatsTab() {
  const { t, locale } = useT()
  const { data, isLoading } = useModerationStats()
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-surface-100 dark:bg-surface-800" />
        ))}
      </div>
    )
  }

  const week = t('mod.stats.vsPrevWeek')
  const stickiness = data.active_30d ? Math.round(((data.active_1d ?? 0) / data.active_30d) * 100) : 0
  const spark = data.active_by_day.slice(-14).map((p) => p.value)
  const tasks = data.tasks_by_state ?? []
  const tasksTotal = tasks.reduce((s, x) => s + x.value, 0)
  const tasksDone = tasks.find((x) => x.key === 'done')?.value ?? 0
  const notif = data.notifications_by_type_7d ?? []
  const notifMax = Math.max(1, ...notif.map((x) => x.value))
  const value = (list: { key: string; value: number }[] | undefined, key: string) =>
    list?.find((x) => x.key === key)?.value ?? 0

  return (
    <div className="space-y-4">
      {/* Главные числа */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          emphasis
          label={t('mod.stats.dau')}
          value={data.active_1d ?? 0}
          spark={spark}
          hint={t('mod.stats.stickiness', { n: stickiness })}
        />
        <StatTile
          label={t('mod.stats.active7')}
          value={data.active_7d}
          hint={t('mod.stats.active30short', { n: fmt(data.active_30d) })}
        />
        <StatTile
          label={t('mod.stats.newUsers7')}
          value={data.users_new_7d}
          delta={{ value: data.users_new_7d - (data.users_new_prev_7d ?? 0), period: week }}
          hint={t('mod.stats.usersTotal', { n: fmt(data.users_total) })}
        />
        <StatTile
          label={t('mod.stats.newAssignments7')}
          value={data.assignments_new_7d}
          delta={{ value: data.assignments_new_7d - (data.assignments_new_prev_7d ?? 0), period: week }}
          hint={t('mod.stats.assignmentsTotal', { n: fmt(data.assignments_total) })}
        />
      </div>

      <DaySeriesChart
        kind="area"
        title={t('mod.stats.activeByDay')}
        subtitle={t('mod.stats.last30')}
        valueLabel={t('mod.stats.activeShort')}
        points={data.active_by_day}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <DaySeriesChart
          kind="columns"
          title={t('mod.stats.newByDay')}
          subtitle={t('mod.stats.last30')}
          valueLabel={t('mod.stats.totalFor30')}
          points={data.new_users_by_day}
        />
        <DaySeriesChart
          kind="columns"
          title={t('mod.stats.assignmentsByDay')}
          subtitle={t('mod.stats.last30')}
          valueLabel={t('mod.stats.totalFor30')}
          points={data.assignments_by_day ?? []}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={t('mod.stats.funnel')}>
          <Funnel
            steps={[
              { label: t('mod.stats.funnel.registered'), value: data.users_total },
              { label: t('mod.stats.funnel.requested'), value: data.users_requested_group ?? 0 },
              { label: t('mod.stats.funnel.inGroup'), value: data.users_in_group ?? 0 },
            ]}
          />
          <p className="mt-4 text-xs text-surface-400 dark:text-surface-500">{t('mod.stats.funnel.hint')}</p>
        </Section>

        <Section title={t('mod.stats.groups')}>
          <Row label={t('mod.stats.groupsTotal')} value={fmt(data.groups_total)} />
          <Row label={t('mod.stats.groupsActive')} value={fmt(data.groups_active ?? 0)} />
          <Row
            label={t('mod.stats.groupsNoStarosta')}
            value={fmt(data.groups_without_starosta ?? 0)}
            tone={(data.groups_without_starosta ?? 0) > 0 ? 'warn' : undefined}
          />
          <Row
            label={t('mod.stats.joinPending')}
            value={fmt(data.join_requests_pending ?? 0)}
            tone={(data.join_requests_pending ?? 0) > 0 ? 'warn' : undefined}
          />
          {(data.top_groups?.length ?? 0) > 0 && (
            <table className="mt-3 w-full text-xs">
              <caption className="mb-1 text-left text-surface-400 dark:text-surface-500">{t('mod.stats.topGroups')}</caption>
              <thead>
                <tr className="text-surface-400">
                  <th className="py-1 text-left font-normal">{t('mod.stats.col.group')}</th>
                  <th className="py-1 text-right font-normal">{t('mod.stats.col.members')}</th>
                  <th className="py-1 text-right font-normal">{t('mod.stats.col.assignments30')}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.top_groups!.map((g) => (
                  <tr key={g.code} className="border-t border-surface-100 dark:border-surface-700">
                    <td className="py-1.5 font-medium text-surface-800 dark:text-surface-100">{g.code}</td>
                    <td className="py-1.5 text-right text-surface-700 dark:text-surface-200">{fmt(g.members)}</td>
                    <td className="py-1.5 text-right text-surface-700 dark:text-surface-200">{fmt(g.assignments_30d)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={t('mod.stats.tasks')}>
          <SegmentedBar
            emptyText={t('mod.stats.noData')}
            segments={TASK_SEGMENTS.map((s) => ({ ...s, label: t(s.label), value: value(tasks, s.key) }))}
          />
          <div className="mt-4 border-t border-surface-100 pt-2 dark:border-surface-700">
            <Row label={t('mod.stats.tasksDone7')} value={fmt(data.tasks_done_7d ?? 0)} />
            <Row
              label={t('mod.stats.completion')}
              value={tasksTotal ? `${Math.round((tasksDone / tasksTotal) * 100)}%` : '—'}
            />
            <Row
              label={t('mod.stats.personalShare')}
              value={data.assignments_total ? `${Math.round(((data.assignments_personal ?? 0) / data.assignments_total) * 100)}%` : '—'}
            />
          </div>
        </Section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section title={t('mod.stats.support')}>
          <SegmentedBar
            emptyText={t('mod.stats.noData')}
            segments={SUPPORT_SEGMENTS.map((s) => ({ ...s, label: t(s.label), value: value(data.support_by_status, s.key) }))}
          />
          <div className="mt-4 border-t border-surface-100 pt-2 dark:border-surface-700">
            <Row
              label={t('mod.stats.replyMedian')}
              value={data.support_median_reply_hours == null ? '—' : t('mod.stats.hours', { n: data.support_median_reply_hours.toLocaleString(locale.code) })}
            />
            <Row
              label={t('mod.stats.teacherPending')}
              value={fmt(data.teacher_pending)}
              tone={data.teacher_pending > 0 ? 'warn' : undefined}
            />
          </div>
        </Section>

        <Section title={t('mod.stats.notifications')}>
          {notif.length === 0 ? (
            <p className="py-3 text-sm text-surface-400">{t('mod.stats.noData')}</p>
          ) : (
            <ul className="space-y-2.5">
              {notif.map((n) => (
                <li key={n.key}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-surface-600 dark:text-surface-300">
                      {NOTIFICATION_TYPES[n.key] ? t(NOTIFICATION_TYPES[n.key]) : n.key}
                    </span>
                    <span className="font-semibold tabular-nums text-surface-900 dark:text-surface-50">{fmt(n.value)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-100 dark:bg-surface-700">
                    <div className="h-2 rounded-full bg-primary-500" style={{ width: `${(n.value / notifMax) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-xs text-surface-400 dark:text-surface-500">
            {t('mod.stats.notificationsTotal', { n: fmt(data.notifications_7d) })}
          </p>
        </Section>
      </div>
    </div>
  )
}

/* ─── Инструменты (#152) ─── */

function ToolsTab() {
  const { t } = useT()
  const group = (title: string, items: ToolLink[]) => (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-surface-800 dark:text-surface-100">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((tool) =>
          tool.url ? (
            <a
              key={tool.id}
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-xl border border-surface-200 bg-white p-4 transition-colors hover:border-primary-500/60 dark:border-surface-700 dark:bg-surface-800"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                <Icon name={tool.icon} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold text-surface-900 dark:text-surface-50">
                  {tool.title}
                  <Icon name="external-link" size={12} className="text-surface-400 group-hover:text-primary-500" />
                </span>
                <span className="mt-0.5 block text-xs text-surface-500 dark:text-surface-400">{t(tool.description)}</span>
              </span>
            </a>
          ) : (
            <div
              key={tool.id}
              aria-disabled
              className="flex items-start gap-3 rounded-xl border border-dashed border-surface-200 p-4 dark:border-surface-700"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-100 text-surface-400 dark:bg-surface-700">
                <Icon name={tool.icon} size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-surface-500 dark:text-surface-400">
                  {tool.title}
                  <Badge size="sm" variant="default">{t('mod.tools.soon')}</Badge>
                </span>
                <span className="mt-0.5 block text-xs text-surface-400 dark:text-surface-500">{t(tool.description)}</span>
                {tool.env && <code className="mt-1 block text-2xs text-surface-400">{tool.env}</code>}
              </span>
            </div>
          ),
        )}
      </div>
    </div>
  )
  return (
    <div className="space-y-6">
      <p className="text-sm text-surface-500 dark:text-surface-400">{t('mod.tools.hint')}</p>
      {group(t('mod.tools.monitoring'), MONITORING)}
      {group(t('mod.tools.delivery'), DELIVERY)}
    </div>
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

/* ─── Группы (#150) ─── */

/**
 * Все группы платформы. Модератор открывает любую и работает с участниками как
 * староста: подтверждает и отклоняет заявки, назначает помощника. Всё — в журнал.
 */
function GroupsTab() {
  const { t } = useT()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const { data, isLoading } = useModerationGroups(q.trim())

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-surface-500 dark:text-surface-400">{t('mod.groups.hint')}</p>
        <div className="sm:w-64">
          <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('mod.groups.search')} />
        </div>
      </div>
      {isLoading ? (
        <p className="text-sm text-surface-400">{t('common.loading')}</p>
      ) : !data?.length ? (
        <p className="py-10 text-center text-sm text-surface-400">{t('mod.groups.empty')}</p>
      ) : (
        data.map((g) => {
          const isOpen = open === g.code
          return (
            <Card key={g.code} padding="none" className="overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : g.code)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-50 dark:hover:bg-surface-700/40"
              >
                <span className="font-semibold text-surface-900 dark:text-surface-50">{g.code}</span>
                <span className="flex-1 truncate text-sm text-surface-500 dark:text-surface-400">
                  {g.starosta_name ? t('mod.groups.starosta', { name: g.starosta_name }) : t('mod.groups.noStarosta')}
                </span>
                <span className="hidden text-xs text-surface-400 sm:inline">{t('mod.groups.members', { n: g.members })}</span>
                {g.pending > 0 && (
                  <Badge variant="high" size="sm">
                    {t('mod.groups.pending', { n: g.pending })}
                  </Badge>
                )}
                <Icon
                  name="chevron-down"
                  size={16}
                  className={clsx('text-surface-400 transition-transform', isOpen && 'rotate-180')}
                />
              </button>
              {isOpen && (
                <div className="border-t border-surface-100 px-4 py-3 dark:border-surface-700">
                  <p className="mb-3 text-xs text-warning-600 dark:text-warning-500">{t('mod.groups.actingAs')}</p>
                  <GroupMembers code={g.code} canReview canManageRoles canAppointStarosta canRemove />
                </div>
              )}
            </Card>
          )
        })
      )}
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
  student_verified_by_moderator: 'mod.audit.student_verified_by_moderator',
  student_rejected_by_moderator: 'mod.audit.student_rejected_by_moderator',
  role_changed_by_moderator: 'mod.audit.role_changed_by_moderator',
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
