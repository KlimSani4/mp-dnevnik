import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow, differenceInMinutes, isBefore } from 'date-fns'
import { dateLocale, translate, translatePlural, useT, type MessageKey } from '../i18n'
import clsx from 'clsx'
import { Card, Badge, ProgressBar, Button, Icon, Avatar } from '../components/ui'
import { useCurrentUser, useTodaySchedule, useTasks, useUpdateTask, useGroupContext, useDashboard } from '@nexora/shared'

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

interface ScheduleEntry {
  id: string
  pair_number: number
  start_time: string
  end_time: string
  location: string | null
  room: string | null
  teacher: string | null
  lesson_type: 'очно' | 'онлайн' | 'вебинар'
  is_session?: boolean
  subject: { id: string; name: string; short_name?: string | null }
  link?: string
}

interface Assignment {
  id: string
  title: string
  description: string
  deadline: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  votes_up: number
  votes_down: number
  is_verified: boolean
  subject: { id: string; name: string }
  created_at: string
}

interface Task {
  id: string
  state: 'todo' | 'review' | 'done'
  assignment: Assignment
  updated_at: string
}

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return translate('home.greeting.morning')
  if (hour >= 12 && hour < 18) return translate('home.greeting.day')
  if (hour >= 18 && hour < 23) return translate('home.greeting.evening')
  return translate('home.greeting.night')
}

function getPairCountText(n: number): string {
  if (n === 0) return translate('onb.noLessons')
  return translatePlural('home.pairsToday', n)
}

function parseTime(timeStr: string): Date {
  const parts = timeStr.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function formatTime(timeStr: string): string {
  // Trim HH:mm:ss → HH:mm
  return timeStr.slice(0, 5)
}

function formatWindowDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return translate('time.min', { m })
  if (m === 0) return translate('time.h', { h })
  return translate('time.hMin', { h, m })
}

type LessonIconType = 'очно' | 'онлайн' | 'вебинар'

const lessonTypeConfig: Record<
  LessonIconType,
  { icon: string; iconBg: string; label: MessageKey }
> = {
  'очно': {
    icon: 'map-pin',
    iconBg: 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400',
    label: 'home.lesson.offline',
  },
  'онлайн': {
    icon: 'play',
    iconBg: 'bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400',
    label: 'home.lesson.online',
  },
  'вебинар': {
    icon: 'video',
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'home.lesson.webinar',
  },
}

const priorityToBadge: Record<Assignment['priority'], { variant: 'urgent' | 'high' | 'normal' | 'success'; label: MessageKey }> = {
  urgent: { variant: 'urgent', label: 'home.priority.urgent' },
  high: { variant: 'high', label: 'assign.priority.high' },
  normal: { variant: 'normal', label: 'assign.priority.normal' },
  low: { variant: 'success', label: 'assign.priority.low' },
}

const taskStateLabels: Record<Task['state'], MessageKey> = {
  todo: 'home.state.todo',
  review: 'assign.col.review',
  done: 'home.state.done',
}

const taskStateColors: Record<Task['state'], string> = {
  todo: 'bg-surface-200 dark:bg-surface-600',
  review: 'bg-warning-500',
  done: 'bg-success-500',
}

// ────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────

function ScheduleCard({ entry }: { entry: ScheduleEntry }) {
  const { t } = useT()
  const config = lessonTypeConfig[entry.lesson_type]
  const isOnline = entry.lesson_type === 'онлайн' || entry.lesson_type === 'вебинар'
  const now = new Date()
  const startTime = parseTime(entry.start_time)
  const minutesUntilStart = differenceInMinutes(startTime, now)
  const isUpcoming = minutesUntilStart > 0 && minutesUntilStart <= 30
  const isActive = now >= startTime && now <= parseTime(entry.end_time)

  return (
    <Card
      variant="default"
      className={clsx(
        'transition-all duration-200',
        isActive && 'ring-2 ring-primary-500/30 border-primary-300 dark:border-primary-600',
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            config.iconBg,
          )}
        >
          <Icon name={config.icon} size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-surface-900 dark:text-surface-50 truncate">
              {entry.subject.name}
            </span>
            {entry.is_session && (
              <span className="shrink-0 rounded bg-warning-100 px-1.5 py-0.5 text-[9px] font-semibold text-warning-600 dark:bg-warning-500/20 dark:text-warning-500">
                {t('home.session')}
              </span>
            )}
            {isActive && (
              <span className="shrink-0 w-2 h-2 rounded-full bg-success-500 animate-pulse" />
            )}
          </div>
          <div className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
          </div>
          <div className="text-sm text-primary-500 mt-1 truncate">
            {isOnline ? (
              entry.link ? (
                <a
                  href={entry.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {entry.lesson_type === 'вебинар' ? t('home.webinarLink') : t('home.lectureLink')}
                </a>
              ) : (
                t(config.label)
              )
            ) : (
              [entry.room, entry.location].filter(Boolean).join(', ') || t('home.noRoom')
            )}
          </div>
          {entry.teacher && (
            <div className="flex items-center gap-2 mt-2 text-sm text-surface-500 dark:text-surface-400">
              <Avatar name={entry.teacher} size="xs" />
              <span className="truncate">{entry.teacher}</span>
            </div>
          )}

          {isOnline && (isUpcoming || isActive) && (
            <div className="mt-3">
              <Button
                variant="success"
                size="sm"
                icon={<Icon name="play" size={14} />}
                onClick={() => entry.link && window.open(entry.link, '_blank')}
                className="w-full"
              >
                {isActive
                  ? t('home.join')
                  : t('home.joinIn', { m: minutesUntilStart })}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function WindowGap({ minutes }: { minutes: number }) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-2 py-1 px-2">
      <div className="flex-1 border-t border-dashed border-surface-300 dark:border-surface-600" />
      <span className="text-xs text-surface-400 dark:text-surface-500 whitespace-nowrap">
        {t('home.gap', { d: formatWindowDuration(minutes) })}
      </span>
      <div className="flex-1 border-t border-dashed border-surface-300 dark:border-surface-600" />
    </div>
  )
}

function DeadlineCard({ assignment }: { assignment: Assignment }) {
  const { t } = useT()
  const deadline = new Date(assignment.deadline)
  const now = new Date()
  const isOverdue = isBefore(deadline, now)
  const minutesLeft = differenceInMinutes(deadline, now)
  const hoursLeft = Math.floor(minutesLeft / 60)
  const badge = priorityToBadge[assignment.priority]

  let timeLabel: string
  if (isOverdue) {
    timeLabel = t('assign.overdue')
  } else if (hoursLeft < 24) {
    timeLabel = t('time.h', { h: hoursLeft })
  } else {
    timeLabel = formatDistanceToNow(deadline, { locale: dateLocale(), addSuffix: false })
  }

  return (
    <Link to="/assignments" className="block">
      <Card variant="hover" className="group">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={badge.variant} size="sm">
                {t(badge.label)}
              </Badge>
              {assignment.is_verified && (
                <Badge variant="verified" size="sm">
                  <Icon name="check" size={10} className="mr-0.5" />
                  {t('home.verified')}
                </Badge>
              )}
            </div>
            <div className="font-medium text-surface-900 dark:text-surface-50 truncate group-hover:text-primary-500 transition-colors">
              {assignment.title}
            </div>
            <div className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
              {assignment.subject.name}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div
              className={clsx(
                'text-sm font-medium',
                isOverdue
                  ? 'text-danger-500'
                  : hoursLeft < 24
                    ? 'text-warning-500'
                    : 'text-surface-500 dark:text-surface-400',
              )}
            >
              {isOverdue ? (
                <span className="flex items-center gap-1">
                  <Icon name="clock" size={14} />
                  {timeLabel}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Icon name="clock" size={14} />
                  {timeLabel}
                </span>
              )}
            </div>
            <div className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
              {format(deadline, 'd MMM', { locale: dateLocale() })}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

function TaskItem({ task }: { task: Task }) {
  const { t } = useT()
  const updateTaskMutation = useUpdateTask()
  const isDone = task.state === 'done'
  const disabled = updateTaskMutation.isPending

  function handleToggle() {
    const nextState = isDone ? 'todo' : 'done'
    updateTaskMutation.mutate(
      { assignmentId: task.assignment.id, data: { state: nextState } },
      { onError: (error) => console.error('Failed to update task state', error) },
    )
  }

  return (
    <div
      className={clsx(
        'flex items-start gap-3 py-2.5 px-1 group',
        'border-b border-surface-100 dark:border-surface-700 last:border-0',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={isDone}
        aria-busy={disabled}
        disabled={disabled}
        aria-label={`${isDone ? t('home.uncheck') : t('home.check')}: ${task.assignment.title}`}
        onClick={handleToggle}
        className="-ml-2 -mt-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-wait disabled:opacity-60"
      >
        <span
          className={clsx(
            'flex h-5 w-5 items-center justify-center rounded border-2 transition-colors',
            isDone
              ? 'border-success-500 bg-success-500 text-white'
              : 'border-surface-300 hover:border-primary-500 dark:border-surface-600',
          )}
        >
          {isDone && <Icon name="check" size={12} strokeWidth={3} />}
        </span>
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={clsx(
            'text-sm font-medium truncate',
            isDone
              ? 'line-through text-surface-400 dark:text-surface-500'
              : 'text-surface-900 dark:text-surface-50',
          )}
        >
          {task.assignment.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-surface-500 dark:text-surface-400 truncate">
            {task.assignment.subject.name}
          </span>
          <span
            className={clsx(
              'shrink-0 inline-block w-1.5 h-1.5 rounded-full',
              taskStateColors[task.state],
            )}
          />
          <span className="shrink-0 text-2xs text-surface-400 dark:text-surface-500">
            {t(taskStateLabels[task.state])}
          </span>
        </div>
      </div>
    </div>
  )
}

function TaskList({
  tasks,
  completedCount,
  totalCount,
}: {
  tasks: Task[]
  completedCount: number
  totalCount: number
}) {
  const { t } = useT()
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
          {t('home.todo')}
        </h2>
        <span className="text-xs text-surface-400 dark:text-surface-500">
          {completedCount}/{totalCount}
        </span>
      </div>
      <Card>
        {tasks.length === 0 ? (
          <p className="text-sm text-surface-400 dark:text-surface-500 py-4 text-center">
            {t('home.noTasks')}
          </p>
        ) : (
          tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))
        )}
      </Card>
    </>
  )
}

// ────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────

export function HomePage() {
  const { t } = useT()
  // ── API hooks ──
  const { groupId, groupCode } = useGroupContext()
  const currentUserQuery = useCurrentUser()
  const todayScheduleQuery = useTodaySchedule(groupCode ?? undefined)
  const tasksQuery = useTasks({ group_id: groupId ?? '' })
  const dashboardQuery = useDashboard(
    groupId && groupCode ? { group_id: groupId, group_code: groupCode } : undefined
  )

  const isApiLoading = todayScheduleQuery.isLoading || tasksQuery.isLoading

  // ── Data sources ──
  const greeting = getGreeting()
  const userName = currentUserQuery.data?.display_name?.split(' ')[0] ?? t('common.student')

  // Map API schedule entries to local ScheduleEntry format
  const apiScheduleToLocal = (entry: any): ScheduleEntry => {
    const roomStr = entry.room ?? ''
    const locStr = entry.location ?? ''
    const isWebinar = /вебинар/i.test(roomStr) || /вебинар/i.test(locStr)
    const isOnline = isWebinar || /онлайн|сдо|lms/i.test(roomStr) || /онлайн|сдо|lms/i.test(locStr)
    // Extract online link from raw_data.auditories[].title (HTML with href)
    let link: string | undefined
    const auds = entry.raw_data?.auditories
    if (Array.isArray(auds)) {
      for (const a of auds) {
        const m = /href="([^"]+)"/.exec(a.title ?? '')
        if (m) { link = m[1]; break }
      }
    }
    return {
      id: entry.id,
      pair_number: entry.pair_number,
      start_time: entry.start_time,
      end_time: entry.end_time,
      location: entry.location,
      room: entry.room,
      teacher: entry.teacher,
      lesson_type: isWebinar ? 'вебинар' : isOnline ? 'онлайн' : 'очно',
      is_session: entry.is_session,
      subject: entry.subject,
      link,
    }
  }

  const scheduleEntries: ScheduleEntry[] = (todayScheduleQuery.data?.entries ?? []).map(apiScheduleToLocal)

  const pairCount = scheduleEntries.length

  const activeTasks: Task[] = tasksQuery.data ?? []

  // Assignments for deadlines — derive from active tasks
  const assignments: Assignment[] = activeTasks
    .filter((t) => t.state !== 'done')
    .map((t) => t.assignment)

  // Live clock for countdown updates
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Build schedule list with windows
  const scheduleWithGaps = useMemo(() => {
    const items: Array<{ type: 'entry'; entry: ScheduleEntry } | { type: 'gap'; minutes: number }> = []
    const sorted = [...scheduleEntries].sort((a, b) => a.pair_number - b.pair_number)

    for (let i = 0; i < sorted.length; i++) {
      items.push({ type: 'entry', entry: sorted[i] })

      if (i < sorted.length - 1) {
        const endCurrent = parseTime(sorted[i].end_time)
        const startNext = parseTime(sorted[i + 1].start_time)
        const gap = differenceInMinutes(startNext, endCurrent)
        if (gap > 20) {
          items.push({ type: 'gap', minutes: gap })
        }
      }
    }

    return items
  }, [scheduleEntries])

  // Deadlines sorted by closeness
  const burningDeadlines = useMemo(() => {
    return [...assignments].sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    )
  }, [assignments])

  // Task stats — prefer dashboard aggregated data if available
  const dashProgress = dashboardQuery.data?.progress
  const completedCount = dashProgress ? dashProgress.done : activeTasks.filter((t) => t.state === 'done').length
  const totalCount = dashProgress ? dashProgress.total : activeTasks.length
  const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  const todayFormatted = format(new Date(), "d MMMM, EEEE", { locale: dateLocale() })

  if (isApiLoading) {
    return (
      <div className="space-y-6">
        <div className="mb-6">
          <div className="h-7 w-64 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
          <div className="h-4 w-48 bg-surface-200 dark:bg-surface-700 rounded animate-pulse mt-2" />
        </div>
        <div className="hidden md:grid grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-28 bg-surface-200 dark:bg-surface-700 rounded-xl animate-pulse" />
              ))}
            </div>
          ))}
        </div>
        <div className="md:hidden space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-surface-200 dark:bg-surface-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Greeting — visible on both mobile and desktop */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold text-surface-900 dark:text-surface-50">
          {greeting}, {userName}!
        </h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
          {getPairCountText(pairCount)} &middot; {todayFormatted}
        </p>
      </div>

      {/* ─── Desktop: 3-column grid ─── */}
      <div className="hidden md:grid grid-cols-3 gap-6 items-start">
        {/* LEFT COLUMN — Schedule */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
              {t('home.scheduleToday')}
            </h2>
            <Link
              to="/schedule"
              className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
            >
              {t('home.all')}
              <Icon name="chevron-right" size={14} />
            </Link>
          </div>

          {scheduleWithGaps.length === 0 ? (
            <p className="text-sm text-surface-400 dark:text-surface-500 py-4 text-center">
              {t('onb.noLessons')}
            </p>
          ) : (
            scheduleWithGaps.map((item, idx) =>
              item.type === 'entry' ? (
                <ScheduleCard key={item.entry.id} entry={item.entry} />
              ) : (
                <WindowGap key={`gap-${idx}`} minutes={item.minutes} />
              ),
            )
          )}
        </div>

        {/* CENTER COLUMN — Progress + Deadlines */}
        <div className="space-y-4">
          {/* Progress card */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                {t('home.completed')}
              </h3>
              <Link
                to="/assignments"
                className="text-surface-400 dark:text-surface-500 hover:text-primary-500 transition-colors"
              >
                <Icon name="chevron-right" size={18} />
              </Link>
            </div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-3xl font-bold text-surface-900 dark:text-surface-50">
                {completionPercent}%
              </span>
            </div>
            <ProgressBar value={completionPercent} color="success" />
            <div className="text-xs text-surface-400 dark:text-surface-500 mt-2">
              {t('home.doneOf', { done: completedCount, total: totalCount })}
            </div>
          </Card>

          {/* Burning deadlines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
                {t('home.burning')}
              </h3>
              <Link
                to="/assignments"
                className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
              >
                {t('home.all')}
                <Icon name="chevron-right" size={14} />
              </Link>
            </div>
            <div className="space-y-3">
              {burningDeadlines.length === 0 ? (
                <p className="text-sm text-surface-400 dark:text-surface-500 py-2 text-center">
                  {t('home.noBurning')}
                </p>
              ) : (
                burningDeadlines.map((a) => (
                  <DeadlineCard key={a.id} assignment={a} />
                ))
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Task list */}
        <div>
          <TaskList
            tasks={activeTasks}
            completedCount={completedCount}
            totalCount={totalCount}
          />
        </div>
      </div>

      {/* ─── Mobile: Single column ─── */}
      <div className="md:hidden space-y-6">
        {/* Schedule */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
              {t('nav.schedule')}
            </h2>
            <Link
              to="/schedule"
              className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
            >
              {t('home.all')}
              <Icon name="chevron-right" size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {scheduleWithGaps.length === 0 ? (
              <p className="text-sm text-surface-400 dark:text-surface-500 py-4 text-center">
                {t('onb.noLessons')}
              </p>
            ) : (
              scheduleWithGaps.map((item, idx) =>
                item.type === 'entry' ? (
                  <ScheduleCard key={item.entry.id} entry={item.entry} />
                ) : (
                  <WindowGap key={`gap-m-${idx}`} minutes={item.minutes} />
                ),
              )
            )}
          </div>
        </section>

        {/* Burning deadlines */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
              {t('home.burning')}
            </h2>
            <Link
              to="/assignments"
              className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
            >
              {t('home.all')}
              <Icon name="chevron-right" size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {burningDeadlines.length === 0 ? (
              <p className="text-sm text-surface-400 dark:text-surface-500 py-4 text-center">
                {t('home.noBurning')}
              </p>
            ) : (
              burningDeadlines.map((a) => (
                <DeadlineCard key={a.id} assignment={a} />
              ))
            )}
          </div>
        </section>

        {/* Progress */}
        <section>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                {t('home.completed')}
              </h3>
            </div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-2xl font-bold text-surface-900 dark:text-surface-50">
                {completionPercent}%
              </span>
            </div>
            <ProgressBar value={completionPercent} color="success" />
            <div className="text-xs text-surface-400 dark:text-surface-500 mt-2">
              {t('home.doneOfShort', { done: completedCount, total: totalCount })}
            </div>
          </Card>
        </section>

        {/* Tasks */}
        <section>
          <TaskList
            tasks={activeTasks}
            completedCount={completedCount}
            totalCount={totalCount}
          />
        </section>
      </div>
    </div>
  )
}
