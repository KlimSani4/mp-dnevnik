import { useState, useEffect, useRef, useMemo } from 'react'
import { clsx } from 'clsx'
import { Button, Card, Input, Avatar } from '../components/ui'
import {
  useCurrentUser,
  useLogout,
  useMyGroups,
  useApi,
  useSearchGroups,
  useJoinGroup,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '@nexora/shared'
import type { NotificationPreferenceType } from '@nexora/shared'

interface NotificationSettingMeta {
  type: NotificationPreferenceType
  label: string
  description: string
}

const NOTIFICATION_META: NotificationSettingMeta[] = [
  { type: 'schedule_change', label: 'Изменения расписания', description: 'Отмена пар, смена аудиторий' },
  { type: 'new_assignment', label: 'Новые задания', description: 'Когда кто-то создаёт задание' },
  { type: 'deadline', label: 'Дедлайны', description: 'Напоминание за день до срока' },
  { type: 'vote', label: 'Голосования', description: 'Новые задания требуют подтверждения' },
  { type: 'digest', label: 'Вечерний дайджест', description: 'Сводка на завтра в 21:00' },
]

export function SettingsPage() {
  const currentUserQuery = useCurrentUser()
  const logoutMutation = useLogout()
  const myGroupsQuery = useMyGroups()
  const joinGroupMutation = useJoinGroup()
  const api = useApi()

  const user = currentUserQuery.data
  const memberships = myGroupsQuery.data ?? []

  const [displayName, setDisplayName] = useState('')
  const [savePending, setSavePending] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (user?.display_name) {
      setDisplayName(user.display_name)
    }
  }, [user?.display_name])

  // Group search state
  const [groupSearch, setGroupSearch] = useState('')
  const [debouncedGroupSearch, setDebouncedGroupSearch] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleGroupSearchChange = (value: string) => {
    setGroupSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedGroupSearch(value)
    }, 400)
  }

  const searchGroupsQuery = useSearchGroups(
    debouncedGroupSearch.length >= 2 ? { search: debouncedGroupSearch } : undefined
  )

  const handleJoinGroup = async (code: string) => {
    setJoinError(null)
    setJoinSuccess(null)
    try {
      await joinGroupMutation.mutateAsync(code)
      setJoinSuccess(`Вы вступили в группу ${code}. Ожидайте подтверждения от старосты.`)
      setGroupSearch('')
      setDebouncedGroupSearch('')
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string }
      if (error?.status === 409) {
        setJoinError('Вы уже состоите в этой группе.')
      } else {
        setJoinError('Не удалось вступить в группу. Попробуйте позже.')
      }
    }
  }

  const [activeSection, setActiveSection] = useState<'profile' | 'notifications' | 'group' | 'about'>('profile')

  const prefsQuery = useNotificationPreferences()
  const updatePrefsMutation = useUpdateNotificationPreferences()

  // Merge saved preferences with meta. Missing type => default enabled except digest starts from backend.
  const notifications = useMemo(() => {
    const saved = prefsQuery.data?.preferences ?? []
    const savedByType = new Map(saved.map((p) => [p.type, p.enabled]))
    return NOTIFICATION_META.map((m) => ({
      ...m,
      enabled: savedByType.has(m.type) ? savedByType.get(m.type)! : m.type !== 'vote',
    }))
  }, [prefsQuery.data])

  const toggleNotification = (type: NotificationPreferenceType) => {
    const next = notifications.map((n) =>
      n.type === type ? { type: n.type, enabled: !n.enabled } : { type: n.type, enabled: n.enabled }
    )
    updatePrefsMutation.mutate({ preferences: next })
  }

  const handleSaveProfile = async () => {
    setSavePending(true)
    setSaveError(null)
    try {
      await api.users.updateMe({ display_name: displayName })
    } catch (err) {
      setSaveError('Не удалось сохранить')
    } finally {
      setSavePending(false)
    }
  }

  const handleLogout = () => {
    logoutMutation.mutate()
  }

  const sections = [
    { id: 'profile' as const, label: 'Профиль', icon: UserIcon },
    { id: 'notifications' as const, label: 'Уведомления', icon: BellIcon },
    { id: 'group' as const, label: 'Группа', icon: UsersIcon },
    { id: 'about' as const, label: 'О приложении', icon: InfoIcon },
  ]

  const primaryGroup = memberships[0]

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
                <SIcon className="w-4 h-4" />
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

              {currentUserQuery.isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-10 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-6">
                    <Avatar name={displayName || 'Студент'} size="lg" />
                    <div>
                      <div className="font-medium text-surface-900 dark:text-surface-50">
                        {displayName || 'Студент'}
                      </div>
                      {primaryGroup && (
                        <div className="text-sm text-surface-500 dark:text-surface-400">
                          {primaryGroup.group.code}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <Input
                      label="Отображаемое имя"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />

                    {saveError && (
                      <p className="text-sm text-danger-500">{saveError}</p>
                    )}

                    <div className="pt-4 flex gap-3">
                      <Button
                        variant="primary"
                        onClick={handleSaveProfile}
                        disabled={savePending}
                      >
                        {savePending ? 'Сохранение...' : 'Сохранить'}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={handleLogout}
                        disabled={logoutMutation.isPending}
                        className="text-danger-500 hover:text-danger-600"
                      >
                        Выйти
                      </Button>
                    </div>
                  </div>
                </>
              )}
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
                    key={n.type}
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
                      disabled={updatePrefsMutation.isPending}
                      onClick={() => toggleNotification(n.type)}
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
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6">
                Группа
              </h2>

              {/* Current memberships */}
              <div className="mb-6">
                <p className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">
                  Ваши группы
                </p>
                {myGroupsQuery.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-12 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
                    ))}
                  </div>
                ) : memberships.length === 0 ? (
                  <p className="text-sm text-surface-500 dark:text-surface-400 py-3">
                    Вы не состоите ни в одной группе
                  </p>
                ) : (
                  <div className="space-y-1">
                    {memberships.map((membership) => (
                      <div
                        key={membership.id}
                        className="flex items-center gap-3 py-2.5 border-b border-surface-100 dark:border-surface-700 last:border-0"
                      >
                        <Avatar name={membership.group.code} size="sm" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-surface-900 dark:text-surface-50 truncate">
                            {membership.group.code}
                          </div>
                          {membership.group.name && (
                            <div className="text-xs text-surface-500 dark:text-surface-400 truncate">
                              {membership.group.name}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {membership.role === 'starosta' && (
                            <span className="text-xs px-2 py-0.5 bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400 rounded-full font-medium">
                              Староста
                            </span>
                          )}
                          {membership.role === 'deputy' && (
                            <span className="text-xs px-2 py-0.5 bg-info-100 text-info-600 dark:bg-info-500/20 dark:text-info-400 rounded-full font-medium">
                              Зам
                            </span>
                          )}
                          {!membership.verified && (
                            <span className="text-xs px-2 py-0.5 bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400 rounded-full font-medium">
                              Ожидает
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Join group */}
              <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
                <p className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">
                  {memberships.length > 0 ? 'Вступить в другую группу' : 'Найти и вступить в группу'}
                </p>

                <Input
                  placeholder="Введите код группы, напр. 221-361"
                  value={groupSearch}
                  onChange={(e) => handleGroupSearchChange(e.target.value)}
                />

                {joinError && (
                  <p className="mt-2 text-sm text-danger-500">{joinError}</p>
                )}
                {joinSuccess && (
                  <p className="mt-2 text-sm text-success-600 dark:text-success-400">{joinSuccess}</p>
                )}

                {debouncedGroupSearch.length >= 2 && (
                  <div className="mt-2 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden">
                    {searchGroupsQuery.isLoading ? (
                      <div className="px-4 py-3 text-sm text-surface-500 dark:text-surface-400">
                        Поиск...
                      </div>
                    ) : !searchGroupsQuery.data || searchGroupsQuery.data.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-surface-500 dark:text-surface-400">
                        Группы не найдены
                      </div>
                    ) : (
                      searchGroupsQuery.data.map((group) => {
                        const alreadyMember = memberships.some((m) => m.group.code === group.code)
                        return (
                          <div
                            key={group.id}
                            className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-700 last:border-0 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
                          >
                            <div>
                              <div className="text-sm font-medium text-surface-900 dark:text-surface-50">
                                {group.code}
                              </div>
                              {group.name && (
                                <div className="text-xs text-surface-500 dark:text-surface-400">
                                  {group.name}
                                </div>
                              )}
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={alreadyMember || joinGroupMutation.isPending}
                              onClick={() => handleJoinGroup(group.code)}
                            >
                              {alreadyMember ? 'Вы в группе' : 'Вступить'}
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
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
