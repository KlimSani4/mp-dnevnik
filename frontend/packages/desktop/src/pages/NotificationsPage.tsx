import { useState } from 'react'
import { clsx } from 'clsx'
import { Card, Button, Icon } from '../components/ui'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@nexora/shared'
import type { Notification } from '@nexora/shared'
import { useT, type MessageKey } from '../i18n'

type FilterType = 'all' | Notification['type']

const TYPE_CONFIG: Record<Notification['type'], { icon: React.ReactNode; color: string; label: MessageKey }> = {
  schedule_change: {
    icon: <CalendarIcon />,
    color: 'bg-info-100 text-info-600 dark:bg-info-500/20 dark:text-info-400',
    label: 'notif.type.schedule',
  },
  new_assignment: {
    icon: <ClipboardIcon />,
    color: 'bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400',
    label: 'notif.type.assignment',
  },
  deadline: {
    icon: <ClockIcon />,
    color: 'bg-danger-100 text-danger-600 dark:bg-danger-500/20 dark:text-danger-400',
    label: 'notif.type.deadline',
  },
  vote: {
    icon: <VoteIcon />,
    color: 'bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400',
    label: 'notif.type.vote',
  },
  digest: {
    icon: <UsersIcon />,
    color: 'bg-success-100 text-success-600 dark:bg-success-500/20 dark:text-success-400',
    label: 'notif.type.digest',
  },
}

export function NotificationsPage() {
  const [filter, setFilter] = useState<FilterType>('all')
  const { t, tp, lang } = useT()

  const notificationsQuery = useNotifications()
  const markReadMutation = useMarkNotificationRead()
  const markAllReadMutation = useMarkAllNotificationsRead()

  const notifications = notificationsQuery.data?.items ?? []
  const unreadCount = notificationsQuery.data?.unread_count ?? notifications.filter((n) => !n.is_read).length

  const filtered = filter === 'all'
    ? notifications
    : notifications.filter((n) => n.type === filter)

  const markAllRead = () => {
    markAllReadMutation.mutate()
  }

  const markRead = (id: string) => {
    markReadMutation.mutate(id)
  }

  const filters: { key: FilterType; label: MessageKey }[] = [
    { key: 'all', label: 'notif.filter.all' },
    { key: 'schedule_change', label: 'notif.filter.schedule' },
    { key: 'new_assignment', label: 'notif.filter.assignments' },
    { key: 'deadline', label: 'notif.filter.deadlines' },
    { key: 'vote', label: 'notif.filter.votes' },
  ]

  if (notificationsQuery.isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
              {t('notif.title')}
            </h1>
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 bg-surface-200 dark:bg-surface-700 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
            {t('notif.title')}
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
              {tp('notif.unread', unreadCount)}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllRead}
            disabled={markAllReadMutation.isPending}
          >
            {t('notif.markAll')}
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
            {t(label)}
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
              variant={notif.is_read ? 'default' : 'hover'}
              padding="sm"
              className={clsx(!notif.is_read && 'border-l-4 border-l-primary-500')}
              onClick={() => !notif.is_read && markRead(notif.id)}
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
                    {!notif.is_read && (
                      <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-surface-600 dark:text-surface-400 line-clamp-2">
                    {notif.body}
                  </p>
                  <span className="text-xs text-surface-400 dark:text-surface-500 mt-1 block">
                    {new Date(notif.created_at).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
            <p className="text-surface-500 dark:text-surface-400">{t('notif.empty')}</p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Mini Icons ─── */

function CalendarIcon() {
  return <Icon name="calendar" className="w-5 h-5" />
}

function ClipboardIcon() {
  return <Icon name="clipboard" className="w-5 h-5" />
}

function ClockIcon() {
  return <Icon name="clock" className="w-5 h-5" />
}

function VoteIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
    </svg>
  )
}

function UsersIcon() {
  return <Icon name="users" className="w-5 h-5" />
}
