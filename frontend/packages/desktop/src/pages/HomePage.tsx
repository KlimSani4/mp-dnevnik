import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format, formatDistanceToNow, differenceInMinutes, isBefore, addDays } from 'date-fns'
import { ru } from 'date-fns/locale'
import clsx from 'clsx'
import { Card, Badge, ProgressBar, Button, Icon, Avatar } from '../components/ui'
import { useCurrentUser, useTodaySchedule, useTasks, useGroupContext, useDashboard } from '@nexora/shared'

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

// ────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────

interface ScheduleEntry {
  id: string
  pair_number: number
  start_time: string
  end_time: string
  location: string
  room: string
  teacher: string
  lesson_type: 'очно' | 'онлайн' | 'вебинар'
  subject: { id: string; name: string; short_name: string }
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
  state: 'todo' | 'doing' | 'review' | 'done'
  assignment: Assignment
  updated_at: string
}

// ────────────────────────────────────────────────────────
// Mock Data
// ────────────────────────────────────────────────────────

const MOCK_USER = { first_name: 'Анастасия', group: '241-237' }

const today = new Date()

const MOCK_SCHEDULE: ScheduleEntry[] = [
  {
    id: 's1',
    pair_number: 1,
    start_time: '09:00',
    end_time: '10:30',
    location: 'Пр. Вернадского, 86',
    room: 'Н-406',
    teacher: 'Иванов А.В.',
    lesson_type: 'очно',
    subject: { id: 'sub1', name: 'Математический анализ', short_name: 'Матан' },
  },
  {
    id: 's2',
    pair_number: 2,
    start_time: '10:40',
    end_time: '12:10',
    location: 'Онлайн',
    room: '',
    teacher: 'Петрова Е.С.',
    lesson_type: 'онлайн',
    subject: { id: 'sub2', name: 'Английский язык', short_name: 'Англ' },
    link: 'https://meet.google.com/abc-defg-hij',
  },
  {
    id: 's3',
    pair_number: 4,
    start_time: '14:30',
    end_time: '16:00',
    location: 'Пр. Вернадского, 86',
    room: 'Н-211',
    teacher: 'Сидоров К.М.',
    lesson_type: 'очно',
    subject: { id: 'sub3', name: 'Физика', short_name: 'Физика' },
  },
  {
    id: 's4',
    pair_number: 5,
    start_time: '16:10',
    end_time: '17:40',
    location: 'Вебинар',
    room: '',
    teacher: 'Козлова М.Н.',
    lesson_type: 'вебинар',
    subject: { id: 'sub4', name: 'Программирование', short_name: 'Прог' },
    link: 'https://webinar.mospolytech.ru/prog-101',
  },
]

const MOCK_ASSIGNMENTS: Assignment[] = [
  {
    id: 'a1',
    title: 'Лабораторная работа №3 — Пределы и непрерывность',
    description: 'Решить задачи из сборника Демидовича',
    deadline: format(addDays(today, 1), "yyyy-MM-dd'T'23:59:00"),
    priority: 'urgent',
    votes_up: 12,
    votes_down: 1,
    is_verified: true,
    subject: { id: 'sub1', name: 'Математический анализ' },
    created_at: format(addDays(today, -5), "yyyy-MM-dd'T'10:00:00"),
  },
  {
    id: 'a2',
    title: 'Эссе "My Future Profession"',
    description: '300 слов, формат A4',
    deadline: format(addDays(today, 2), "yyyy-MM-dd'T'23:59:00"),
    priority: 'high',
    votes_up: 8,
    votes_down: 0,
    is_verified: false,
    subject: { id: 'sub2', name: 'Английский язык' },
    created_at: format(addDays(today, -3), "yyyy-MM-dd'T'14:00:00"),
  },
  {
    id: 'a3',
    title: 'Отчёт по лабораторной — Механика',
    description: 'Оформить по ГОСТ, приложить графики',
    deadline: format(addDays(today, 3), "yyyy-MM-dd'T'23:59:00"),
    priority: 'high',
    votes_up: 5,
    votes_down: 2,
    is_verified: true,
    subject: { id: 'sub3', name: 'Физика' },
    created_at: format(addDays(today, -7), "yyyy-MM-dd'T'09:00:00"),
  },
  {
    id: 'a4',
    title: 'Реализовать алгоритм сортировки на Python',
    description: 'Quick sort + merge sort, покрыть тестами',
    deadline: format(addDays(today, 5), "yyyy-MM-dd'T'23:59:00"),
    priority: 'normal',
    votes_up: 15,
    votes_down: 0,
    is_verified: true,
    subject: { id: 'sub4', name: 'Программирование' },
    created_at: format(addDays(today, -2), "yyyy-MM-dd'T'11:00:00"),
  },
]

const MOCK_TASKS: Task[] = [
  {
    id: 't1',
    state: 'doing',
    assignment: MOCK_ASSIGNMENTS[0],
    updated_at: format(addDays(today, -1), "yyyy-MM-dd'T'18:00:00"),
  },
  {
    id: 't2',
    state: 'todo',
    assignment: MOCK_ASSIGNMENTS[1],
    updated_at: format(addDays(today, -1), "yyyy-MM-dd'T'12:00:00"),
  },
  {
    id: 't3',
    state: 'todo',
    assignment: MOCK_ASSIGNMENTS[2],
    updated_at: format(addDays(today, -2), "yyyy-MM-dd'T'09:00:00"),
  },
  {
    id: 't4',
    state: 'review',
    assignment: MOCK_ASSIGNMENTS[3],
    updated_at: format(today, "yyyy-MM-dd'T'08:00:00"),
  },
  {
    id: 't5',
    state: 'done',
    assignment: {
      id: 'a5',
      title: 'Конспект лекции по теории вероятностей',
      description: '',
      deadline: format(addDays(today, -1), "yyyy-MM-dd'T'23:59:00"),
      priority: 'low',
      votes_up: 3,
      votes_down: 0,
      is_verified: false,
      subject: { id: 'sub1', name: 'Математический анализ' },
      created_at: format(addDays(today, -4), "yyyy-MM-dd'T'10:00:00"),
    },
    updated_at: format(today, "yyyy-MM-dd'T'07:00:00"),
  },
  {
    id: 't6',
    state: 'todo',
    assignment: {
      id: 'a6',
      title: 'Подготовить презентацию к семинару',
      description: '10-15 слайдов',
      deadline: format(addDays(today, 4), "yyyy-MM-dd'T'23:59:00"),
      priority: 'normal',
      votes_up: 2,
      votes_down: 1,
      is_verified: false,
      subject: { id: 'sub3', name: 'Физика' },
      created_at: format(addDays(today, -1), "yyyy-MM-dd'T'15:00:00"),
    },
    updated_at: format(addDays(today, -1), "yyyy-MM-dd'T'15:00:00"),
  },
]

// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return 'Доброе утро'
  if (hour >= 12 && hour < 18) return 'Добрый день'
  if (hour >= 18 && hour < 23) return 'Добрый вечер'
  return 'Доброй ночи'
}

function getPairCountText(n: number): string {
  if (n === 0) return 'Завтра пар нет, выспись'
  const lastDigit = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return `Сегодня ${n} пар`
  if (lastDigit === 1) return `Сегодня ${n} пара`
  if (lastDigit >= 2 && lastDigit <= 4) return `Сегодня ${n} пары`
  return `Сегодня ${n} пар`
}

function parseTime(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function formatWindowDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} мин`
  if (m === 0) return `${h}ч`
  return `${h}ч ${m}мин`
}

type LessonIconType = 'очно' | 'онлайн' | 'вебинар'

const lessonTypeConfig: Record<
  LessonIconType,
  { icon: string; iconBg: string; label: string }
> = {
  'очно': {
    icon: 'map-pin',
    iconBg: 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400',
    label: 'Очно',
  },
  'онлайн': {
    icon: 'play',
    iconBg: 'bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400',
    label: 'Онлайн',
  },
  'вебинар': {
    icon: 'video',
    iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    label: 'Вебинар',
  },
}

const priorityToBadge: Record<Assignment['priority'], { variant: 'urgent' | 'high' | 'normal' | 'success'; label: string }> = {
  urgent: { variant: 'urgent', label: 'Срочно' },
  high: { variant: 'high', label: 'Высокий' },
  normal: { variant: 'normal', label: 'Обычный' },
  low: { variant: 'success', label: 'Низкий' },
}

const taskStateLabels: Record<Task['state'], string> = {
  todo: 'Сделать',
  doing: 'В работе',
  review: 'На проверке',
  done: 'Готово',
}

const taskStateColors: Record<Task['state'], string> = {
  todo: 'bg-surface-200 dark:bg-surface-600',
  doing: 'bg-primary-500',
  review: 'bg-warning-500',
  done: 'bg-success-500',
}

// ────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────

function ScheduleCard({ entry }: { entry: ScheduleEntry }) {
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
            {isActive && (
              <span className="shrink-0 w-2 h-2 rounded-full bg-success-500 animate-pulse" />
            )}
          </div>
          <div className="text-sm text-surface-500 dark:text-surface-400 mt-0.5">
            {entry.start_time} - {entry.end_time}
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
                  {entry.lesson_type === 'вебинар' ? 'Ссылка на вебинар' : 'Ссылка на лекцию'}
                </a>
              ) : (
                config.label
              )
            ) : (
              `${entry.room}, ${entry.location}`
            )}
          </div>
          <div className="flex items-center gap-2 mt-2 text-sm text-surface-500 dark:text-surface-400">
            <Avatar name={entry.teacher} size="xs" />
            <span className="truncate">{entry.teacher}</span>
          </div>

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
                  ? 'ПОДКЛЮЧИТЬСЯ'
                  : `ПОДКЛЮЧИТЬСЯ (${minutesUntilStart} мин)`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function WindowGap({ minutes }: { minutes: number }) {
  return (
    <div className="flex items-center gap-2 py-1 px-2">
      <div className="flex-1 border-t border-dashed border-surface-300 dark:border-surface-600" />
      <span className="text-xs text-surface-400 dark:text-surface-500 whitespace-nowrap">
        Окно {formatWindowDuration(minutes)}
      </span>
      <div className="flex-1 border-t border-dashed border-surface-300 dark:border-surface-600" />
    </div>
  )
}

function DeadlineCard({ assignment }: { assignment: Assignment }) {
  const deadline = new Date(assignment.deadline)
  const now = new Date()
  const isOverdue = isBefore(deadline, now)
  const minutesLeft = differenceInMinutes(deadline, now)
  const hoursLeft = Math.floor(minutesLeft / 60)
  const badge = priorityToBadge[assignment.priority]

  let timeLabel: string
  if (isOverdue) {
    timeLabel = 'Просрочено'
  } else if (hoursLeft < 24) {
    timeLabel = `${hoursLeft}ч`
  } else {
    timeLabel = formatDistanceToNow(deadline, { locale: ru, addSuffix: false })
  }

  return (
    <Link to="/assignments" className="block">
      <Card variant="hover" className="group">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={badge.variant} size="sm">
                {badge.label}
              </Badge>
              {assignment.is_verified && (
                <Badge variant="verified" size="sm">
                  <Icon name="check" size={10} className="mr-0.5" />
                  Проверено
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
              {format(deadline, 'd MMM', { locale: ru })}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

function TaskItem({ task, onToggle }: { task: Task; onToggle: (id: string) => void }) {
  const isDone = task.state === 'done'

  return (
    <div
      className={clsx(
        'flex items-start gap-3 py-2.5 px-1 group',
        'border-b border-surface-100 dark:border-surface-700 last:border-0',
      )}
    >
      <button
        onClick={() => onToggle(task.id)}
        className={clsx(
          'shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
          isDone
            ? 'bg-success-500 border-success-500 text-white'
            : 'border-surface-300 dark:border-surface-600 hover:border-primary-500',
        )}
      >
        {isDone && <Icon name="check" size={12} strokeWidth={3} />}
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
            {taskStateLabels[task.state]}
          </span>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────

export function HomePage() {
  // ── API hooks (always called unconditionally) ──
  const { groupId, groupCode } = useGroupContext()
  const currentUserQuery = useCurrentUser()
  const todayScheduleQuery = useTodaySchedule(SKIP_AUTH ? undefined : (groupCode ?? undefined))
  const tasksQuery = useTasks({ group_id: SKIP_AUTH ? '' : (groupId ?? '') })
  const dashboardQuery = useDashboard(
    !SKIP_AUTH && groupId && groupCode ? { group_id: groupId, group_code: groupCode } : undefined
  )

  const isApiLoading = !SKIP_AUTH && (todayScheduleQuery.isLoading || tasksQuery.isLoading)

  // ── Data sources ──
  const greeting = getGreeting()
  const userName = SKIP_AUTH
    ? MOCK_USER.first_name
    : (currentUserQuery.data?.display_name?.split(' ')[0] ?? 'Студент')

  // Map API schedule entries to local ScheduleEntry format
  const apiScheduleToLocal = (entry: any): ScheduleEntry => ({
    id: entry.id,
    pair_number: entry.pair_number,
    start_time: entry.start_time,
    end_time: entry.end_time,
    location: entry.location,
    room: entry.room,
    teacher: entry.teacher,
    lesson_type: entry.room === 'Онлайн' ? 'онлайн' : entry.room === 'Вебинар' ? 'вебинар' : 'очно',
    subject: entry.subject,
    link: undefined,
  })

  const scheduleEntries: ScheduleEntry[] = SKIP_AUTH
    ? MOCK_SCHEDULE
    : (todayScheduleQuery.data?.entries ?? []).map(apiScheduleToLocal)

  const pairCount = scheduleEntries.length

  // Tasks
  const [mockTasks, setMockTasks] = useState<Task[]>(MOCK_TASKS)
  const activeTasks: Task[] = SKIP_AUTH ? mockTasks : (tasksQuery.data ?? [])

  // Assignments for deadlines — derive from tasks in API mode
  const assignments: Assignment[] = SKIP_AUTH
    ? MOCK_ASSIGNMENTS
    : activeTasks
        .filter((t) => t.state !== 'done')
        .map((t) => t.assignment)

  // Live clock for countdown updates
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000)
    return () => clearInterval(interval)
  }, [])

  const handleToggleTask = (id: string) => {
    if (!SKIP_AUTH) return
    setMockTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, state: t.state === 'done' ? 'todo' : 'done' }
          : t,
      ),
    )
  }

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

  const todayFormatted = format(today, "d MMMM, EEEE", { locale: ru })

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
              Расписание на сегодня
            </h2>
            <Link
              to="/schedule"
              className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
            >
              Все
              <Icon name="chevron-right" size={14} />
            </Link>
          </div>

          {scheduleWithGaps.map((item, idx) =>
            item.type === 'entry' ? (
              <ScheduleCard key={item.entry.id} entry={item.entry} />
            ) : (
              <WindowGap key={`gap-${idx}`} minutes={item.minutes} />
            ),
          )}
        </div>

        {/* CENTER COLUMN — Progress + Deadlines */}
        <div className="space-y-4">
          {/* Progress card */}
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                Выполненных работ
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
              <span className="text-sm font-medium text-success-500">+5%</span>
            </div>
            <ProgressBar value={completionPercent} color="success" />
            <div className="text-xs text-surface-400 dark:text-surface-500 mt-2">
              {completedCount} из {totalCount} заданий выполнено
            </div>
          </Card>

          {/* Burning deadlines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
                Горящие дедлайны
              </h3>
              <Link
                to="/assignments"
                className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
              >
                Все
                <Icon name="chevron-right" size={14} />
              </Link>
            </div>
            <div className="space-y-3">
              {burningDeadlines.map((a) => (
                <DeadlineCard key={a.id} assignment={a} />
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN — Task list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
              Что нужно сделать
            </h2>
            <span className="text-xs text-surface-400 dark:text-surface-500">
              {completedCount}/{totalCount}
            </span>
          </div>
          <Card>
            {activeTasks.map((task) => (
              <TaskItem key={task.id} task={task} onToggle={handleToggleTask} />
            ))}
          </Card>
        </div>
      </div>

      {/* ─── Mobile: Single column ─── */}
      <div className="md:hidden space-y-6">
        {/* Schedule */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
              Расписание
            </h2>
            <Link
              to="/schedule"
              className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
            >
              Все
              <Icon name="chevron-right" size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {scheduleWithGaps.map((item, idx) =>
              item.type === 'entry' ? (
                <ScheduleCard key={item.entry.id} entry={item.entry} />
              ) : (
                <WindowGap key={`gap-m-${idx}`} minutes={item.minutes} />
              ),
            )}
          </div>
        </section>

        {/* Burning deadlines */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
              Горящие дедлайны
            </h2>
            <Link
              to="/assignments"
              className="text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1"
            >
              Все
              <Icon name="chevron-right" size={14} />
            </Link>
          </div>
          <div className="space-y-3">
            {burningDeadlines.map((a) => (
              <DeadlineCard key={a.id} assignment={a} />
            ))}
          </div>
        </section>

        {/* Progress */}
        <section>
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-surface-900 dark:text-surface-50">
                Выполненных работ
              </h3>
              <span className="text-sm font-medium text-success-500">+5%</span>
            </div>
            <div className="flex items-baseline gap-3 mb-3">
              <span className="text-2xl font-bold text-surface-900 dark:text-surface-50">
                {completionPercent}%
              </span>
            </div>
            <ProgressBar value={completionPercent} color="success" />
            <div className="text-xs text-surface-400 dark:text-surface-500 mt-2">
              {completedCount} из {totalCount} заданий
            </div>
          </Card>
        </section>

        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide">
              Что нужно сделать
            </h2>
            <span className="text-xs text-surface-400 dark:text-surface-500">
              {completedCount}/{totalCount}
            </span>
          </div>
          <Card>
            {activeTasks.map((task) => (
              <TaskItem key={task.id} task={task} onToggle={handleToggleTask} />
            ))}
          </Card>
        </section>
      </div>
    </div>
  )
}
