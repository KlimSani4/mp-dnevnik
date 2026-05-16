import { useState, useMemo, useEffect } from 'react'
import {
  format,
  addDays,
  startOfWeek,
  isToday,
  isSameDay,
  differenceInMinutes,
  parse,
} from 'date-fns'
import { ru } from 'date-fns/locale'
import { useWeekSchedule, useGroupContext } from '@nexora/shared'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Icon } from '../components/ui/Icon'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleEntry {
  id: string
  pair_number: number
  start_time: string
  end_time: string
  location: string | null
  room: string | null
  teacher: string | null
  lesson_type: string | null
  week_parity: 'odd' | 'even' | null
  subject: { id: string; name: string; short_name: string | null }
  overrides?: ScheduleOverride[]
}

interface ScheduleOverride {
  id: string
  field: string
  value: string
}

interface DaySchedule {
  schedule_date: string
  weekday: number
  weekday_name?: string
  entries: ScheduleEntry[]
}

type ClassType = 'offline' | 'online' | 'webinar'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAIR_TIMES: Record<number, { start: string; end: string }> = {
  1: { start: '09:00', end: '10:30' },
  2: { start: '10:40', end: '12:10' },
  3: { start: '12:20', end: '13:50' },
  4: { start: '14:30', end: '16:00' },
  5: { start: '16:10', end: '17:40' },
}

const WEEKDAY_NAMES_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCancelled(entry: ScheduleEntry): boolean {
  if (entry.lesson_type === 'cancelled') return true
  if (entry.overrides?.some((o) => o.field === 'cancelled' || o.value === 'cancelled')) return true
  return false
}

function getClassType(entry: ScheduleEntry): ClassType {
  const loc = (entry.location ?? '').toLowerCase()
  const room = (entry.room ?? '').toLowerCase()
  if (loc.includes('webinar') || loc.includes('вебинар') || room === 'вебинар') return 'webinar'
  if (
    loc.startsWith('http') ||
    loc.includes('meet') ||
    loc.includes('сдо') ||
    loc.includes('lms') ||
    loc.includes('онлайн') ||
    room === 'онлайн'
  )
    return 'online'
  return 'offline'
}

const classTypeConfig: Record<
  ClassType,
  { icon: string; label: string; bg: string; text: string; iconFill?: boolean }
> = {
  offline: {
    icon: 'map-pin',
    label: 'Очно',
    bg: 'bg-surface-100 dark:bg-surface-700',
    text: 'text-surface-500 dark:text-surface-400',
  },
  online: {
    icon: 'play',
    label: 'Онлайн',
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
  },
  webinar: {
    icon: 'video',
    label: 'Вебинар',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
  },
}

const lessonTypeLabels: Record<string, string> = {
  лекция: 'Лекция',
  практика: 'Практика',
  лаб: 'Лаб. работа',
}

function parseTimeFlexible(t: string): Date {
  // Handles "HH:mm" or "HH:mm:ss" from API
  const fmt = t.length > 5 ? 'HH:mm:ss' : 'HH:mm'
  return parse(t, fmt, new Date())
}

function formatTimeDisplay(t: string | null | undefined): string {
  if (!t) return ''
  // Strip seconds if present
  return t.length > 5 ? t.slice(0, 5) : t
}

function formatGap(entry1: ScheduleEntry, entry2: ScheduleEntry): string | null {
  const end = parseTimeFlexible(entry1.end_time)
  const start = parseTimeFlexible(entry2.start_time)
  const mins = differenceInMinutes(start, end)

  if (mins <= 10) return null

  const hours = Math.floor(mins / 60)
  const remainMins = mins % 60

  if (hours > 0 && remainMins > 0) return `Окно ${hours}ч ${remainMins}мин`
  if (hours > 0) return `Окно ${hours}ч`
  return `Окно ${remainMins}мин`
}

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isMobile
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ClassTypeIcon({
  type,
  size = 20,
}: {
  type: ClassType
  size?: number
}) {
  const config = classTypeConfig[type]
  return (
    <div
      className={`flex items-center justify-center rounded-lg shrink-0 ${config.bg} ${config.text}`}
      style={{ width: size + 16, height: size + 16 }}
    >
      <Icon name={config.icon} size={size} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Daily class card (large, detailed)
// ---------------------------------------------------------------------------

function DailyClassCard({ entry }: { entry: ScheduleEntry }) {
  const type = getClassType(entry)
  const config = classTypeConfig[type]
  const isOnline = type === 'online' || type === 'webinar'
  const cancelled = isCancelled(entry)

  return (
    <Card className={`overflow-hidden${cancelled ? ' opacity-50' : ''}`}>
      <div className="flex items-start gap-3 p-4">
        <ClassTypeIcon type={type} size={20} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-medium text-surface-900 dark:text-surface-50 truncate${cancelled ? ' line-through' : ''}`}>
              {entry.subject.name}
            </span>
            {cancelled && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                ОТМЕНЕНА
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
            <Icon name="clock" size={14} />
            <span>
              {formatTimeDisplay(entry.start_time)} – {formatTimeDisplay(entry.end_time)}
            </span>
            <Badge size="sm" variant="default">
              {entry.lesson_type ? (lessonTypeLabels[entry.lesson_type] ?? entry.lesson_type) : 'Занятие'}
            </Badge>
          </div>

          <div className="flex items-center gap-2 mt-2 text-sm">
            <Icon name="map-pin" size={14} className={config.text} />
            {isOnline && entry.location ? (
              <a
                href={entry.location}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-500 hover:underline truncate"
              >
                {entry.room === 'Вебинар' ? 'Ссылка на вебинар' : 'Ссылка на занятие'}
              </a>
            ) : (
              <span className="text-surface-600 dark:text-surface-300 truncate">
                {entry.room}, {entry.location}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-2 text-sm text-surface-500 dark:text-surface-400">
            <div className="w-5 h-5 rounded-full bg-surface-200 dark:bg-surface-600 shrink-0" />
            <span className="truncate">{entry.teacher}</span>
          </div>

          {isOnline && (
            <Button
              variant="success"
              size="sm"
              className="mt-3"
              icon={<Icon name="play" size={14} />}
              onClick={() => entry.location && window.open(entry.location, '_blank')}
            >
              ПОДКЛЮЧИТЬСЯ
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Gap indicator
// ---------------------------------------------------------------------------

function GapIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2 px-1">
      <div className="h-px flex-1 bg-surface-200 dark:bg-surface-700" />
      <span className="text-xs font-medium text-surface-400 dark:text-surface-500 whitespace-nowrap">
        {label}
      </span>
      <div className="h-px flex-1 bg-surface-200 dark:bg-surface-700" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Weekly grid cell (compact)
// ---------------------------------------------------------------------------

function WeeklyClassCell({ entry }: { entry: ScheduleEntry }) {
  const type = getClassType(entry)
  const config = classTypeConfig[type]
  const isOnline = type === 'online' || type === 'webinar'
  const cancelled = isCancelled(entry)

  return (
    <div className={`card p-2.5 text-xs h-full flex flex-col${cancelled ? ' opacity-50' : ''}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <div
          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${config.bg} ${config.text}`}
        >
          <Icon name={config.icon} size={12} />
        </div>
        <span className={`font-medium text-surface-900 dark:text-surface-50 truncate leading-tight${cancelled ? ' line-through' : ''}`}>
          {entry.subject.short_name}
        </span>
        {cancelled && (
          <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            ОТМ
          </span>
        )}
      </div>

      <div className="text-surface-500 dark:text-surface-400 truncate">
        {entry.lesson_type ? (lessonTypeLabels[entry.lesson_type] ?? entry.lesson_type) : 'Занятие'}
      </div>

      <div className="mt-auto pt-1">
        {isOnline ? (
          <span className="text-primary-500 truncate block">{config.label}</span>
        ) : (
          <span className="text-surface-500 dark:text-surface-400 truncate block">
            {entry.room}
          </span>
        )}
        <div className="text-surface-400 dark:text-surface-500 truncate mt-0.5">
          {entry.teacher}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Daily view
// ---------------------------------------------------------------------------

function DailyView({
  dayOffset,
  onPrev,
  onNext,
  onToday,
  weekData,
}: {
  dayOffset: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  weekData: DaySchedule[]
}) {
  const targetDate = addDays(new Date(), dayOffset)

  const daySchedule = useMemo(() => {
    return weekData.find((d) => isSameDay(parse(d.schedule_date, 'yyyy-MM-dd', new Date()), targetDate))
  }, [weekData, targetDate])

  const dateLabel = format(targetDate, 'd MMMM, EEEE', { locale: ru })
  const entries = daySchedule?.entries ?? []
  const sorted = [...entries].sort((a, b) => a.pair_number - b.pair_number)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
            Расписание
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1 capitalize">
            {dateLabel}
          </p>
        </div>
        {dayOffset !== 0 && (
          <Button variant="ghost" size="sm" onClick={onToday}>
            Сегодня
          </Button>
        )}
      </div>

      {/* Day navigation */}
      <div className="flex items-center gap-2 mb-5">
        <Button variant="ghost" size="sm" iconOnly icon={<Icon name="chevron-left" size={18} />} onClick={onPrev} />
        <span className="text-sm font-medium text-surface-700 dark:text-surface-200 min-w-[120px] text-center capitalize">
          {format(targetDate, 'EEEE', { locale: ru })}
        </span>
        <Button variant="ghost" size="sm" iconOnly icon={<Icon name="chevron-right" size={18} />} onClick={onNext} />
      </div>

      {/* Entries */}
      {sorted.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-surface-400 dark:text-surface-500 mb-2">
            <Icon name="calendar" size={40} className="mx-auto" />
          </div>
          <p className="text-surface-500 dark:text-surface-400 font-medium">
            Нет занятий
          </p>
          <p className="text-sm text-surface-400 dark:text-surface-500 mt-1">
            {isToday(targetDate) ? 'Сегодня выходной!' : 'В этот день занятий нет'}
          </p>
        </Card>
      ) : (
        <div className="space-y-1">
          {sorted.map((entry, idx) => (
            <div key={entry.id}>
              {idx > 0 && (() => {
                const gap = formatGap(sorted[idx - 1], entry)
                return gap ? <GapIndicator label={gap} /> : null
              })()}
              <DailyClassCard entry={entry} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Weekly view
// ---------------------------------------------------------------------------

function getISOWeek(date: Date): number {
  const tmp = new Date(date.valueOf())
  tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7))
  const yearStart = new Date(tmp.getFullYear(), 0, 1)
  return Math.ceil(((tmp.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7)
}

function getWeekParity(weekOffset: number): 'Числитель' | 'Знаменатель' {
  const today = new Date()
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 })
  const targetWeekStart = addDays(currentWeekStart, weekOffset * 7)
  return getISOWeek(targetWeekStart) % 2 === 0 ? 'Знаменатель' : 'Числитель'
}

function WeeklyView({
  weekOffset,
  onPrevWeek,
  onNextWeek,
  onToday,
  weekData,
}: {
  weekOffset: number
  onPrevWeek: () => void
  onNextWeek: () => void
  onToday: () => void
  weekData: DaySchedule[]
}) {
  const today = new Date()
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 })
  const targetWeekStart = addDays(currentWeekStart, weekOffset * 7)
  const targetWeekEnd = addDays(targetWeekStart, 5)

  const weekLabel = `${format(targetWeekStart, 'd', { locale: ru })}–${format(
    targetWeekEnd,
    'd MMMM',
    { locale: ru },
  )}`

  const weekParity = getWeekParity(weekOffset)

  const pairNumbers = [1, 2, 3, 4, 5]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
          Расписание
        </h1>
        <div className="flex items-center gap-2">
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={onToday}>
              Сегодня
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<Icon name="chevron-left" size={18} />}
            onClick={onPrevWeek}
          />
          <span className="text-sm font-medium text-surface-700 dark:text-surface-200 min-w-[160px] text-center">
            {weekLabel}
          </span>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            icon={<Icon name="chevron-right" size={18} />}
            onClick={onNextWeek}
          />
          <Badge
            size="sm"
            variant={weekParity === 'Числитель' ? 'primary' : 'default'}
            className="ml-1 shrink-0"
          >
            {weekParity}
          </Badge>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr>
              <th className="w-[80px] p-2 text-xs font-medium text-surface-400 dark:text-surface-500 text-left">
                Время
              </th>
              {weekData.map((day, idx) => {
                const date = parse(day.schedule_date, 'yyyy-MM-dd', new Date())
                const current = isToday(date)
                return (
                  <th
                    key={day.schedule_date}
                    className={`p-2 text-center ${
                      current
                        ? 'bg-primary-50 dark:bg-primary-900/20 rounded-t-lg'
                        : ''
                    }`}
                  >
                    <div
                      className={`text-xs font-medium ${
                        current
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-surface-400 dark:text-surface-500'
                      }`}
                    >
                      {WEEKDAY_NAMES_SHORT[idx]}
                    </div>
                    <div
                      className={`text-sm font-semibold mt-0.5 ${
                        current
                          ? 'text-primary-600 dark:text-primary-400'
                          : 'text-surface-700 dark:text-surface-200'
                      }`}
                    >
                      {format(date, 'd')}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {pairNumbers.map((pn) => (
              <tr key={pn} className="border-t border-surface-100 dark:border-surface-800">
                <td className="p-2 align-top">
                  <div className="text-xs font-medium text-surface-500 dark:text-surface-400">
                    {PAIR_TIMES[pn].start}
                  </div>
                  <div className="text-xs text-surface-400 dark:text-surface-500">
                    {PAIR_TIMES[pn].end}
                  </div>
                </td>
                {weekData.map((day) => {
                  const date = parse(day.schedule_date, 'yyyy-MM-dd', new Date())
                  const current = isToday(date)
                  const entry = day.entries.find((e) => e.pair_number === pn)

                  return (
                    <td
                      key={`${day.schedule_date}-${pn}`}
                      className={`p-1 align-top h-[90px] ${
                        current
                          ? 'bg-primary-50/50 dark:bg-primary-900/10'
                          : ''
                      }`}
                    >
                      {entry ? (
                        <WeeklyClassCell entry={entry} />
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function SchedulePage() {
  const isMobile = useIsMobile()

  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>(
    isMobile ? 'daily' : 'weekly',
  )
  const [dayOffset, setDayOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)

  // Sync view mode when screen size changes
  useEffect(() => {
    setViewMode(isMobile ? 'daily' : 'weekly')
  }, [isMobile])

  const { groupCode } = useGroupContext()
  const weekScheduleQuery = useWeekSchedule(groupCode ?? undefined, weekOffset)

  const weekData = useMemo(() => {
    return (weekScheduleQuery.data as DaySchedule[] | undefined) ?? []
  }, [weekScheduleQuery.data])

  const isLoading = weekScheduleQuery.isLoading

  return (
    <div>
      {/* View mode toggle (only visible on non-mobile) */}
      {!isMobile && (
        <div className="flex items-center gap-1 mb-4">
          <Button
            variant={viewMode === 'weekly' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('weekly')}
            icon={<Icon name="calendar" size={16} />}
          >
            Неделя
          </Button>
          <Button
            variant={viewMode === 'daily' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('daily')}
            icon={<Icon name="clock" size={16} />}
          >
            День
          </Button>
        </div>
      )}

      {!groupCode ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-surface-500 dark:text-surface-400 font-medium">
            Расписание не загружено
          </p>
          <p className="text-sm text-surface-400 dark:text-surface-500 mt-1">
            Выберите группу в настройках, чтобы увидеть расписание
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-sm text-surface-500 dark:text-surface-400">
            Загрузка расписания...
          </p>
        </div>
      ) : viewMode === 'daily' ? (
        <DailyView
          dayOffset={dayOffset}
          onPrev={() => setDayOffset((d) => d - 1)}
          onNext={() => setDayOffset((d) => d + 1)}
          onToday={() => setDayOffset(0)}
          weekData={weekData}
        />
      ) : (
        <WeeklyView
          weekOffset={weekOffset}
          onPrevWeek={() => setWeekOffset((w) => w - 1)}
          onNextWeek={() => setWeekOffset((w) => w + 1)}
          onToday={() => setWeekOffset(0)}
          weekData={weekData}
        />
      )}
    </div>
  )
}
