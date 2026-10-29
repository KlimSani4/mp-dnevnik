import { useState, useEffect } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { useCurrentUser, useGroupContext } from '@nexora/shared'
import { Icon } from '../components/ui/Icon'
import { useT, type MessageKey } from '../i18n'

const mainNav = [
  { to: '/', label: 'nav.home' as MessageKey, icon: HomeIcon },
  { to: '/schedule', label: 'nav.schedule' as MessageKey, icon: CalendarIcon },
  { to: '/assignments', label: 'nav.assignments' as MessageKey, icon: ClipboardIcon },
  { to: '/subjects', label: 'nav.subjects' as MessageKey, icon: BookIcon },
]

const secondaryNav = [
  { to: '/settings', label: 'nav.settings' as MessageKey, icon: SettingsIcon },
  { to: '/notifications', label: 'nav.notifications' as MessageKey, icon: BellIcon },
]

// Видно только модераторам платформы (#99)
const moderatorNav = [
  { to: '/moderation', label: 'nav.moderation' as MessageKey, icon: ShieldIcon },
]

const tabBarItems = [
  { to: '/', label: 'nav.today' as MessageKey, icon: HomeIcon },
  { to: '/schedule', label: 'nav.schedule' as MessageKey, icon: CalendarIcon },
  { to: '/assignments', label: 'nav.assignments' as MessageKey, icon: ClipboardIcon },
  { to: '/subjects', label: 'nav.subjects' as MessageKey, icon: BookIcon },
  { to: '/settings', label: 'nav.more' as MessageKey, icon: MoreIcon },
]

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const currentUserQuery = useCurrentUser()
  const { groupCode } = useGroupContext()
  const user = currentUserQuery.data
  const { t } = useT()
  const displayName = user?.display_name || t('layout.userFallback')
  const initial = displayName.trim()[0]?.toUpperCase() || '?'
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark')
    }
    return false
  })

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50 dark:bg-surface-900">
      {/* Desktop Sidebar */}
      <aside className={clsx(
        'hidden md:flex h-screen shrink-0 flex-col border-r border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 transition-all duration-200',
        collapsed ? 'w-[60px]' : 'w-52',
      )}>
        {/* Logo */}
        <div className={clsx('flex items-center gap-3 py-5', collapsed ? 'px-3 justify-center' : 'px-4')}>
          <div
            className="w-11 h-11 flex items-center justify-center cursor-pointer flex-shrink-0"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? t('layout.expand') : t('layout.collapse')}
          >
            
            <img src="/logo_nexora.png" alt={t('layout.logoAlt')} className="w-full h-full object-contain" />

          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0 translate-y-1">
              <div className="text-xs font-semibold text-surface-900 dark:text-surface-50 truncate">{t('layout.uniLine1')}</div>
              <div className="text-xs font-semibold text-surface-900 dark:text-surface-50 truncate">{t('layout.uniLine2')}</div>
            </div>
          )}
        </div>

        {/* Main Navigation */}
        <nav className={clsx('flex-1 space-y-1', collapsed ? 'px-1.5' : 'px-2')}>
          {mainNav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? t(label) : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-primary-500 text-white'
                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700'
                )
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && t(label)}
            </NavLink>
          ))}

          {/* Divider */}
          <div className="!my-4 border-t border-surface-200 dark:border-surface-700" />

          {/* Secondary Navigation */}
          {[...secondaryNav, ...(user?.is_moderator ? moderatorNav : [])].map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              title={collapsed ? t(label) : undefined}
              className={({ isActive }) =>
                clsx(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-primary-500 text-white'
                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700'
                )
              }
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && t(label)}
            </NavLink>
          ))}
        </nav>

        {/* Theme Toggle */}
        <div className={clsx('py-3', collapsed ? 'px-1.5' : 'px-3')}>
          {collapsed ? (
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="w-full flex items-center justify-center p-2 rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors"
              title={darkMode ? t('layout.lightTheme') : t('layout.darkTheme')}
            >
              {darkMode ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
            </button>
          ) : (
            <div className="flex items-center gap-1 p-1 bg-surface-100 dark:bg-surface-700 rounded-lg">
              <button
                onClick={() => setDarkMode(false)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                  !darkMode
                    ? 'bg-white dark:bg-surface-600 text-surface-900 dark:text-surface-50 shadow-sm'
                    : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'
                )}
              >
                <SunIcon className="w-3.5 h-3.5" />
                {t('layout.light')}
              </button>
              <button
                onClick={() => setDarkMode(true)}
                className={clsx(
                  'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                  darkMode
                    ? 'bg-white dark:bg-surface-600 text-surface-900 dark:text-surface-50 shadow-sm'
                    : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'
                )}
              >
                <MoonIcon className="w-3.5 h-3.5" />
                {t('layout.dark')}
              </button>
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className={clsx('py-3 border-t border-surface-200 dark:border-surface-700', collapsed ? 'px-1.5' : 'px-3')}>
          <div className={clsx('flex items-center', collapsed ? 'justify-center' : 'gap-3')}>
            <div className={clsx(
              'rounded-full bg-surface-200 dark:bg-surface-600 flex items-center justify-center flex-shrink-0',
              collapsed ? 'w-8 h-8' : 'w-9 h-9',
            )}>
              <span className="text-sm font-medium text-surface-600 dark:text-surface-300">{initial}</span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-surface-900 dark:text-surface-50 truncate">{displayName}</div>
                <div className="text-xs text-surface-500 dark:text-surface-400 truncate">{groupCode ?? t('layout.noGroup')}</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="h-screen flex-1 min-w-0 overflow-y-auto pb-20 md:pb-0">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>

      {/* Mobile navigation dock */}
      <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:hidden">
        <div className="flex w-full items-center rounded-2xl border border-surface-200/80 bg-white p-1.5 shadow-lg shadow-surface-900/10 dark:border-surface-700 dark:bg-surface-800 dark:shadow-black/20">
          {tabBarItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'relative flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-2 transition-colors duration-200',
                  isActive
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-surface-400 hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="dock-active-indicator absolute inset-0 rounded-xl bg-primary-50 dark:bg-primary-500/15" />}
                  <Icon className="relative z-10 h-5 w-5 transition-colors duration-200" />
                  <span className="relative z-10 text-2xs font-medium">{t(label)}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

/* ─── Icon Components ─── */

function HomeIcon({ className }: { className?: string }) {
  return <Icon name="home" className={className} />
}

function CalendarIcon({ className }: { className?: string }) {
  return <Icon name="calendar" className={className} />
}

function ClipboardIcon({ className }: { className?: string }) {
  return <Icon name="clipboard" className={className} />
}

function BookIcon({ className }: { className?: string }) {
  return <Icon name="files" className={className} />
}

function SettingsIcon({ className }: { className?: string }) {
  return <Icon name="settings" className={className} />
}

function BellIcon({ className }: { className?: string }) {
  return <Icon name="bell" className={className} />
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

function ShieldIcon({ className }: { className?: string }) {
  return <Icon name="crown" className={className} />
}
