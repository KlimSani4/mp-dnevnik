import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useHapticFeedback } from '../telegram/useTelegramWebApp';
const tabs = [
    { to: '/', label: 'Сегодня', icon: HomeIcon },
    { to: '/assignments', label: 'Задания', icon: ClipboardIcon },
    { to: '/tasks', label: 'Мои', icon: CheckIcon },
    { to: '/profile', label: 'Ещё', icon: MoreIcon },
];
export function TabBar() {
    const haptic = useHapticFeedback();
    return (_jsx("nav", { className: "fixed bottom-0 left-0 right-0 bg-tg-bg border-t border-tg-secondary", children: _jsx("div", { className: "flex items-center justify-around px-4 py-2 safe-area-pb", children: tabs.map(({ to, label, icon: Icon }) => (_jsxs(NavLink, { to: to, onClick: () => haptic.selection(), className: ({ isActive }) => clsx('flex flex-col items-center gap-1 py-1 px-3 tap-target', isActive ? 'text-primary-500' : 'text-tg-hint'), children: [_jsx(Icon, { className: "w-6 h-6" }), _jsx("span", { className: "text-xs", children: label })] }, to))) }) }));
}
function HomeIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" }) }));
}
function ClipboardIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" }) }));
}
function CheckIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" }) }));
}
function MoreIcon({ className }) {
    return (_jsx("svg", { className: className, fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M4 6h16M4 12h16M4 18h16" }) }));
}
