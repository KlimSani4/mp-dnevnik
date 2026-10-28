import { useState, useMemo, useEffect, useRef } from 'react'
import {
  format,
  addDays,
  startOfWeek,
  isToday,
  differenceInMinutes,
  parse,
} from 'date-fns'
import { dateLocale, translate, useT, type MessageKey } from '../i18n'
import {
  useWeekSchedule,
  useDaySchedule,
  useGroupContext,
  useCreateScheduleOverride,
  useDeleteScheduleOverride,
  useApi,
  ApiClientError,
} from '@nexora/shared'
import type { AddEventPayload } from '@nexora/shared'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { Icon } from '../components/ui/Icon'
import { Modal } from '../components/ui/Modal'

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
  is_session?: boolean
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
  6: { start: '17:50', end: '19:20' },
  7: { start: '19:30', end: '21:00' },
}

const WEEKDAY_NAMES_SHORT: MessageKey[] = ['wd.mon', 'wd.tue', 'wd.wed', 'wd.thu', 'wd.fri', 'wd.sat']

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

function canAnchorEvent(entry: ScheduleEntry): boolean {
  return !isCustomEvent(entry) && !entry.is_session
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
  { icon: string; label: MessageKey; bg: string; text: string; iconFill?: boolean }
> = {
  offline: {
    icon: 'map-pin',
    label: 'home.lesson.offline',
    bg: 'bg-surface-100 dark:bg-surface-700',
    text: 'text-surface-500 dark:text-surface-400',
  },
  online: {
    icon: 'play',
    label: 'home.lesson.online',
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-600 dark:text-green-400',
  },
  webinar: {
    icon: 'video',
    label: 'home.lesson.webinar',
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-600 dark:text-blue-400',
  },
  custom: {
    icon: 'plus-circle',
    label: 'schedule.custom',
    bg: 'bg-violet-100 dark:bg-violet-900/30',
    text: 'text-violet-600 dark:text-violet-400',
  },
}

// Ключи — значения lesson_type из расписания, значения — ключи перевода
const lessonTypeLabels: Record<string, MessageKey> = {
  лекция: 'schedule.type.lecture',
  практика: 'schedule.type.practice',
  лаб: 'schedule.type.lab',
  custom: 'schedule.type.custom',
}

function lessonTypeLabel(type: string | null | undefined): string {
  if (!type) return translate('schedule.type.none')
  const key = lessonTypeLabels[type]
  return key ? translate(key) : type
}

function getWeeklyCardPalette(entry: ScheduleEntry): { card: string; icon: string; title: string } {
  if (isCustomEvent(entry)) {
    return {
      card: 'border-slate-200 bg-slate-50 after:border-slate-200 dark:border-slate-600 dark:bg-slate-800 dark:after:border-slate-600',
      icon: 'bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-500',
      title: 'text-slate-700 dark:text-slate-200',
    }
  }

  switch ((entry.lesson_type ?? '').toLowerCase()) {
    case 'лекция':
      return {
        card: 'border-emerald-200 bg-emerald-50 after:border-emerald-200 dark:border-emerald-700 dark:bg-emerald-950/40 dark:after:border-emerald-700',
        icon: 'bg-emerald-500 text-white border-emerald-400 dark:border-emerald-400',
        title: 'text-emerald-800 dark:text-emerald-200',
      }
    case 'лаб':
    case 'лабораторная':
      return {
        card: 'border-amber-200 bg-amber-50 after:border-amber-200 dark:border-amber-700 dark:bg-amber-950/40 dark:after:border-amber-700',
        icon: 'bg-amber-500 text-white border-amber-300 dark:border-amber-300',
        title: 'text-amber-800 dark:text-amber-200',
      }
    default:
      return {
        card: 'border-blue-200 bg-blue-50 after:border-blue-200 dark:border-blue-700 dark:bg-blue-950/40 dark:after:border-blue-700',
        icon: 'bg-blue-500 text-white border-blue-300 dark:border-blue-300',
        title: 'text-blue-800 dark:text-blue-200',
      }
  }
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

  if (hours > 0 && remainMins > 0) return translate('home.gap', { d: translate('time.hMin', { h: hours, m: remainMins }) })
  if (hours > 0) return translate('home.gap', { d: translate('time.h', { h: hours }) })
  return translate('home.gap', { d: translate('time.min', { m: remainMins }) })
}

function ExportCalendarButton({ groupCode }: { groupCode: string }) {
  const api = useApi()
  const { t, tp } = useT()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedWeeks, setSelectedWeeks] = useState(18)
  const [isExporting, setIsExporting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleExport() {
    setIsExporting(true)
    setErrorMessage(null)

    try {
      const startDate = format(new Date(), 'yyyy-MM-dd')
      const file = await api.schedule.exportCalendar({
        group_code: groupCode,
        start_date: startDate,
        weeks: selectedWeeks,
      })
      const objectUrl = URL.createObjectURL(file)
      const link = document.createElement('a')
      const safeGroupCode = groupCode.replace(/[^a-zA-Z0-9_-]/g, '_')
      link.href = objectUrl
      link.download = `nexora-schedule-${safeGroupCode}-${startDate}.ics`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
      setDialogOpen(false)
    } catch (error) {
      const status = error instanceof ApiClientError
        ? error.status
        : typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
          ? error.status
          : undefined

      if (status === 404) {
        setErrorMessage(t('schedule.export.empty'))
      } else if (status === 422) {
        setErrorMessage(t('schedule.export.badRequest'))
      } else if (status === 429) {
        setErrorMessage(t('schedule.export.rateLimit'))
      } else if (status === 401) {
        setErrorMessage(t('schedule.export.expired'))
      } else {
        setErrorMessage(t('schedule.export.failed'))
      }
    } finally {
      setIsExporting(false)
    }
  }

  function closeDialog() {
    if (!isExporting) setDialogOpen(false)
  }

  return (
    <>
      <div className="flex justify-center md:justify-end">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="download" size={16} />}
          onClick={() => {
            setErrorMessage(null)
            setDialogOpen(true)
          }}
        >
          {t('schedule.export')}
        </Button>
      </div>

      <Modal
        open={dialogOpen}
        onClose={closeDialog}
        hideCloseButton
        className="!max-w-md !overflow-hidden !rounded-2xl !border-[#d4d4d4] !bg-[#eeeeee] dark:!border-surface-700 dark:!bg-surface-900"
      >
        <div className="-mx-6 -my-4">
          <div className="mx-2 mt-2 flex items-center justify-between rounded-2xl bg-white px-4 pt-5 pb-4 dark:bg-surface-800">
            <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
              {t('schedule.exportTitle')}
            </h2>
            <button
              type="button"
              onClick={closeDialog}
              aria-label={t('common.close')}
              className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-200 bg-surface-50 text-surface-600 transition hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600"
            >
              <Icon name="x" size={18} />
            </button>
          </div>

          <div className="space-y-3 bg-[#eeeeee] px-2 py-3 dark:bg-surface-900">
            <section className="space-y-4 rounded-2xl bg-white p-3 shadow-sm dark:bg-surface-800">
              <div>
                <p className="text-sm font-medium text-surface-800 dark:text-surface-100">
                  {t('schedule.exportWeeks')}
                </p>
                <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">
                  {t('schedule.exportHint')}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {[4, 8, 18].map((weeks) => (
                  <button
                    key={weeks}
                    type="button"
                    aria-pressed={selectedWeeks === weeks}
                    disabled={isExporting}
                    onClick={() => setSelectedWeeks(weeks)}
                    className={`rounded-xl border px-2 py-3 text-center transition-colors ${
                      selectedWeeks === weeks
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300'
                        : 'border-surface-200 text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-700'
                    }`}
                  >
                    <span className="block text-lg font-semibold">{weeks}</span>
                    <span className="block text-xs">{tp('plural.weekWord', weeks)}</span>
                  </button>
                ))}
              </div>

              {errorMessage && (
                <p role="alert" className="text-sm text-danger-500">
                  {errorMessage}
                </p>
              )}
            </section>

            <div className="mb-2 ml-auto flex w-fit max-w-full items-center justify-end gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-surface-800">
              <Button variant="secondary" onClick={closeDialog} disabled={isExporting}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={handleExport} disabled={isExporting}>
                {isExporting ? t('schedule.export.preparing') : t('schedule.export.download')}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  )
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
  /** The non-custom, non-session entry used to attach the ADD override. */
  anchorEntryId: string
}

function AddEventModal({ date, onClose, anchorEntryId }: AddEventModalProps) {
  const createOverride = useCreateScheduleOverride()
  const { t } = useT()

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
            {t('schedule.addEvent')}
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
              {t('schedule.titleRequired')}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('schedule.titlePlaceholder')}
              required
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
                {t('schedule.start')}
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
                <option value="custom">{t('schedule.other')}</option>
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
                {t('schedule.end')}
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
                <option value="custom">{t('schedule.other')}</option>
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
              {t('schedule.place')}
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t('schedule.placePlaceholder')}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              {t('schedule.teacher')}
            </label>
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder={t('schedule.teacherPlaceholder')}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1">
              {t('schedule.lessonType')}
            </label>
            <select
              value={lessonType}
              onChange={(e) => setLessonType(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
            >
              <option value="">{t('schedule.type.unset')}</option>
              <option value="лекция">{t('schedule.type.lecture')}</option>
              <option value="практика">{t('schedule.type.practice')}</option>
              <option value="лаб">{t('schedule.type.lab')}</option>
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
              {t('assign.onlyMe')}
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
              {t('schedule.forGroup')}
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
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              className="flex-1"
              disabled={createOverride.isPending || !subject.trim()}
            >
              {createOverride.isPending ? t('schedule.adding') : t('common.add')}
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
  const { t } = useT()
  const skipOverride = useCreateScheduleOverride()
  const createOverride = useCreateScheduleOverride()

  const type = getClassType(entry)
  const config = classTypeConfig[type]
  const palette = getWeeklyCardPalette(entry)
  const isOnline = type === 'online' || type === 'webinar'
  const cancelled = isCancelled(entry)
  const custom = isCustomEvent(entry)

  async function handleSkip(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
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
    <div
      className={`relative group overflow-hidden rounded-xl border ${palette.card} after:content-[''] after:absolute after:inset-[3px] after:rounded-[10px] after:border after:pointer-events-none${cancelled ? ' opacity-50' : ''}`}
    >
      {/* Hide button (top-right, on hover) */}
      {!custom && !cancelled && !entry.is_session && (
        <button
          onClick={handleSkip}
          disabled={skipOverride.isPending}
          title={t('schedule.hideLesson')}
          className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Icon name="x" size={12} />
          {t('schedule.hide')}
        </button>
      )}

      <div className="flex items-start gap-3 p-4">
        <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${palette.icon}`}>
          <Icon name={config.icon} size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-semibold ${palette.title} truncate${cancelled ? ' line-through' : ''}`}>
              {entry.subject.name}
            </span>
            {entry.is_session && (
              <span className="shrink-0 rounded bg-warning-100 px-1.5 py-0.5 text-[10px] font-semibold text-warning-600 dark:bg-warning-500/20 dark:text-warning-500">
                {t('home.session')}
              </span>
            )}
            {cancelled && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                {t('schedule.cancelled')}
              </span>
            )}
            {custom && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                {t('schedule.mine')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400">
            <Icon name="clock" size={14} />
            <span>
              {formatTimeDisplay(entry.start_time)} – {formatTimeDisplay(entry.end_time)}
            </span>
            <Badge size="sm" variant="default">
              {lessonTypeLabel(entry.lesson_type)}
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
                  {entry.room === 'Вебинар' ? t('home.webinarLink') : t('schedule.lessonLink')}
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
                {t('home.join')}
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
                {t('schedule.share')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
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
  const { t } = useT()
  const [hovered, setHovered] = useState(false)
  const skipOverride = useCreateScheduleOverride()

  const type = getClassType(entry)
  const config = classTypeConfig[type]
  const palette = getWeeklyCardPalette(entry)
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
      className={`min-h-[90px] rounded-xl border ${palette.card} after:content-[''] after:absolute after:inset-[3px] after:rounded-[10px] after:border after:pointer-events-none p-2.5 text-xs flex flex-col overflow-hidden relative group${cancelled ? ' opacity-50' : ''}`}
    >
      {/* Hide button */}
      {!cancelled && !custom && !entry.is_session && (
        <button
          onClick={handleSkip}
          disabled={skipOverride.isPending}
          title={t('schedule.hide')}
          className="absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center rounded bg-surface-200/80 dark:bg-surface-600/80 text-surface-500 dark:text-surface-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/40 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Icon name="x" size={10} />
        </button>
      )}

      <div className="flex items-center gap-1.5 mb-1">
        <div
          className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${palette.icon}`}
        >
          <Icon name={config.icon} size={14} />
        </div>
        <span className={`min-w-0 flex-1 font-semibold ${palette.title} truncate leading-tight${cancelled ? ' line-through' : ''}`}>
          {entry.subject.short_name ?? entry.subject.name}
        </span>
        {entry.is_session && (
          <span className="shrink-0 rounded bg-warning-100 px-1 py-0.5 text-[9px] font-semibold text-warning-600 dark:bg-warning-500/20 dark:text-warning-500">
            {t('home.session')}
          </span>
        )}
        {cancelled && (
          <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            {t('schedule.cancelledShort')}
          </span>
        )}
        {custom && (
          <span className="shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {t('schedule.mine')}
          </span>
        )}
      </div>

      <div className="text-surface-500 dark:text-surface-400 truncate">
        {lessonTypeLabel(entry.lesson_type)}
      </div>
      <div className="mt-0.5 text-[10px] font-medium text-surface-500 dark:text-surface-400">
        {formatTimeDisplay(entry.start_time)} – {formatTimeDisplay(entry.end_time)}
      </div>
      {entry.is_session && (
        <div className="text-[10px] text-primary-600 dark:text-primary-400">
          {formatTimeDisplay(entry.start_time)}–{formatTimeDisplay(entry.end_time)}
        </div>
      )}

      <div className="mt-auto pt-1">
        {isOnline ? (
          <span className="text-primary-500 truncate block">{t(config.label)}</span>
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

function ScheduleViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: 'daily' | 'weekly'
  onChange: (mode: 'daily' | 'weekly') => void
}) {
  const { t } = useT()

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button variant={viewMode === 'weekly' ? 'secondary' : 'ghost'} size="sm" onClick={() => onChange('weekly')} icon={<Icon name="calendar" size={16} />}>
        {t('schedule.week')}
      </Button>
      <Button variant={viewMode === 'daily' ? 'secondary' : 'ghost'} size="sm" onClick={() => onChange('daily')} icon={<Icon name="clock" size={16} />}>
        {t('schedule.day')}
      </Button>
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
  daySchedule,
  viewMode,
  onViewModeChange,
  showViewToggle,
}: {
  dayOffset: number
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  daySchedule?: DaySchedule
  viewMode: 'daily' | 'weekly'
  onViewModeChange: (mode: 'daily' | 'weekly') => void
  showViewToggle: boolean
}) {
  const { t } = useT()
  const targetDate = addDays(new Date(), dayOffset)
  const targetDateStr = format(targetDate, 'yyyy-MM-dd')
  const [showAddModal, setShowAddModal] = useState(false)
  const [slideDirection, setSlideDirection] = useState<'next' | 'previous' | null>(null)

  const dateLabel = format(targetDate, 'd MMMM, EEEE', { locale: dateLocale() })
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const entries = daySchedule?.entries ?? []
  const sorted = [...entries].sort(
    (a, b) =>
      a.pair_number - b.pair_number ||
      parseTimeFlexible(a.start_time).getTime() - parseTimeFlexible(b.start_time).getTime(),
  )

  // Use a regular, non-session entry so imports can replace session entries safely.
  const anchorEntryId = useMemo(
    () => sorted.find(canAnchorEvent)?.id ?? '',
    [sorted],
  )

  function navigateDay(direction: 'next' | 'previous') {
    setSlideDirection(direction)
    if (direction === 'next') onNext()
    else onPrev()
  }

  function handleTouchStart(event: React.TouchEvent<HTMLDivElement>) {
    if (showViewToggle) return
    const touch = event.touches[0]
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  function handleTouchEnd(event: React.TouchEvent<HTMLDivElement>) {
    const start = touchStart.current
    touchStart.current = null
    if (showViewToggle || !start) return

    const touch = event.changedTouches[0]
    if (!touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return

    if (deltaX < 0) navigateDay('next')
    else navigateDay('previous')
  }

  return (
    <div
      className="touch-pan-y"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={() => { touchStart.current = null }}
    >
      <div
        key={targetDateStr}
        className={slideDirection ? `schedule-day-enter-${slideDirection}` : undefined}
      >
      {/* Day navigation */}
      <div className="relative mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
        {showViewToggle && (
          <div className="absolute left-0">
            <ScheduleViewToggle viewMode={viewMode} onChange={onViewModeChange} />
          </div>
        )}
        <div className="col-start-2 flex items-center justify-center gap-1">
        <Button variant="ghost" size="sm" iconOnly icon={<Icon name="chevron-left" size={18} />} onClick={() => navigateDay('previous')} />
        <span className="w-[100px] text-center text-xs font-medium capitalize text-surface-700 dark:text-surface-200 md:w-auto md:min-w-[150px] md:text-sm">
          <span className="md:hidden">
            {format(targetDate, 'd MMMM', { locale: dateLocale() })},<br />
            {format(targetDate, 'EEEE', { locale: dateLocale() })}
          </span>
          <span className="hidden md:inline">{dateLabel}</span>
        </span>
        <Button variant="ghost" size="sm" iconOnly icon={<Icon name="chevron-right" size={18} />} onClick={() => navigateDay('next')} />
        </div>
        {dayOffset !== 0 && (
          <Button variant="ghost" size="sm" onClick={onToday} className="col-start-3 justify-self-end !px-1.5 text-[11px] md:!px-3 md:text-xs">
            {t('nav.today')}
          </Button>
        )}
      </div>

      {/* Entries */}
      {sorted.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-surface-400 dark:text-surface-500 mb-2">
            <Icon name="calendar" size={40} className="mx-auto" />
          </div>
          <p className="text-surface-500 dark:text-surface-400 font-medium">
            {t('schedule.noLessons')}
          </p>
          <p className="text-sm text-surface-400 dark:text-surface-500 mt-1">
            {isToday(targetDate) ? t('schedule.dayOff') : t('schedule.noLessonsDay')}
          </p>
        </Card>
      ) : (
        <div
          className="space-y-2 rounded-xl border border-surface-200/70 p-2 dark:border-surface-700/70"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(100,116,139,.18) 1px, transparent 1px)', backgroundSize: '14px 14px' }}
        >
          {sorted.map((entry, idx) => (
            <div key={entry.id}>
              {idx > 0 && (() => {
                const gap = formatGap(sorted[idx - 1], entry)
                return gap ? <GapIndicator label={gap} /> : null
              })()}
              <DailyClassCard
                entry={entry}
                targetDate={targetDateStr}
                anchorEntryId={anchorEntryId || (isCustomEvent(entry) ? entry.id : '')}
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
            {t('schedule.addEvent')}
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
  viewMode,
  onViewModeChange,
}: {
  weekOffset: number
  onPrevWeek: () => void
  onNextWeek: () => void
  onToday: () => void
  weekData: DaySchedule[]
  viewMode: 'daily' | 'weekly'
  onViewModeChange: (mode: 'daily' | 'weekly') => void
}) {
  const { t } = useT()
  const today = new Date()
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 })
  const targetWeekStart = addDays(currentWeekStart, weekOffset * 7)
  const targetWeekEnd = addDays(targetWeekStart, 5)

  const weekLabel = `${format(targetWeekStart, 'd', { locale: dateLocale() })}–${format(
    targetWeekEnd,
    'd MMMM',
    { locale: dateLocale() },
  )}`

  const weekParity = getWeekParity(weekOffset)

  const pairNumbers = [1, 2, 3, 4, 5, 6, 7]

  // State for "add event" modal per day column
  const [addModalForDate, setAddModalForDate] = useState<string | null>(null)
  const [addModalAnchorId, setAddModalAnchorId] = useState<string>('')

  function openAddModal(dateStr: string, dayEntries: ScheduleEntry[]) {
    const anchor = dayEntries.find(canAnchorEvent)?.id ?? ''
    if (!anchor) return
    setAddModalAnchorId(anchor)
    setAddModalForDate(dateStr)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <ScheduleViewToggle viewMode={viewMode} onChange={onViewModeChange} />
        <div className="flex items-center gap-2">
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={onToday}>
              {t('nav.today')}
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
            {weekParity === 'Числитель' ? t('schedule.numerator') : t('schedule.denominator')}
          </Badge>
        </div>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px] table-fixed">
          <thead>
            <tr>
              <th className="w-[80px] p-2 text-xs font-medium text-surface-400 dark:text-surface-500 text-left">
                {t('schedule.time')}
              </th>
              {weekData.map((day, idx) => {
                const date = parse(day.schedule_date, 'yyyy-MM-dd', new Date())
                const current = isToday(date)
                return (
                  <th
                    key={day.schedule_date}
                    className={`p-2 text-center ${
                      current
                        ? 'bg-blue-50/60 dark:bg-blue-900/10 rounded-t-lg'
                        : ''
                    }`}
                  >
                    <div
                      className={`text-xs font-medium ${
                        current
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-surface-400 dark:text-surface-500'
                      }`}
                    >
                      {t(WEEKDAY_NAMES_SHORT[idx])}
                    </div>
                    <div
                      className={`text-sm font-semibold mt-0.5 ${
                        current
                          ? 'text-blue-600 dark:text-blue-400'
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
                  const entries = day.entries
                    .filter((entry) => entry.pair_number === pn)
                    .sort(
                      (a, b) =>
                        parseTimeFlexible(a.start_time).getTime() -
                        parseTimeFlexible(b.start_time).getTime(),
                    )
                  const anchorId = day.entries.find(canAnchorEvent)?.id ?? ''

                  return (
                    <td
                      key={`${day.schedule_date}-${pn}`}
                      className="p-1 align-top border-l border-surface-200/70 dark:border-surface-700/70"
                      style={{
                        backgroundImage: current
                          ? 'radial-gradient(circle, rgba(100,116,139,.22) 1px, transparent 1px), linear-gradient(rgba(59,130,246,.06), rgba(59,130,246,.06))'
                          : 'radial-gradient(circle, rgba(100,116,139,.22) 1px, transparent 1px)',
                        backgroundSize: '14px 14px, 100% 100%',
                      }}
                    >
                      {entries.length > 0 && (
                        <div className="space-y-1">
                          {entries.map((entry) => (
                            <WeeklyClassCell
                              key={entry.id}
                              entry={entry}
                              targetDate={day.schedule_date}
                              anchorEntryId={anchorId}
                            />
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}

            {/* Add event row */}
            <tr className="border-t border-surface-100 dark:border-surface-800">
              <td className="p-2" />
              {weekData.map((day) => {
                const anchorExists = day.entries.some(canAnchorEvent)
                const current = isToday(parse(day.schedule_date, 'yyyy-MM-dd', new Date()))
                return (
                  <td
                    key={`add-${day.schedule_date}`}
                    className="p-1 border-l border-surface-200/70 dark:border-surface-700/70"
                    style={current ? { backgroundColor: 'rgba(59,130,246,.06)' } : undefined}
                  >
                    {anchorExists && (
                      <button
                        onClick={() => openAddModal(day.schedule_date, day.entries)}
                        title={t('schedule.addEvent')}
                        className="w-full py-1 rounded-lg text-xs text-surface-400 dark:text-surface-600 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center justify-center gap-1"
                      >
                        <Icon name="plus" size={12} />
                        <span>{t('common.add')}</span>
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
  const { t } = useT()
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
  const dailyDate = format(addDays(new Date(), dayOffset), 'yyyy-MM-dd')
  const dailyGroupCode = isMobile || viewMode === 'daily' ? groupCode : undefined
  const dayScheduleQuery = useDaySchedule(dailyDate, dailyGroupCode ?? undefined)

  const weekData = useMemo(() => {
    return (weekScheduleQuery.data as DaySchedule[] | undefined) ?? []
  }, [weekScheduleQuery.data])
  const dayData = dayScheduleQuery.data as unknown as DaySchedule | undefined

  const isLoading = isMobile || viewMode === 'daily'
    ? dayScheduleQuery.isLoading
    : weekScheduleQuery.isLoading

  return (
    <div>
      {!groupCode ? (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-surface-500 dark:text-surface-400 font-medium">
            {t('schedule.notLoaded')}
          </p>
          <p className="text-sm text-surface-400 dark:text-surface-500 mt-1">
            {t('schedule.chooseGroup')}
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-sm text-surface-500 dark:text-surface-400">
            {t('schedule.loading')}
          </p>
        </div>
      ) : viewMode === 'daily' ? (
        <DailyView
          dayOffset={dayOffset}
          onPrev={() => setDayOffset((d) => d - 1)}
          onNext={() => setDayOffset((d) => d + 1)}
          onToday={() => setDayOffset(0)}
          daySchedule={dayData}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          showViewToggle={!isMobile}
        />
      ) : (
        <WeeklyView
          weekOffset={weekOffset}
          onPrevWeek={() => setWeekOffset((w) => w - 1)}
          onNextWeek={() => setWeekOffset((w) => w + 1)}
          onToday={() => setWeekOffset(0)}
          weekData={weekData}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
        />
      )}

      {groupCode && !isLoading && (
        <div className="mt-12">
          <ExportCalendarButton groupCode={groupCode} />
        </div>
      )}
    </div>
  )
}
