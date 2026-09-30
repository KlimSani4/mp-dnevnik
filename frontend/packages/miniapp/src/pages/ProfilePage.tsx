import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCurrentUser, useLogout, useApi } from '@nexora/shared'
import { useTelegramWebApp } from '../telegram/useTelegramWebApp'

export function ProfilePage() {
  const { data: user, isLoading } = useCurrentUser()
  const logout = useLogout()
  const { webApp } = useTelegramWebApp()
  const api = useApi()
  const queryClient = useQueryClient()

  const tgUser = webApp?.initDataUnsafe.user
  const avatarUrl = tgUser
    ? `https://t.me/i/userpic/320/${tgUser.username}`
    : null

  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.settings?.notifications ?? true
  )

  const updateSettings = useMutation({
    mutationFn: (notifications: boolean) =>
      api.users.updateMe({ settings: { notifications } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user', 'me'] })
    },
  })

  const handleToggleNotifications = () => {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    updateSettings.mutate(next)
  }

  const handleLogout = () => {
    logout.mutate()
  }

  if (isLoading) {
    return (
      <div style={{ padding: '16px 12px' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 32,
            gap: 12,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'var(--tg-theme-secondary-bg-color)',
              opacity: 0.5,
            }}
          />
          <div
            style={{
              height: 18,
              width: 140,
              background: 'var(--tg-theme-secondary-bg-color)',
              borderRadius: 6,
              opacity: 0.5,
            }}
          />
          <div
            style={{
              height: 14,
              width: 100,
              background: 'var(--tg-theme-secondary-bg-color)',
              borderRadius: 6,
              opacity: 0.5,
            }}
          />
        </div>
      </div>
    )
  }

  const displayName =
    user?.display_name ||
    [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(' ') ||
    'Студент'

  return (
    <div style={{ padding: '16px 12px' }}>
      {/* Avatar + name */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 16,
          paddingBottom: 24,
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              objectFit: 'cover',
              marginBottom: 12,
              background: 'var(--tg-theme-secondary-bg-color)',
            }}
          />
        ) : (
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'var(--tg-theme-button-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              fontSize: 28,
              color: 'var(--tg-theme-button-text-color)',
              fontWeight: 600,
            }}
          >
            {displayName[0]?.toUpperCase() ?? '?'}
          </div>
        )}

        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--tg-theme-text-color)',
            marginBottom: 4,
          }}
        >
          {displayName}
        </div>

        {tgUser?.username && (
          <div style={{ color: 'var(--tg-theme-hint-color)', fontSize: 14 }}>
            @{tgUser.username}
          </div>
        )}
      </div>

      {/* Notifications section */}
      <div
        style={{
          background: 'var(--tg-theme-secondary-bg-color)',
          borderRadius: 12,
          marginBottom: 12,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '10px 14px 6px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--tg-theme-hint-color)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Уведомления
        </div>

        <button
          onClick={handleToggleNotifications}
          disabled={updateSettings.isPending}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <span style={{ color: 'var(--tg-theme-text-color)', fontSize: 15 }}>
            Уведомления о парах
          </span>
          <div
            style={{
              width: 48,
              height: 28,
              borderRadius: 14,
              background: notificationsEnabled
                ? 'var(--tg-theme-button-color)'
                : 'var(--tg-theme-hint-color)',
              position: 'relative',
              transition: 'background 0.2s',
              opacity: updateSettings.isPending ? 0.6 : 1,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: notificationsEnabled ? 23 : 3,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          </div>
        </button>
      </div>

      {/* Logout */}
      <div
        style={{
          background: 'var(--tg-theme-secondary-bg-color)',
          borderRadius: 12,
        }}
      >
        <button
          onClick={handleLogout}
          disabled={logout.isPending}
          style={{
            width: '100%',
            padding: '14px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: '#ef4444',
            fontSize: 15,
            fontWeight: 500,
            opacity: logout.isPending ? 0.6 : 1,
          }}
        >
          {logout.isPending ? 'Выход...' : 'Выйти'}
        </button>
      </div>
    </div>
  )
}
