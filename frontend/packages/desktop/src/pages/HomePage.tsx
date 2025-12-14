export function HomePage() {
  const greeting = getGreeting()

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">
        {greeting}, Анастасия! Сегодня 4 пары
      </h1>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1">
          <h2 className="text-sm font-medium text-surface-500 mb-3">
            Расписание на сегодня
          </h2>
          <p className="text-sm text-surface-400">24 ноября, понедельник</p>

          <div className="mt-4 space-y-3">
            <ScheduleCard
              time="9:40 → 11:10"
              subject="Физра"
              location="Спорт зал на Юрино"
              teacher="Дмитрий Дудка В."
              type="default"
            />
            <ScheduleCard
              time="9:40 → 11:10"
              subject="Физра"
              location="Спорт зал на Юрино"
              teacher="Дмитрий Дудка В."
              type="online"
            />
            <ScheduleCard
              time="9:40 → 11:10"
              subject="Физра"
              location="Ссылка на лекцию (Вебинар)"
              teacher="Дмитрий Дудка В."
              type="webinar"
            />
          </div>
        </div>

        <div className="col-span-1">
          <div className="card p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-surface-500">Выполненных работ (Долги)</span>
              <span className="text-surface-400">→</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">65%</span>
              <span className="text-sm text-green-500">↗ 5%</span>
            </div>
            <div className="mt-2 h-2 bg-surface-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: '65%' }} />
            </div>
          </div>

          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-surface-500">Посещений за месяц</span>
              <span className="text-surface-400">→</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold">84%</span>
              <span className="text-sm text-green-500">↗ 15%</span>
            </div>
            <div className="mt-2 h-2 bg-surface-100 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full" style={{ width: '84%' }} />
            </div>
          </div>

          <h3 className="text-sm font-medium text-surface-500 mt-6 mb-3">
            Задания на завтра
          </h3>
          <AssignmentCard
            subject="Мат логика"
            deadline="13.12.25"
            tasks={['Сделат ПЗ №4, до писат параграф', 'Сделать лабу на тему Труляля']}
            tags={['#MAJOR', 'Не сдал']}
            author="Анатолий Жмышенко"
          />
        </div>

        <div className="col-span-1">
          <NoteCard
            title="Одолжила ручку Феликсу"
            text="Вот бы не забыть"
            color="orange"
          />
          <NoteCard
            title="Пом ет"
            text="Я доделала половину работы, можно чуть чуть отложить"
            color="white"
          />
        </div>
      </div>
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
  teacher: string
  type: 'default' | 'online' | 'webinar'
}

function ScheduleCard({ time, subject, location, teacher, type }: ScheduleCardProps) {
  const iconColors = {
    default: 'bg-surface-200 text-surface-500',
    online: 'bg-green-100 text-green-600',
    webinar: 'bg-blue-100 text-blue-600',
  }

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColors[type]}`}>
          {type === 'default' && <ClockIcon />}
          {type === 'online' && <PlayIcon />}
          {type === 'webinar' && <VideoIcon />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{subject}</div>
          <div className="text-sm text-surface-500">{time}</div>
          <div className="text-sm text-primary-500 mt-1">{location}</div>
          <div className="flex items-center gap-2 mt-2 text-sm text-surface-500">
            <div className="w-5 h-5 rounded-full bg-surface-200" />
            {teacher}
          </div>
        </div>
      </div>
    </div>
  )
}

interface AssignmentCardProps {
  subject: string
  deadline: string
  tasks: string[]
  tags: string[]
  author: string
}

function AssignmentCard({ subject, deadline, tasks, tags, author }: AssignmentCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium">{subject}</span>
        <ChevronIcon />
      </div>
      <div className="flex items-center gap-2 text-sm text-orange-500 mb-3">
        <ClockIcon className="w-4 h-4" />
        До {deadline}
      </div>
      <ul className="text-sm text-surface-600 space-y-1 mb-3">
        {tasks.map((task, i) => (
          <li key={i}>{task}</li>
        ))}
      </ul>
      <div className="flex items-center gap-2 mb-3">
        {tags.map((tag) => (
          <span
            key={tag}
            className={`text-xs px-2 py-1 rounded ${
              tag === '#MAJOR'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-red-100 text-red-600'
            }`}
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm text-surface-500">
        <div className="w-6 h-6 rounded-full bg-surface-200" />
        {author}
      </div>
    </div>
  )
}

interface NoteCardProps {
  title: string
  text: string
  color: 'orange' | 'white'
}

function NoteCard({ title, text, color }: NoteCardProps) {
  const colors = {
    orange: 'bg-orange-50 border-orange-200',
    white: 'bg-white border-surface-200',
  }

  return (
    <div className={`p-4 rounded-xl border mb-3 ${colors[color]}`}>
      <div className="font-medium mb-1">{title}</div>
      <div className="text-sm text-surface-500">{text}</div>
    </div>
  )
}

function ClockIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function VideoIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg className="w-5 h-5 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}
