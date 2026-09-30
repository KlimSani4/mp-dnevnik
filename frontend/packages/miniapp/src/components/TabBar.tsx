import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { useHapticFeedback } from '../telegram/useTelegramWebApp'

const tabs = [
  { to: '/', label: 'Сегодня', icon: HomeIcon },
  { to: '/assignments', label: 'Задания', icon: ClipboardIcon },
  { to: '/tasks', label: 'Мои', icon: CheckIcon },
  { to: '/profile', label: 'Ещё', icon: MoreIcon },
]

export function TabBar() {
  const haptic = useHapticFeedback()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-tg-bg border-t border-tg-secondary">
      <div className="flex items-center justify-around px-4 py-2 safe-area-pb">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={() => haptic.selection()}
            className={({ isActive }) =>
              clsx(
                'flex flex-col items-center gap-1 py-1 px-3 tap-target',
                isActive ? 'text-primary-500' : 'text-tg-hint'
              )
            }
          >
            <Icon className="w-6 h-6" />
            <span className="text-xs">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  )
}
