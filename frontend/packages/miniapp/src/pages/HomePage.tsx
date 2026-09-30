import { useCurrentUser, useTodaySchedule, useTasks, useGroupContext } from '@nexora/shared'
import type { ScheduleEntry } from '@nexora/shared'
import { useTelegramWebApp } from '../telegram/useTelegramWebApp'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5)
}

function formatDeadline(deadline: string) {
  return new Date(deadline).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
  })
}

function getPairCountText(n: number): string {
  if (n === 0) return 'Сегодня пар нет'
  const lastDigit = n % 10
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 14) return `Сегодня ${n} пар`
  if (lastDigit === 1) return `Сегодня ${n} пара`
  if (lastDigit >= 2 && lastDigit <= 4) return `Сегодня ${n} пары`
  return `Сегодня ${n} пар`
}

function ScheduleCard({ entry }: { entry: ScheduleEntry }) {
  const isOnline = entry.lesson_type === 'онлайн' || entry.lesson_type === 'вебинар'
  const location = isOnline
    ? entry.lesson_type
    : [entry.room, entry.location].filter(Boolean).join(', ') || 'Аудитория не указана'

  return (
    <div
      style={{
        background: 'var(--tg-theme-secondary-bg-color)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 8,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: 'var(--tg-theme-bg-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>{isOnline ? '▶' : '●'}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 500,
            fontSize: 15,
            color: 'var(--tg-theme-text-color)',
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {entry.subject.name}
        </div>
        <div style={{ color: 'var(--tg-theme-hint-color)', fontSize: 13, marginBottom: 2 }}>
          {formatTime(entry.start_time)} – {formatTime(entry.end_time)}
        </div>
        <div style={{ color: 'var(--tg-theme-link-color)', fontSize: 13 }}>{location}</div>
      </div>
    </div>
  )
}

function ScheduleSkeleton() {
  return (
    <>
      {[1, 2].map((i) => (
        <div
          key={i}
          style={{
            background: 'var(--tg-theme-secondary-bg-color)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 8,
            opacity: 0.5,
          }}
        >
          <div
            style={{ height: 15, background: 'var(--tg-theme-hint-color)', borderRadius: 4, width: '60%', marginBottom: 6 }}
          />
          <div
            style={{ height: 12, background: 'var(--tg-theme-hint-color)', borderRadius: 4, width: '35%' }}
          />
        </div>
      ))}
    </>
  )
}

export function HomePage() {
  const { webApp } = useTelegramWebApp()
  const { groupId, groupCode } = useGroupContext()
  const { data: user } = useCurrentUser()
  const { data: schedule, isLoading: scheduleLoading } = useTodaySchedule(groupCode ?? undefined)
  const { data: tasks } = useTasks({ group_id: groupId ?? '' })

  const greeting = getGreeting()

  // Prefer API display_name, fall back to Telegram first name
  const tgUser = webApp?.initDataUnsafe.user
  const userName =
    user?.display_name?.split(' ')[0] || tgUser?.first_name || 'Студент'

  const entries = schedule?.entries ?? []
  const pairCount = entries.length

  // Burning deadlines: tasks not done, sorted by deadline
  const burningDeadlines = (tasks ?? [])
    .filter((t) => t.state !== 'done')
    .map((t) => t.assignment)
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 3)

  return (
    <div style={{ padding: '16px 12px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--tg-theme-text-color)', marginBottom: 4 }}>
        {greeting}, {userName}!
      </h1>
      <p style={{ color: 'var(--tg-theme-hint-color)', fontSize: 14, marginBottom: 24 }}>
        {getPairCountText(pairCount)}
      </p>

      <section style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--tg-theme-hint-color)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 10,
          }}
        >
          Расписание
        </h2>

        {scheduleLoading && <ScheduleSkeleton />}

        {!scheduleLoading && entries.length === 0 && (
          <p style={{ color: 'var(--tg-theme-hint-color)', fontSize: 14, textAlign: 'center', padding: '12px 0' }}>
            Сегодня пар нет
          </p>
        )}

        {entries.map((entry) => (
          <ScheduleCard key={entry.id} entry={entry} />
        ))}
      </section>

      {burningDeadlines.length > 0 && (
        <section>
          <h2
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--tg-theme-hint-color)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 10,
            }}
          >
            Горящие дедлайны
          </h2>
          <div>
            {burningDeadlines.map((assignment) => (
              <div
                key={assignment.id}
                style={{
                  background: 'var(--tg-theme-secondary-bg-color)',
                  borderRadius: 12,
                  padding: '12px 14px',
                  marginBottom: 8,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        fontSize: 15,
                        color: 'var(--tg-theme-text-color)',
                        marginBottom: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {assignment.title}
                    </div>
                    <div style={{ color: 'var(--tg-theme-hint-color)', fontSize: 13 }}>
                      {assignment.subject.name}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, marginLeft: 8 }}>
                    <span
                      style={{
                        fontSize: 12,
                        color:
                          assignment.priority === 'urgent'
                            ? '#ef4444'
                            : assignment.priority === 'high'
                            ? '#f97316'
                            : 'var(--tg-theme-hint-color)',
                        fontWeight: 500,
                      }}
                    >
                      до {formatDeadline(assignment.deadline)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
