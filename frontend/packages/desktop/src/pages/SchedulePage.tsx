import { useState, useMemo, useEffect, useRef } from 'react'
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
import {
  useWeekSchedule,
  useGroupContext,
  useCreateScheduleOverride,
  useDeleteScheduleOverride,
} from '@nexora/shared'
import type { AddEventPayload } from '@nexora/shared'
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
  subject: { id: string; name: string; short_name: string | null; is_custom?: boolean }
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

type ClassType = 'offline' | 'online' | 'webinar' | 'custom'

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

function isCustomEvent(entry: ScheduleEntry): boolean {
  return entry.lesson_type === 'custom' || !!entry.subject.is_custom
}

function getClassType(entry: ScheduleEntry): ClassType {
  if (isCustomEvent(entry)) return 'custom'
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
  custom: {
    icon: 'plus-circle',
    label: 'Своё',
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-600 dark:text-violet-400',
  },
}

const lessonTypeLabels: Record<string, string> = {
  лекция: 'Лекция',
  практика: 'Практика',
  лаб: 'Лаб. работа',
  custom: 'Своё занятие',
}

function parseTimeFlexible(t: string): Date {
  const fmt = t.length > 5 ? 'HH:mm:ss' : 'HH:mm'
  return parse(t, fmt, new Date())
}

function formatTimeDisplay(t: string | null | undefined): string {
  if (!t) return ''
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
// Add Event Modal
// ---------------------------------------------------------------------------

interface AddEventModalProps {
  date: string
  onClose: () => void
  /** The "anchor" entry_id used to attach the ADD override (first entry in day, or a dummy). */
  anchorEntryId: string
}

function AddEventModal({ date, onClose, anchorEntryId }: AddEventModalProps) {
  const createOverride = useCreateScheduleOverride()

  const [subject, setSubject] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:30')
  const [location, setLocation] = useState('')
  const [teacher, setTeacher] = useState('')
  const [lessonType, setLessonType] = useState('')
  const [scope, setScope] = useState<'personal' | 'group'>('personal')

  const backdropRef = useRef<HTMLDivElement>(null)

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim()) return

    const payload: AddEventPayload = {
      subject: subject.trim(),
      start_time: startTime,
      end_time: endTime,
      ...(location ? { location } : {}),
      ...(teacher ? { teacher } : {}),
      ...(lessonType ? { lesson_type: lessonType } : {}),
    }

    await createOverride.mutateAsync({
      entry_id: anchorEntryId,
      scope,
      override_type: 'add',
      value: JSON.stringify(payload),
      target_date: date,
    })
    onClose()
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md mx-4 bg-white dark:bg-surface-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 dark:border-surface-800">
          <h2 className="text-base font-semibold text-surface-900 dark:text-surface-50">
            Добавить занятие
          </h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors"
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              Название *
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Например: Дополнительное занятие"
              required
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
                Начало
              </label>
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              >
                {Object.values(PAIR_TIMES).map((t) => (
                  <option key={t.start} value={t.start}>
                    {t.start}
                  </option>
                ))}
                <option value="custom">Другое</option>
              </select>
              {startTime === 'custom' && (
                <input
                  type="time"
                  className="mt-1 w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  onChange={(e) => setStartTime(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
                Конец
              </label>
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
              >
                {Object.values(PAIR_TIMES).map((t) => (
                  <option key={t.end} value={t.end}>
                    {t.end}
                  </option>
                ))}
                <option value="custom">Другое</option>
              </select>
              {endTime === 'custom' && (
                <input
                  type="time"
                  className="mt-1 w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
                  onChange={(e) => setEndTime(e.target.value)}
                />
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              Место / ссылка
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Аудитория или URL"
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              Преподаватель
            </label>
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="Фамилия И.О."
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              Тип занятия
            </label>
            <select
              value={lessonType}
              onChange={(e) => setLessonType(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            >
              <option value="">— не указан —</option>
              <option value="лекция">Лекция</option>
              <option value="практика">Практика</option>
              <option value="лаб">Лаб. работа</option>
            </select>
          </div>

          {/* Scope toggle */}
          <div className="flex items-center gap-2 p-3 bg-surface-50 dark:bg-surface-800 rounded-xl">
            <button
              type="button"
              onClick={() => setScope('personal')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope === 'personal'
                  ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-50 shadow-sm'
                  : 'text-surface-500 dark:text-surface-400'
              }`}
            >
              Только для меня
            </button>
            <button
              type="button"
              onClick={() => setScope('group')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                scope === 'group'
                  ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-50 shadow-sm'
                  : 'text-surface-500 dark:text-surface-400'
              }`}
            >
              Для группы
            </button>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="flex-1"
              onClick={onClose}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="flex-1"
              disabled={createOverride.isPending || !subject.trim()}
            >
              {createOverride.isPending ? 'Добавление...' : 'Добавить'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
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

function DailyClassCard({
  entry,
  targetDate,
  anchorEntryId,
}: {
  entry: ScheduleEntry
  targetDate: string
  anchorEntryId: string
}) {
  const [hovered, setHovered] = useState(false)
  const skipOverride = useCreateScheduleOverride()
  const createOverride = useCreateScheduleOverride()

  const type = getClassType(entry)
  const config = classTypeConfig[type]
  const isOnline = type === 'online' || type === 'webinar'
  const cancelled = isCancelled(entry)
  const custom = isCustomEvent(entry)

  async function handleSkip() {
    await skipOverride.mutateAsync({
      entry_id: entry.id,
      scope: 'personal',
      override_type: 'skip',
      target_date: targetDate,
    })
  }

  async function handleShare() {
    // Re-create the same entry as group-scope ADD override
    // Build payload from entry fields
    const payload: AddEventPayload = {
      subject: entry.subject.name,
      short_name: entry.subject.short_name ?? undefined,
      start_time: entry.start_time,
      end_time: entry.end_time,
      location: entry.location ?? undefined,
      room: entry.room ?? undefined,
      teacher: entry.teacher ?? undefined,
      lesson_type: entry.lesson_type ?? undefined,
    }
    await createOverride.mutateAsync({
      entry_id: anchorEntryId,
      scope: 'group',
      override_type: 'add',
      value: JSON.stringify(payload),
      target_date: targetDate,
    })
  }

  return (
    <Card
      className={`overflow-hidden relative group${cancelled ? ' opacity-50' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hide button (top-right, on hover, only for regular entries) */}
      {!custom && hovered && !cancelled && (
        <button
          onClick={handleSkip}
          disabled={skipOverride.isPending}
          title="Скрыть занятие"
          className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors"
        >
          <Icon name="x" size={12} />
          Скрыть
        </button>
      )}

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
            {custom && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                МОЁ
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

          {(entry.room || entry.location) && (
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
                  {[entry.room, entry.location].filter(Boolean).join(', ')}
                </span>
              )}
            </div>
          )}

          {entry.teacher && (
            <div className="flex items-center gap-2 mt-2 text-sm text-surface-500 dark:text-surface-400">
              <div className="w-5 h-5 rounded-full bg-surface-200 dark:bg-surface-600 shrink-0" />
              <span className="truncate">{entry.teacher}</span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {isOnline && entry.location && (
              <Button
                variant="success"
                size="sm"
                icon={<Icon name="play" size={14} />}
                onClick={() => entry.location && window.open(entry.location, '_blank')}
              >
                ПОДКЛЮЧИТЬСЯ
              </Button>
            )}
            {custom && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Icon name="share-2" size={14} />}
                disabled={createOverride.isPending}
                onClick={handleShare}
              >
                Поделиться с группой
              </Button>
            )}
          </div>
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

function WeeklyClassCell({
  entry,
  targetDate,
  anchorEntryId,
}: {
  entry: ScheduleEntry
  targetDate: string
  anchorEntryId: string
}) {
  const [hovered, setHovered] = useState(false)
  const skipOverride = useCreateScheduleOverride()

  const type = getClassType(entry)
  const config = classTypeConfig[type]
  const isOnline = type === 'online' || type === 'webinar'
  const cancelled = isCancelled(entry)
  const custom = isCustomEvent(entry)

  async function handleSkip(e: React.MouseEvent) {
    e.stopPropagation()
    await skipOverride.mutateAsync({
      entry_id: entry.id,
      scope: 'personal',
      override_type: 'skip',
      target_date: targetDate,
    })
  }

  // suppress unused warning
  void anchorEntryId

  return (
    <div
      className={`card p-2.5 text-xs h-full flex flex-col overflow-hidden relative${cancelled ? ' opacity-50' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Hide button */}
      {hovered && !cancelled && !custom && (
        <button
          onClick={handleSkip}
          disabled={skipOverride.isPending}
          title="Скрыть"
          className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center rounded bg-surface-200 dark:bg-surface-600 text-surface-500 dark:text-surface-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/40 dark:hover:text-red-400 transition-colors"
        >
          <Icon name="x" size={10} />
        </button>
      )}

      <div className="flex items-center gap-1.5 mb-1">
        <div
          className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${config.bg} ${config.text}`}
        >
          <Icon name={config.icon} size={12} />
        </div>
        <span className={`font-medium text-surface-900 dark:text-surface-50 truncate leading-tight${cancelled ? ' line-through' : ''}`}>
          {entry.subject.short_name ?? entry.subject.name}
        </span>
        {cancelled && (
          <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            ОТМ
          </span>
        )}
        {custom && (
          <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
            МОЁ
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
        <div className="text-surface-400 dark:text-surface-500 truncate mt-0.5" title={entry.teacher ?? ''}>
          {entry.teacher?.split(',')[0]}
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
  const targetDateStr = format(targetDate, 'yyyy-MM-dd')
  const [showAddModal, setShowAddModal] = useState(false)

  const daySchedule = useMemo(() => {
    return weekData.find((d) => isSameDay(parse(d.schedule_date, 'yyyy-MM-dd', new Date()), targetDate))
  }, [weekData, targetDate])

  const dateLabel = format(targetDate, 'd MMMM, EEEE', { locale: ru })
  const entries = daySchedule?.entries ?? []
  const sorted = [...entries].sort((a, b) => a.pair_number - b.pair_number)

  // First entry id as anchor for ADD overrides; fall back to a sentinel (won't be used)
  const anchorEntryId = useMemo(
    () => sorted.find((e) => !isCustomEvent(e))?.id ?? '',
    [sorted],
  )

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
              <DailyClassCard
                entry={entry}
                targetDate={targetDateStr}
                anchorEntryId={anchorEntryId || entry.id}
              />
            </div>
          ))}
        </div>
      )}

      {/* Add event button */}
      {anchorEntryId && (
        <div className="mt-4 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="plus" size={16} />}
            onClick={() => setShowAddModal(true)}
          >
            Добавить занятие
          </Button>
        </div>
      )}

      {showAddModal && anchorEntryId && (
        <AddEventModal
          date={targetDateStr}
          anchorEntryId={anchorEntryId}
          onClose={() => setShowAddModal(false)}
        />
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

  // State for "add event" modal per day column
  const [addModalForDate, setAddModalForDate] = useState<string | null>(null)
  const [addModalAnchorId, setAddModalAnchorId] = useState<string>('')

  function openAddModal(dateStr: string, dayEntries: ScheduleEntry[]) {
    const anchor = dayEntries.find((e) => !isCustomEvent(e))?.id ?? ''
    if (!anchor) return
    setAddModalAnchorId(anchor)
    setAddModalForDate(dateStr)
  }

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
            variant={weekParity === 'Числитель' ? 'success' : 'default'}
            className="ml-1 shrink-0"
          >
            {weekParity}
          </Badge>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px] table-fixed">
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
                  const anchorId = day.entries.find((e) => !isCustomEvent(e))?.id ?? ''

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
                        <WeeklyClassCell
                          entry={entry}
                          targetDate={day.schedule_date}
                          anchorEntryId={anchorId}
                        />
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Add event row */}
            <tr className="border-t border-surface-100 dark:border-surface-800">
              <td className="p-2" />
              {weekData.map((day) => {
                const anchorExists = day.entries.some((e) => !isCustomEvent(e))
                return (
                  <td key={`add-${day.schedule_date}`} className="p-1">
                    {anchorExists && (
                      <button
                        onClick={() => openAddModal(day.schedule_date, day.entries)}
                        title="Добавить занятие"
                        className="w-full py-1 rounded-lg text-xs text-surface-400 dark:text-surface-600 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center justify-center gap-1"
                      >
                        <Icon name="plus" size={12} />
                        <span>Добавить</span>
                      </button>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {addModalForDate && addModalAnchorId && (
        <AddEventModal
          date={addModalForDate}
          anchorEntryId={addModalAnchorId}
          onClose={() => setAddModalForDate(null)}
        />
      )}
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
