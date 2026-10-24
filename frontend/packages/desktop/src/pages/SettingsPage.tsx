import { useState, useEffect, useRef, useMemo } from 'react'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
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
  useGroupStudents,
  useVerifyStudent,
  useChangeStudentRole,
} from '@nexora/shared'
import type { NotificationPreferenceType, GroupRole } from '@nexora/shared'
import { SupportSection } from '../components/SupportSection'
import { LANGUAGES, useLangStore, useT, type MessageKey } from '../i18n'

interface NotificationSettingMeta {
  type: NotificationPreferenceType
  label: MessageKey
  description: MessageKey
}

const NOTIFICATION_META: NotificationSettingMeta[] = [
  { type: 'class_reminder', label: 'settings.notif.classReminder', description: 'settings.notif.classReminderHint' },
  { type: 'schedule_change', label: 'settings.notif.scheduleChange', description: 'settings.notif.scheduleChangeHint' },
  { type: 'new_assignment', label: 'settings.notif.newAssignment', description: 'settings.notif.newAssignmentHint' },
  { type: 'deadline', label: 'settings.notif.deadline', description: 'settings.notif.deadlineHint' },
  { type: 'vote', label: 'settings.notif.vote', description: 'settings.notif.voteHint' },
  { type: 'digest', label: 'settings.notif.digest', description: 'settings.notif.digestHint' },
]

export function SettingsPage() {
  const { t, lang } = useT()
  const setLang = useLangStore((s) => s.setLang)
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
      setJoinSuccess(t('settings.joined', { code }))
      setGroupSearch('')
      setDebouncedGroupSearch('')
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string }
      if (error?.status === 409) {
        setJoinError(t('settings.alreadyMember'))
      } else {
        setJoinError(t('settings.joinError'))
      }
    }
  }

  const [activeSection, setActiveSection] = useState<'profile' | 'notifications' | 'group' | 'support' | 'about'>('profile')

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

  const reminderMinutes = user?.settings?.class_reminder_minutes ?? 15
  const [reminderPending, setReminderPending] = useState(false)

  const setReminderMinutes = async (minutes: 10 | 15) => {
    if (!user || minutes === reminderMinutes) return
    setReminderPending(true)
    try {
      await api.users.updateMe({ settings: { ...user.settings, class_reminder_minutes: minutes } })
      await currentUserQuery.refetch()
    } finally {
      setReminderPending(false)
    }
  }

  const handleSaveProfile = async () => {
    setSavePending(true)
    setSaveError(null)
    try {
      await api.users.updateMe({ display_name: displayName })
    } catch (err) {
      setSaveError(t('settings.saveError'))
    } finally {
      setSavePending(false)
    }
  }

  const handleLogout = () => {
    logoutMutation.mutate()
  }

  const sections = [
    { id: 'profile' as const, label: t('settings.profile'), icon: UserIcon },
    { id: 'notifications' as const, label: t('nav.notifications'), icon: BellIcon },
    { id: 'group' as const, label: t('settings.group'), icon: UsersIcon },
    { id: 'support' as const, label: t('support.section'), icon: ChatIcon },
    { id: 'about' as const, label: t('settings.about'), icon: InfoIcon },
  ]

  const primaryGroup = memberships[0]
  const isModerator =
    !!primaryGroup &&
    (primaryGroup.role === 'starosta' || primaryGroup.role === 'deputy' || primaryGroup.role === 'assistant')
  const moderatedGroupCode = isModerator ? primaryGroup.group.code : undefined

  const groupStudentsQuery = useGroupStudents(moderatedGroupCode)
  const verifyStudentMutation = useVerifyStudent()
  const changeRoleMutation = useChangeStudentRole()

  const handleVerify = (userId: string) => {
    if (!moderatedGroupCode) return
    verifyStudentMutation.mutate({ code: moderatedGroupCode, userId })
  }

  const handleChangeRole = (userId: string, role: GroupRole) => {
    if (!moderatedGroupCode) return
    changeRoleMutation.mutate({ code: moderatedGroupCode, userId, role })
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50 mb-6">
        {t('nav.settings')}
      </h1>

      {/* На телефоне пункта «Модерация» нет в нижнем меню — ссылка здесь (#99) */}
      {user?.is_moderator && (
        <Link
          to="/moderation"
          className="md:hidden mb-4 flex items-center justify-between rounded-lg bg-primary-50 px-4 py-3 text-sm font-medium text-primary-700 dark:bg-primary-500/10 dark:text-primary-300"
        >
          {t('nav.moderation')}
          <span aria-hidden>→</span>
        </Link>
      )}

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
                {t('settings.profile')}
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
                    <Avatar name={displayName || t('common.student')} size="lg" />
                    <div>
                      <div className="font-medium text-surface-900 dark:text-surface-50">
                        {displayName || t('common.student')}
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
                      label={t('settings.displayName')}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />

                    <div>
                      <div className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
                        {t('settings.language')}
                      </div>
                      <div className="flex gap-2">
                        {LANGUAGES.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setLang(value)}
                            className={clsx(
                              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                              value === lang
                                ? 'bg-primary-500 text-white'
                                : 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600'
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {saveError && (
                      <p className="text-sm text-danger-500">{saveError}</p>
                    )}

                    <div className="pt-4 flex gap-3">
                      <Button
                        variant="primary"
                        onClick={handleSaveProfile}
                        disabled={savePending}
                      >
                        {savePending ? t('common.saving') : t('common.save')}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={handleLogout}
                        disabled={logoutMutation.isPending}
                        className="text-danger-500 hover:text-danger-600"
                      >
                        {t('settings.logout')}
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
                {t('nav.notifications')}
              </h2>
              <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">
                {t('settings.notif.hint')}
              </p>

              <div className="space-y-1">
                {notifications.map((n) => (
                  <div
                    key={n.type}
                    className="flex items-center justify-between py-3 border-b border-surface-100 dark:border-surface-700 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-medium text-surface-900 dark:text-surface-50">
                        {t(n.label)}
                      </div>
                      <div className="text-xs text-surface-500 dark:text-surface-400">
                        {t(n.description)}
                      </div>
                      {n.type === 'class_reminder' && n.enabled && (
                        <div className="flex gap-2 mt-2">
                          {([10, 15] as const).map((m) => (
                            <button
                              key={m}
                              disabled={reminderPending}
                              onClick={() => setReminderMinutes(m)}
                              className={clsx(
                                'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                                m === reminderMinutes
                                  ? 'bg-primary-500 text-white'
                                  : 'bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-200'
                              )}
                            >
                              {t('settings.notif.minutes', { m })}
                            </button>
                          ))}
                        </div>
                      )}
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
                {t('settings.group')}
              </h2>

              {/* Current memberships */}
              <div className="mb-6">
                <p className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-3">
                  {t('settings.yourGroups')}
                </p>
                {myGroupsQuery.isLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="h-12 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
                    ))}
                  </div>
                ) : memberships.length === 0 ? (
                  <p className="text-sm text-surface-500 dark:text-surface-400 py-3">
                    {t('settings.noGroups')}
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
                              {t('roles.starosta')}
                            </span>
                          )}
                          {membership.role === 'deputy' && (
                            <span className="text-xs px-2 py-0.5 bg-info-100 text-info-600 dark:bg-info-500/20 dark:text-info-400 rounded-full font-medium">
                              {t('roles.deputy')}
                            </span>
                          )}
                          {!membership.verified && (
                            <span className="text-xs px-2 py-0.5 bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400 rounded-full font-medium">
                              {t('settings.pending')}
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
                  {memberships.length > 0 ? t('settings.joinOther') : t('settings.findGroup')}
                </p>

                <Input
                  placeholder={t('settings.groupPlaceholder')}
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
                        {t('settings.searching')}
                      </div>
                    ) : !searchGroupsQuery.data || searchGroupsQuery.data.length === 0 ? (
                      <div className="px-4 py-3 text-sm text-surface-500 dark:text-surface-400">
                        {t('settings.groupsNotFound')}
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
                              {alreadyMember ? t('settings.inGroup') : t('settings.join')}
                            </Button>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Moderator: group member management */}
              {isModerator && (
                <div className="pt-6 mt-2 border-t border-surface-200 dark:border-surface-700">
                  <p className="text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                    {t('settings.members')}
                  </p>
                  <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">
                    {t('settings.membersHint')}
                  </p>

                  {groupStudentsQuery.isLoading ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-12 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : !groupStudentsQuery.data || groupStudentsQuery.data.length === 0 ? (
                    <p className="text-sm text-surface-500 dark:text-surface-400 py-2">
                      {t('settings.noMembers')}
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {groupStudentsQuery.data.map((student) => {
                        const isPending = verifyStudentMutation.isPending || changeRoleMutation.isPending
                        return (
                          <div
                            key={student.id}
                            className="flex items-center gap-3 py-2.5 border-b border-surface-100 dark:border-surface-700 last:border-0"
                          >
                            <Avatar name={student.user.display_name || student.user_id} size="sm" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-surface-900 dark:text-surface-50 truncate">
                                {student.user.display_name || t('common.student')}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {student.verified ? (
                                  <span className="text-xs text-success-600 dark:text-success-400 flex items-center gap-1">
                                    <CheckIcon className="w-3 h-3" />
                                    {t('settings.verified')}
                                  </span>
                                ) : (
                                  <span className="text-xs text-warning-600 dark:text-warning-400">
                                    {t('settings.awaitingApproval')}
                                  </span>
                                )}
                                {student.role !== 'student' && (
                                  <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400 rounded font-medium capitalize">
                                    {student.role === 'starosta' ? t('roles.starosta') : student.role === 'deputy' ? t('roles.deputy') : student.role === 'assistant' ? t('roles.assistant') : student.role}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              {!student.verified && (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() => handleVerify(student.user_id)}
                                >
                                  {t('settings.approve')}
                                </Button>
                              )}
                              {student.role === 'student' && student.verified && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() => handleChangeRole(student.user_id, 'assistant')}
                                >
                                  {t('settings.makeAssistant')}
                                </Button>
                              )}
                              {student.role === 'assistant' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() => handleChangeRole(student.user_id, 'student')}
                                >
                                  {t('settings.removeRole')}
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          )}

          {activeSection === 'support' && <SupportSection />}

          {/* About */}
          {activeSection === 'about' && (
            <Card padding="lg">
              <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-6">
                {t('settings.about')}
              </h2>

              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-surface-500 dark:text-surface-400">{t('settings.version')}</span>
                  <span className="text-surface-900 dark:text-surface-50 font-medium">0.1.0-alpha</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-500 dark:text-surface-400">{t('settings.developer')}</span>
                  <span className="text-surface-900 dark:text-surface-50 font-medium">Nexora Team</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-surface-500 dark:text-surface-400">{t('nav.schedule')}</span>
                  <span className="text-surface-900 dark:text-surface-50 font-medium">rasp.dmami.ru</span>
                </div>

                <div className="pt-4 border-t border-surface-200 dark:border-surface-700">
                  <p className="text-sm text-surface-500 dark:text-surface-400">
                    {t('settings.aboutText')}
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  )
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.83L3 20l1.4-3.72A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  )
}
