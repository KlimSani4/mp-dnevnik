import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { clsx } from 'clsx';
import { Card, Button } from '../components/ui';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@nexora/shared';
const TYPE_CONFIG = {
    schedule_change: {
        icon: _jsx(CalendarIcon, {}),
        color: 'bg-info-100 text-info-600 dark:bg-info-500/20 dark:text-info-400',
        label: 'Расписание',
    },
    new_assignment: {
        icon: _jsx(ClipboardIcon, {}),
        color: 'bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400',
        label: 'Задание',
    },
    deadline: {
        icon: _jsx(ClockIcon, {}),
        color: 'bg-danger-100 text-danger-600 dark:bg-danger-500/20 dark:text-danger-400',
        label: 'Дедлайн',
    },
    vote: {
        icon: _jsx(VoteIcon, {}),
        color: 'bg-warning-100 text-warning-600 dark:bg-warning-500/20 dark:text-warning-400',
        label: 'Голосование',
    },
    digest: {
        icon: _jsx(UsersIcon, {}),
        color: 'bg-success-100 text-success-600 dark:bg-success-500/20 dark:text-success-400',
        label: 'Дайджест',
    },
};
export function NotificationsPage() {
    const [filter, setFilter] = useState('all');
    const notificationsQuery = useNotifications();
    const markReadMutation = useMarkNotificationRead();
    const markAllReadMutation = useMarkAllNotificationsRead();
    const notifications = notificationsQuery.data?.items ?? [];
    const unreadCount = notificationsQuery.data?.unread_count ?? notifications.filter((n) => !n.is_read).length;
    const filtered = filter === 'all'
        ? notifications
        : notifications.filter((n) => n.type === filter);
    const markAllRead = () => {
        markAllReadMutation.mutate();
    };
    const markRead = (id) => {
        markReadMutation.mutate(id);
    };
    const filters = [
        { key: 'all', label: 'Все' },
        { key: 'schedule_change', label: 'Расписание' },
        { key: 'new_assignment', label: 'Задания' },
        { key: 'deadline', label: 'Дедлайны' },
        { key: 'vote', label: 'Голосования' },
    ];
    if (notificationsQuery.isLoading) {
        return (_jsxs("div", { children: [_jsx("div", { className: "flex items-center justify-between mb-6", children: _jsx("div", { children: _jsx("h1", { className: "text-2xl font-semibold text-surface-900 dark:text-surface-50", children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F" }) }) }), _jsx("div", { className: "space-y-2", children: [1, 2, 3, 4, 5].map((i) => (_jsx("div", { className: "h-20 bg-surface-200 dark:bg-surface-700 rounded-xl animate-pulse" }, i))) })] }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold text-surface-900 dark:text-surface-50", children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F" }), unreadCount > 0 && (_jsxs("p", { className: "text-sm text-surface-500 dark:text-surface-400 mt-1", children: [unreadCount, " \u043D\u0435\u043F\u0440\u043E\u0447\u0438\u0442\u0430\u043D\u043D\u044B\u0445"] }))] }), unreadCount > 0 && (_jsx(Button, { variant: "ghost", size: "sm", onClick: markAllRead, disabled: markAllReadMutation.isPending, children: "\u041F\u0440\u043E\u0447\u0438\u0442\u0430\u0442\u044C \u0432\u0441\u0435" }))] }), _jsx("div", { className: "flex gap-2 mb-6 overflow-x-auto pb-2", children: filters.map(({ key, label }) => (_jsx("button", { onClick: () => setFilter(key), className: clsx('px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap', filter === key
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-200 dark:hover:bg-surface-600'), children: label }, key))) }), _jsxs("div", { className: "space-y-2", children: [filtered.map((notif) => {
                        const config = TYPE_CONFIG[notif.type];
                        return (_jsx(Card, { variant: notif.is_read ? 'default' : 'hover', padding: "sm", className: clsx(!notif.is_read && 'border-l-4 border-l-primary-500'), onClick: () => !notif.is_read && markRead(notif.id), children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: clsx('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', config.color), children: config.icon }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-0.5", children: [_jsx("span", { className: "text-sm font-medium text-surface-900 dark:text-surface-50", children: notif.title }), !notif.is_read && (_jsx("span", { className: "w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" }))] }), _jsx("p", { className: "text-sm text-surface-600 dark:text-surface-400 line-clamp-2", children: notif.body }), _jsx("span", { className: "text-xs text-surface-400 dark:text-surface-500 mt-1 block", children: new Date(notif.created_at).toLocaleString('ru-RU', {
                                                    day: 'numeric',
                                                    month: 'short',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                }) })] })] }) }, notif.id));
                    }), filtered.length === 0 && (_jsxs("div", { className: "text-center py-12", children: [_jsx("div", { className: "text-surface-300 dark:text-surface-600 mb-3", children: _jsx("svg", { className: "w-12 h-12 mx-auto", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" }) }) }), _jsx("p", { className: "text-surface-500 dark:text-surface-400", children: "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u0439 \u043D\u0435\u0442" })] }))] })] }));
}
/* ─── Mini Icons ─── */
function CalendarIcon() {
    return (_jsx("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" }) }));
}
function ClipboardIcon() {
    return (_jsx("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" }) }));
}
function ClockIcon() {
    return (_jsxs("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: [_jsx("circle", { cx: "12", cy: "12", r: "10" }), _jsx("path", { d: "M12 6v6l4 2" })] }));
}
function VoteIcon() {
    return (_jsx("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" }) }));
}
function UsersIcon() {
    return (_jsx("svg", { className: "w-5 h-5", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" }) }));
}
