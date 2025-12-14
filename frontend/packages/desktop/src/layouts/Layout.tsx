import { Outlet, NavLink } from 'react-router-dom'
import { clsx } from 'clsx'

const navItems = [
  { to: '/', label: 'Главная', icon: HomeIcon },
  { to: '/schedule', label: 'Расписание', icon: CalendarIcon },
  { to: '/assignments', label: 'Домашка', icon: ClipboardIcon },
]

export function Layout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-surface-200 dark:border-surface-700 p-4 flex flex-col">
        <div className="flex items-center gap-2 px-2 mb-8">
          <div className="w-8 h-8 bg-surface-900 dark:bg-white rounded-full" />
          <div>
            <div className="font-semibold text-sm">Московский</div>
            <div className="font-semibold text-sm">Политех</div>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary-500 text-white'
                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-800'
                )
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-surface-200 dark:border-surface-700">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-full bg-surface-200 dark:bg-surface-700" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">Анастасия</div>
              <div className="text-xs text-surface-500 truncate">241-237</div>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )
}
