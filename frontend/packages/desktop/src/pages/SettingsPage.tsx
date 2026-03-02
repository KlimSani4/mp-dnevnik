import { useState } from 'react'
import { clsx } from 'clsx'
import { Button, Card, Input, Avatar, Modal } from '../components/ui'

// Mock user data
const MOCK_USER = {
  display_name: 'Анастасия Кузнецова',
  group: '241-237',
  subgroup: 1,
  role: 'student' as const,
  telegram: '@anastasia_k',
}

const MOCK_GROUP_MEMBERS = [
  { name: 'Анастасия Кузнецова', role: 'student', verified: true },
  { name: 'Феликс Арутюнян', role: 'starosta', verified: true },
  { name: 'Дмитрий Петров', role: 'student', verified: true },
  { name: 'Мария Иванова', role: 'deputy', verified: true },
  { name: 'Алексей Сидоров', role: 'student', verified: false },
]

type NotificationType = 'schedule_changes' | 'new_assignments' | 'deadlines' | 'votes' | 'evening_digest'

interface NotificationSetting {
  key: NotificationType
  label: string
  description: string
  enabled: boolean
}

export function SettingsPage() {
  const [displayName, setDisplayName] = useState(MOCK_USER.display_name)
  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { key: 'schedule_changes', label: 'Изменения расписания', description: 'Отмена пар, смена аудиторий', enabled: true },
    { key: 'new_assignments', label: 'Новые задания', description: 'Когда кто-то создаёт задание', enabled: true },
    { key: 'deadlines', label: 'Дедлайны', description: 'Напоминание за день до срока', enabled: true },
    { key: 'votes', label: 'Голосования', description: 'Новые задания требуют подтверждения', enabled: false },
    { key: 'evening_digest', label: 'Вечерний дайджест', description: 'Сводка на завтра в 21:00', enabled: true },
  ])
  const [showGroupModal, setShowGroupModal] = useState(false)
  const [activeSection, setActiveSection] = useState<'profile' | 'notifications' | 'group' | 'about'>('profile')

  const toggleNotification = (key: NotificationType) => {
    setNotifications((prev) =>
      prev.map((n) => (n.key === key ? { ...n, enabled: !n.enabled } : n))
    )
  }

  const sections = [
    { id: 'profile' as const, label: 'Профиль', icon: UserIcon },
    { id: 'notifications' as const, label: 'Уведомления', icon: BellIcon },
    { id: 'group' as const, label: 'Группа', icon: UsersIcon },
    { id: 'about' as const, label: 'О приложении', icon: InfoIcon },
  ]

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50 mb-6">
        Настройки
      </h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Section navigation */}
        <nav className="md:w-56 flex-shrink-0">
          <div className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
            {sections.map(({ id, label, icon: SIcon }) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={clsx(
                  'flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
                  activeSection === id
                    ? 'bg-primary-500 text-white'
                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700'
                )}
              >
                <SIcon className="w-4.5 h-4.5" />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Profile */}
          {activeSection === 'profile' && (
            <Card padding="lg">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6">
                Профиль
              </h2>

              <div className="flex items-center gap-4 mb-6">
                <Avatar name={displayName} size="lg" />
                <div>
                  <div className="font-medium text-surface-900 dark:text-surface-50">
                    {displayName}
                  </div>
                  <div className="text-sm text-surface-500 dark:text-surface-400">
                    {MOCK_USER.group} · Подгруппа {MOCK_USER.subgroup}
                  </div>
                  <div className="text-sm text-surface-400 dark:text-surface-500">
                    {MOCK_USER.telegram}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="Отображаемое имя"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />

                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                    Подгруппа
                  </label>
                  <div className="flex gap-2">
                    {[1, 2].map((num) => (
                      <button
                        key={num}
                        className={clsx(
                          'px-4 py-2 rounded-lg text-sm font-medium border transition-colors',
                          MOCK_USER.subgroup === num
                            ? 'border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-500/10 dark:text-primary-400'
                            : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-surface-300'
                        )}
                      >
                        Подгруппа {num}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <Button variant="primary">Сохранить</Button>
                  <Button variant="ghost">Отмена</Button>
                </div>
              </div>
            </Card>
          )}

          {/* Notifications */}
          {activeSection === 'notifications' && (
            <Card padding="lg">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6">
                Уведомления
              </h2>
              <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
                Уведомления приходят в Telegram-бота
              </p>

              <div className="space-y-1">
                {notifications.map((n) => (
                  <div
                    key={n.key}
                    className="flex items-center justify-between py-3 border-b border-surface-100 dark:border-surface-700 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-surface-900 dark:text-surface-50">
                        {n.label}
                      </div>
                      <div className="text-xs text-surface-500 dark:text-surface-400">
                        {n.description}
                      </div>
                    </div>
                    <button
                      onClick={() => toggleNotification(n.key)}
                      className={clsx(
                        'relative w-11 h-6 rounded-full transition-colors',
                        n.enabled ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600'
                      )}
                    >
                      <span
                        className={clsx(
                          'absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                          n.enabled ? 'left-[22px]' : 'left-0.5'
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Group */}
          {activeSection === 'group' && (
            <Card padding="lg">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
                    Группа {MOCK_USER.group}
                  </h2>
                  <p className="text-sm text-surface-500 dark:text-surface-400">
                    {MOCK_GROUP_MEMBERS.length} участников
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowGroupModal(true)}>
                  Управление
                </Button>
              </div>

              <div className="space-y-1">
                {MOCK_GROUP_MEMBERS.map((member) => (
                  <div
                    key={member.name}
                    className="flex items-center gap-3 py-2.5 border-b border-surface-100 dark:border-surface-700 last:border-0"
                  >
                    <Avatar name={member.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-surface-900 dark:text-surface-50 truncate">
                        {member.name}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {member.role === 'starosta' && (
                        <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400 rounded-full font-medium">
                          Староста
                        </span>
                      )}
                      {member.role === 'deputy' && (
                        <span className="text-xs px-2 py-0.5 bg-info-100 text-info-600 dark:bg-info-500/20 dark:text-info-400 rounded-full font-medium">
                          Зам
                        </span>
                      )}
                      {!member.verified && (
                        <span className="text-xs px-2 py-0.5 bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400 rounded-full font-medium">
                          Ожидает
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-surface-200 dark:border-surface-700">
                <Button variant="ghost" className="text-danger-500 hover:text-danger-600">
                  Покинуть группу
                </Button>
              </div>
            </Card>
          )}

          {/* About */}
          {activeSection === 'about' && (
            <Card padding="lg">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6">
                О приложении
              </h2>

              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-surface-500 dark:text-surface-400">Версия</span>
                  <span className="text-surface-900 dark:text-surface-50 font-medium">0.1.0-alpha</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-500 dark:text-surface-400">Разработка</span>
                  <span className="text-surface-900 dark:text-surface-50 font-medium">Nexora Team</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-500 dark:text-surface-400">Расписание</span>
                  <span className="text-surface-900 dark:text-surface-50 font-medium">rasp.dmami.ru</span>
                </div>

                <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
                  <p className="text-sm text-surface-500 dark:text-surface-400">
                    Nexora — единственное место правды о расписании и заданиях для студента Московского Политеха.
                  </p>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Group management modal */}
      <Modal
        open={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        title={`Управление группой ${MOCK_USER.group}`}
      >
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">
          Функции управления доступны старосте группы. Свяжитесь со старостой для изменения ролей.
        </p>
        <Button variant="secondary" onClick={() => setShowGroupModal(false)}>
          Закрыть
        </Button>
      </Modal>
    </div>
  )
}

/* ─── Mini Icon Components ─── */

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  )
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  )
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
