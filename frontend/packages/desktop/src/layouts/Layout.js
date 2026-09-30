import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useCurrentUser, useGroupContext } from '@nexora/shared';
const mainNav = [
    { to: '/', label: 'Главная', icon: HomeIcon },
    { to: '/schedule', label: 'Расписание', icon: CalendarIcon },
    { to: '/assignments', label: 'Задания', icon: ClipboardIcon },
    { to: '/subjects', label: 'Предметы', icon: BookIcon },
];
const secondaryNav = [
    { to: '/settings', label: 'Настройки', icon: SettingsIcon },
    { to: '/notifications', label: 'Уведомления', icon: BellIcon },
];
const tabBarItems = [
    { to: '/', label: 'Сегодня', icon: HomeIcon },
    { to: '/schedule', label: 'Расписание', icon: CalendarIcon },
    { to: '/assignments', label: 'Задания', icon: ClipboardIcon },
    { to: '/subjects', label: 'Предметы', icon: BookIcon },
    { to: '/settings', label: 'Ещё', icon: MoreIcon },
];
export function Layout() {
    const [collapsed, setCollapsed] = useState(false);
    const currentUserQuery = useCurrentUser();
    const { groupCode } = useGroupContext();
    const user = currentUserQuery.data;
    const displayName = user?.display_name || 'Пользователь';
    const initial = displayName.trim()[0]?.toUpperCase() || '?';
    const [darkMode, setDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });
    useEffect(() => {
        if (darkMode) {
            document.documentElement.classList.add('dark');
        }
        else {
            document.documentElement.classList.remove('dark');
        }
    }, [darkMode]);
    return (_jsxs("div", { className: "flex min-h-screen bg-surface-50 dark:bg-surface-900", children: [_jsxs("aside", { className: clsx('hidden md:flex flex-col border-r border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 transition-all duration-200', collapsed ? 'w-[60px]' : 'w-52'), children: [_jsxs("div", { className: clsx('flex items-center gap-3 py-5', collapsed ? 'px-3 justify-center' : 'px-4'), children: [_jsx("div", { className: "w-8 h-8 rounded-full bg-primary-500 flex items-center justify-center cursor-pointer flex-shrink-0", onClick: () => setCollapsed(!collapsed), title: collapsed ? 'Развернуть' : 'Свернуть', children: _jsx("svg", { className: "w-4 h-4 text-white", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", stroke: "currentColor", strokeWidth: "2", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), !collapsed && (_jsxs("div", { className: "leading-tight min-w-0", children: [_jsx("div", { className: "text-xs font-semibold text-surface-900 dark:text-surface-50 truncate", children: "\u041C\u043E\u0441\u043A\u043E\u0432\u0441\u043A\u0438\u0439" }), _jsx("div", { className: "text-xs font-semibold text-surface-900 dark:text-surface-50 truncate", children: "\u041F\u043E\u043B\u0438\u0442\u0435\u0445" })] }))] }), _jsxs("nav", { className: clsx('flex-1 space-y-1', collapsed ? 'px-1.5' : 'px-2'), children: [mainNav.map(({ to, label, icon: Icon }) => (_jsxs(NavLink, { to: to, end: to === '/', title: collapsed ? label : undefined, className: ({ isActive }) => clsx('flex items-center rounded-lg text-sm font-medium transition-colors', collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5', isActive
                                    ? 'bg-primary-500 text-white'
                                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700'), children: [_jsx(Icon, { className: "w-5 h-5 flex-shrink-0" }), !collapsed && label] }, to))), _jsx("div", { className: "!my-4 border-t border-surface-200 dark:border-surface-700" }), secondaryNav.map(({ to, label, icon: Icon }) => (_jsxs(NavLink, { to: to, title: collapsed ? label : undefined, className: ({ isActive }) => clsx('flex items-center rounded-lg text-sm font-medium transition-colors', collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5', isActive
                                    ? 'bg-primary-500 text-white'
                                    : 'text-surface-600 hover:bg-surface-100 dark:text-surface-400 dark:hover:bg-surface-700'), children: [_jsx(Icon, { className: "w-5 h-5 flex-shrink-0" }), !collapsed && label] }, to)))] }), _jsx("div", { className: clsx('py-3', collapsed ? 'px-1.5' : 'px-3'), children: collapsed ? (_jsx("button", { onClick: () => setDarkMode(!darkMode), className: "w-full flex items-center justify-center p-2 rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors", title: darkMode ? 'Светлая тема' : 'Тёмная тема', children: darkMode ? _jsx(SunIcon, { className: "w-4 h-4" }) : _jsx(MoonIcon, { className: "w-4 h-4" }) })) : (_jsxs("div", { className: "flex items-center gap-1 p-1 bg-surface-100 dark:bg-surface-700 rounded-lg", children: [_jsxs("button", { onClick: () => setDarkMode(false), className: clsx('flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors', !darkMode
                                        ? 'bg-white dark:bg-surface-600 text-surface-900 dark:text-surface-50 shadow-sm'
                                        : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'), children: [_jsx(SunIcon, { className: "w-3.5 h-3.5" }), "\u0421\u0432\u0435\u0442\u043B\u0430\u044F"] }), _jsxs("button", { onClick: () => setDarkMode(true), className: clsx('flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors', darkMode
                                        ? 'bg-white dark:bg-surface-600 text-surface-900 dark:text-surface-50 shadow-sm'
                                        : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'), children: [_jsx(MoonIcon, { className: "w-3.5 h-3.5" }), "\u0422\u0451\u043C\u043D\u0430\u044F"] })] })) }), _jsx("div", { className: clsx('py-3 border-t border-surface-200 dark:border-surface-700', collapsed ? 'px-1.5' : 'px-3'), children: _jsxs("div", { className: clsx('flex items-center', collapsed ? 'justify-center' : 'gap-3'), children: [_jsx("div", { className: clsx('rounded-full bg-surface-200 dark:bg-surface-600 flex items-center justify-center flex-shrink-0', collapsed ? 'w-8 h-8' : 'w-9 h-9'), children: _jsx("span", { className: "text-sm font-medium text-surface-600 dark:text-surface-300", children: initial }) }), !collapsed && (_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "text-sm font-medium text-surface-900 dark:text-surface-50 truncate", children: displayName }), _jsx("div", { className: "text-xs text-surface-500 dark:text-surface-400 truncate", children: groupCode ?? 'Без группы' })] }))] }) })] }), _jsx("main", { className: "flex-1 min-w-0 pb-20 md:pb-0", children: _jsx("div", { className: "p-4 md:p-8", children: _jsx(Outlet, {}) }) }), _jsx("nav", { className: "flex md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-surface-800 border-t border-surface-200 dark:border-surface-700 z-50", children: _jsx("div", { className: "flex w-full pb-[env(safe-area-inset-bottom)]", children: tabBarItems.map(({ to, label, icon: Icon }) => (_jsxs(NavLink, { to: to, end: to === '/', className: ({ isActive }) => clsx('flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors', isActive
                            ? 'text-primary-500'
                            : 'text-surface-400 dark:text-surface-500'), children: [_jsx(Icon, { className: "w-5 h-5" }), _jsx("span", { className: "text-2xs font-medium", children: label })] }, to))) }) })] }));
}
/* ─── Icon Components ─── */
function HomeIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" }) }));
}
function CalendarIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" }) }));
}
function ClipboardIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" }) }));
}
function BookIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" }) }));
}
function SettingsIcon({ className }) {
    return (_jsxs("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: [_jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" }), _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" })] }));
}
function BellIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" }) }));
}
function MoreIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4 6h16M4 12h16M4 18h16" }) }));
}
function SunIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" }) }));
}
function MoonIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" }) }));
}
