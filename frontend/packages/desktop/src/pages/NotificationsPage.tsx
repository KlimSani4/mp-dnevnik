import { useState } from 'react'
import { clsx } from 'clsx'
import { Card, Badge, Button } from '../components/ui'

type NotifType = 'schedule' | 'assignment' | 'deadline' | 'vote' | 'group'

interface Notification {
  id: string
  type: NotifType
  title: string
  message: string
  time: string
  read: boolean
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    type: 'schedule',
    title: 'Изменение расписания',
    message: 'Пара по физике в 14:30 отменена. Преподаватель заболел.',
    time: '10 мин назад',
    read: false,
  },
  {
    id: '2',
    type: 'assignment',
    title: 'Новое задание',
    message: 'Феликс добавил задание: "ПЗ №4 по мат. логике" — дедлайн 15.12',
    time: '1 час назад',
    read: false,
  },
  {
    id: '3',
    type: 'vote',
    title: 'Подтверди задание',
    message: 'Задание "Лаба по программированию" ожидает подтверждения группы',
    time: '2 часа назад',
    read: false,
  },
  {
    id: '4',
    type: 'deadline',
    title: 'Горящий дедлайн',
    message: 'Лаба по физике — осталось 2 дня. Не забудь!',
    time: '5 часов назад',
    read: true,
  },
  {
    id: '5',
    type: 'group',
    title: 'Группа 241-237',
    message: 'Алексей Сидоров запросил вступление в группу',
    time: 'Вчера',
    read: true,
  },
  {
    id: '6',
    type: 'schedule',
    title: 'Расписание на завтра',
    message: 'Завтра 3 пары: Матан (9:00), Линал (10:40), Прога (14:30)',
    time: 'Вчера, 21:00',
    read: true,
  },
  {
    id: '7',
    type: 'assignment',
    title: 'Задание верифицировано',
    message: '"ПЗ №3 по линалу" подтверждено 5 студентами ✓',
    time: '2 дня назад',
    read: true,
  },
]

const TYPE_CONFIG: Record<NotifType, { icon: React.ReactNode; color: string; label: string }> = {
  schedule: {
    icon: <CalendarIcon />,
    color: 'bg-info-100 text-info-600 dark:bg-info-500/20 dark:text-info-400',
    label: 'Расписание',
  },
  assignment: {
    icon: <ClipboardIcon />,
    color: 'bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400',
    label: 'Задание',
  },
  deadline: {
    icon: <ClockIcon />,
    color: 'bg-danger-100 text-danger-600 dark:bg-danger-500/20 dark:text-danger-400',
    label: 'Дедлайн',
  },
  vote: {
    icon: <VoteIcon />,
    color: 'bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400',
    label: 'Голосование',
  },
  group: {
    icon: <UsersIcon />,
    color: 'bg-success-100 text-success-600 dark:bg-success-500/20 dark:text-success-400',
    label: 'Группа',
  },
}

type FilterType = 'all' | NotifType

export function NotificationsPage() {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS)
  const [filter, setFilter] = useState<FilterType>('all')

  const unreadCount = notifications.filter((n) => !n.read).length

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter((n) => n.type === filter)

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const markRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  const filters: { key: FilterType; label: string }[] = [
    { key: 'all', label: 'Все' },
    { key: 'schedule', label: 'Расписание' },
    { key: 'assignment', label: 'Задания' },
    { key: 'deadline', label: 'Дедлайны' },
    { key: 'vote', label: 'Голосования' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
            Уведомления
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              {unreadCount} непрочитанных
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            Прочитать все
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
              filter === key
                ? 'bg-primary-500 text-white'
                : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="space-y-2">
        {filtered.map((notif) => {
          const config = TYPE_CONFIG[notif.type]
          return (
            <Card
              key={notif.id}
              variant={notif.read ? 'default' : 'hover'}
              padding="sm"
              className={clsx(!notif.read && 'border-l-4 border-l-primary-500')}
              onClick={() => markRead(notif.id)}
            >
              <div className="flex items-start gap-3">
                <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', config.color)}>
                  {config.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-surface-900 dark:text-surface-50">
                      {notif.title}
                    </span>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-surface-600 dark:text-surface-400 line-clamp-2">
                    {notif.message}
                  </p>
                  <span className="text-xs text-surface-400 dark:text-surface-500 mt-1 block">
                    {notif.time}
                  </span>
                </div>
              </div>
            </Card>
          )
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <div className="text-surface-300 dark:text-surface-600 mb-3">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-surface-500 dark:text-surface-400">Нет уведомлений</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Mini Icons ─── */

function CalendarIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function ClipboardIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  )
}

function VoteIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}
