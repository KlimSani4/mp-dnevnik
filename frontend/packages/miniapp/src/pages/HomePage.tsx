import { useTelegramWebApp } from '../telegram/useTelegramWebApp'

export function HomePage() {
  const { webApp } = useTelegramWebApp()
  const userName = webApp?.initDataUnsafe.user?.first_name || 'Студент'
  const greeting = getGreeting()

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-1">
        {greeting}, {userName}!
      </h1>
      <p className="text-tg-hint text-sm mb-6">Сегодня 4 пары</p>

      <section className="mb-6">
        <h2 className="text-sm font-medium text-tg-hint mb-3">Расписание</h2>
        <div className="space-y-3">
          <ScheduleCard
            time="9:40 – 11:10"
            subject="Физра"
            location="Спорт зал на Юрино"
          />
          <ScheduleCard
            time="11:20 – 12:50"
            subject="Мат логика"
            location="Прянишникова А-123"
            isOnline
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-tg-hint mb-3">Горящие дедлайны</h2>
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Мат логика</span>
            <span className="text-xs px-2 py-1 bg-red-100 text-red-600 rounded">urgent</span>
          </div>
          <p className="text-sm text-tg-hint mb-2">Сделать ПЗ №4</p>
          <p className="text-xs text-red-500">До 13 декабря</p>
        </div>
      </section>
    </div>
  )
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

interface ScheduleCardProps {
  time: string
  subject: string
  location: string
  isOnline?: boolean
}

function ScheduleCard({ time, subject, location, isOnline }: ScheduleCardProps) {
  return (
    <div className="card flex gap-3">
      <div className="w-10 h-10 rounded-lg bg-tg-bg flex items-center justify-center">
        {isOnline ? (
          <span className="text-green-500">▶</span>
        ) : (
          <span className="text-tg-hint">●</span>
        )}
      </div>
      <div className="flex-1">
        <div className="font-medium">{subject}</div>
        <div className="text-sm text-tg-hint">{time}</div>
        <div className="text-sm text-tg-link mt-1">{location}</div>
      </div>
    </div>
  )
}
