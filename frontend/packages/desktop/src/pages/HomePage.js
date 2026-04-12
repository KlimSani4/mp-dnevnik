import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow, differenceInMinutes, isBefore } from 'date-fns';
import { ru } from 'date-fns/locale';
import clsx from 'clsx';
import { Card, Badge, ProgressBar, Button, Icon, Avatar } from '../components/ui';
import { useCurrentUser, useTodaySchedule, useTasks, useGroupContext, useDashboard } from '@nexora/shared';
// ────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────
function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12)
        return 'Доброе утро';
    if (hour >= 12 && hour < 18)
        return 'Добрый день';
    if (hour >= 18 && hour < 23)
        return 'Добрый вечер';
    return 'Доброй ночи';
}
function getPairCountText(n) {
    if (n === 0)
        return 'Завтра пар нет, выспись';
    const lastDigit = n % 10;
    const lastTwo = n % 100;
    if (lastTwo >= 11 && lastTwo <= 14)
        return `Сегодня ${n} пар`;
    if (lastDigit === 1)
        return `Сегодня ${n} пара`;
    if (lastDigit >= 2 && lastDigit <= 4)
        return `Сегодня ${n} пары`;
    return `Сегодня ${n} пар`;
}
function parseTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}
function formatWindowDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0)
        return `${m} мин`;
    if (m === 0)
        return `${h}ч`;
    return `${h}ч ${m}мин`;
}
const lessonTypeConfig = {
    'очно': {
        icon: 'map-pin',
        iconBg: 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400',
        label: 'Очно',
    },
    'онлайн': {
        icon: 'play',
        iconBg: 'bg-success-50 text-success-600 dark:bg-success-900/30 dark:text-success-400',
        label: 'Онлайн',
    },
    'вебинар': {
        icon: 'video',
        iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
        label: 'Вебинар',
    },
};
const priorityToBadge = {
    urgent: { variant: 'urgent', label: 'Срочно' },
    high: { variant: 'high', label: 'Высокий' },
    normal: { variant: 'normal', label: 'Обычный' },
    low: { variant: 'success', label: 'Низкий' },
};
const taskStateLabels = {
    todo: 'Сделать',
    doing: 'В работе',
    review: 'На проверке',
    done: 'Готово',
};
const taskStateColors = {
    todo: 'bg-surface-200 dark:bg-surface-600',
    doing: 'bg-primary-500',
    review: 'bg-warning-500',
    done: 'bg-success-500',
};
// ────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────
function ScheduleCard({ entry }) {
    const config = lessonTypeConfig[entry.lesson_type];
    const isOnline = entry.lesson_type === 'онлайн' || entry.lesson_type === 'вебинар';
    const now = new Date();
    const startTime = parseTime(entry.start_time);
    const minutesUntilStart = differenceInMinutes(startTime, now);
    const isUpcoming = minutesUntilStart > 0 && minutesUntilStart <= 30;
    const isActive = now >= startTime && now <= parseTime(entry.end_time);
    return (_jsx(Card, { variant: "default", className: clsx('transition-all duration-200', isActive && 'ring-2 ring-primary-500/30 border-primary-300 dark:border-primary-600'), children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsx("div", { className: clsx('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', config.iconBg), children: _jsx(Icon, { name: config.icon, size: 18 }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "font-medium text-surface-900 dark:text-surface-50 truncate", children: entry.subject.name }), isActive && (_jsx("span", { className: "shrink-0 w-2 h-2 rounded-full bg-success-500 animate-pulse" }))] }), _jsxs("div", { className: "text-sm text-surface-500 dark:text-surface-400 mt-0.5", children: [entry.start_time, " - ", entry.end_time] }), _jsx("div", { className: "text-sm text-primary-500 mt-1 truncate", children: isOnline ? (entry.link ? (_jsx("a", { href: entry.link, target: "_blank", rel: "noopener noreferrer", className: "hover:underline", children: entry.lesson_type === 'вебинар' ? 'Ссылка на вебинар' : 'Ссылка на лекцию' })) : (config.label)) : (`${entry.room}, ${entry.location}`) }), _jsxs("div", { className: "flex items-center gap-2 mt-2 text-sm text-surface-500 dark:text-surface-400", children: [_jsx(Avatar, { name: entry.teacher, size: "xs" }), _jsx("span", { className: "truncate", children: entry.teacher })] }), isOnline && (isUpcoming || isActive) && (_jsx("div", { className: "mt-3", children: _jsx(Button, { variant: "success", size: "sm", icon: _jsx(Icon, { name: "play", size: 14 }), onClick: () => entry.link && window.open(entry.link, '_blank'), className: "w-full", children: isActive
                                    ? 'ПОДКЛЮЧИТЬСЯ'
                                    : `ПОДКЛЮЧИТЬСЯ (${minutesUntilStart} мин)` }) }))] })] }) }));
}
function WindowGap({ minutes }) {
    return (_jsxs("div", { className: "flex items-center gap-2 py-1 px-2", children: [_jsx("div", { className: "flex-1 border-t border-dashed border-surface-300 dark:border-surface-600" }), _jsxs("span", { className: "text-xs text-surface-400 dark:text-surface-500 whitespace-nowrap", children: ["\u041E\u043A\u043D\u043E ", formatWindowDuration(minutes)] }), _jsx("div", { className: "flex-1 border-t border-dashed border-surface-300 dark:border-surface-600" })] }));
}
function DeadlineCard({ assignment }) {
    const deadline = new Date(assignment.deadline);
    const now = new Date();
    const isOverdue = isBefore(deadline, now);
    const minutesLeft = differenceInMinutes(deadline, now);
    const hoursLeft = Math.floor(minutesLeft / 60);
    const badge = priorityToBadge[assignment.priority];
    let timeLabel;
    if (isOverdue) {
        timeLabel = 'Просрочено';
    }
    else if (hoursLeft < 24) {
        timeLabel = `${hoursLeft}ч`;
    }
    else {
        timeLabel = formatDistanceToNow(deadline, { locale: ru, addSuffix: false });
    }
    return (_jsx(Link, { to: "/assignments", className: "block", children: _jsx(Card, { variant: "hover", className: "group", children: _jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx(Badge, { variant: badge.variant, size: "sm", children: badge.label }), assignment.is_verified && (_jsxs(Badge, { variant: "verified", size: "sm", children: [_jsx(Icon, { name: "check", size: 10, className: "mr-0.5" }), "\u041F\u0440\u043E\u0432\u0435\u0440\u0435\u043D\u043E"] }))] }), _jsx("div", { className: "font-medium text-surface-900 dark:text-surface-50 truncate group-hover:text-primary-500 transition-colors", children: assignment.title }), _jsx("div", { className: "text-sm text-surface-500 dark:text-surface-400 mt-0.5", children: assignment.subject.name })] }), _jsxs("div", { className: "shrink-0 text-right", children: [_jsx("div", { className: clsx('text-sm font-medium', isOverdue
                                    ? 'text-danger-500'
                                    : hoursLeft < 24
                                        ? 'text-warning-500'
                                        : 'text-surface-500 dark:text-surface-400'), children: isOverdue ? (_jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Icon, { name: "clock", size: 14 }), timeLabel] })) : (_jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Icon, { name: "clock", size: 14 }), timeLabel] })) }), _jsx("div", { className: "text-xs text-surface-400 dark:text-surface-500 mt-0.5", children: format(deadline, 'd MMM', { locale: ru }) })] })] }) }) }));
}
function TaskItem({ task, onToggle }) {
    const isDone = task.state === 'done';
    return (_jsxs("div", { className: clsx('flex items-start gap-3 py-2.5 px-1 group', 'border-b border-surface-100 dark:border-surface-700 last:border-0'), children: [_jsx("button", { onClick: () => onToggle(task.id), className: clsx('shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors', isDone
                    ? 'bg-success-500 border-success-500 text-white'
                    : 'border-surface-300 dark:border-surface-600 hover:border-primary-500'), children: isDone && _jsx(Icon, { name: "check", size: 12, strokeWidth: 3 }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: clsx('text-sm font-medium truncate', isDone
                            ? 'line-through text-surface-400 dark:text-surface-500'
                            : 'text-surface-900 dark:text-surface-50'), children: task.assignment.title }), _jsxs("div", { className: "flex items-center gap-2 mt-0.5", children: [_jsx("span", { className: "text-xs text-surface-500 dark:text-surface-400 truncate", children: task.assignment.subject.name }), _jsx("span", { className: clsx('shrink-0 inline-block w-1.5 h-1.5 rounded-full', taskStateColors[task.state]) }), _jsx("span", { className: "shrink-0 text-2xs text-surface-400 dark:text-surface-500", children: taskStateLabels[task.state] })] })] })] }));
}
// ────────────────────────────────────────────────────────
// Main Component
// ────────────────────────────────────────────────────────
export function HomePage() {
    // ── API hooks ──
    const { groupId, groupCode } = useGroupContext();
    const currentUserQuery = useCurrentUser();
    const todayScheduleQuery = useTodaySchedule(groupCode ?? undefined);
    const tasksQuery = useTasks({ group_id: groupId ?? '' });
    const dashboardQuery = useDashboard(groupId && groupCode ? { group_id: groupId, group_code: groupCode } : undefined);
    const isApiLoading = todayScheduleQuery.isLoading || tasksQuery.isLoading;
    // ── Data sources ──
    const greeting = getGreeting();
    const userName = currentUserQuery.data?.display_name?.split(' ')[0] ?? 'Студент';
    // Map API schedule entries to local ScheduleEntry format
    const apiScheduleToLocal = (entry) => ({
        id: entry.id,
        pair_number: entry.pair_number,
        start_time: entry.start_time,
        end_time: entry.end_time,
        location: entry.location,
        room: entry.room,
        teacher: entry.teacher,
        lesson_type: entry.room === 'Онлайн' ? 'онлайн' : entry.room === 'Вебинар' ? 'вебинар' : 'очно',
        subject: entry.subject,
        link: undefined,
    });
    const scheduleEntries = (todayScheduleQuery.data?.entries ?? []).map(apiScheduleToLocal);
    const pairCount = scheduleEntries.length;
    const activeTasks = tasksQuery.data ?? [];
    // Assignments for deadlines — derive from active tasks
    const assignments = activeTasks
        .filter((t) => t.state !== 'done')
        .map((t) => t.assignment);
    // Live clock for countdown updates
    const [, setTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setTick((t) => t + 1), 60_000);
        return () => clearInterval(interval);
    }, []);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const handleToggleTask = (_id) => {
        // Task toggle is handled via AssignmentsPage / Kanban
    };
    // Build schedule list with windows
    const scheduleWithGaps = useMemo(() => {
        const items = [];
        const sorted = [...scheduleEntries].sort((a, b) => a.pair_number - b.pair_number);
        for (let i = 0; i < sorted.length; i++) {
            items.push({ type: 'entry', entry: sorted[i] });
            if (i < sorted.length - 1) {
                const endCurrent = parseTime(sorted[i].end_time);
                const startNext = parseTime(sorted[i + 1].start_time);
                const gap = differenceInMinutes(startNext, endCurrent);
                if (gap > 20) {
                    items.push({ type: 'gap', minutes: gap });
                }
            }
        }
        return items;
    }, [scheduleEntries]);
    // Deadlines sorted by closeness
    const burningDeadlines = useMemo(() => {
        return [...assignments].sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime());
    }, [assignments]);
    // Task stats — prefer dashboard aggregated data if available
    const dashProgress = dashboardQuery.data?.progress;
    const completedCount = dashProgress ? dashProgress.done : activeTasks.filter((t) => t.state === 'done').length;
    const totalCount = dashProgress ? dashProgress.total : activeTasks.length;
    const completionPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const todayFormatted = format(new Date(), "d MMMM, EEEE", { locale: ru });
    if (isApiLoading) {
        return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "mb-6", children: [_jsx("div", { className: "h-7 w-64 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" }), _jsx("div", { className: "h-4 w-48 bg-surface-200 dark:bg-surface-700 rounded animate-pulse mt-2" })] }), _jsx("div", { className: "hidden md:grid grid-cols-3 gap-6", children: [1, 2, 3].map((i) => (_jsx("div", { className: "space-y-3", children: [1, 2, 3].map((j) => (_jsx("div", { className: "h-28 bg-surface-200 dark:bg-surface-700 rounded-xl animate-pulse" }, j))) }, i))) }), _jsx("div", { className: "md:hidden space-y-4", children: [1, 2, 3, 4].map((i) => (_jsx("div", { className: "h-28 bg-surface-200 dark:bg-surface-700 rounded-xl animate-pulse" }, i))) })] }));
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "mb-6", children: [_jsxs("h1", { className: "text-xl md:text-2xl font-semibold text-surface-900 dark:text-surface-50", children: [greeting, ", ", userName, "!"] }), _jsxs("p", { className: "text-sm text-surface-500 dark:text-surface-400 mt-1", children: [getPairCountText(pairCount), " \u00B7 ", todayFormatted] })] }), _jsxs("div", { className: "hidden md:grid grid-cols-3 gap-6 items-start", children: [_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h2", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F" }), _jsxs(Link, { to: "/schedule", className: "text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1", children: ["\u0412\u0441\u0435", _jsx(Icon, { name: "chevron-right", size: 14 })] })] }), scheduleWithGaps.length === 0 ? (_jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 py-4 text-center", children: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F \u043F\u0430\u0440 \u043D\u0435\u0442" })) : (scheduleWithGaps.map((item, idx) => item.type === 'entry' ? (_jsx(ScheduleCard, { entry: item.entry }, item.entry.id)) : (_jsx(WindowGap, { minutes: item.minutes }, `gap-${idx}`))))] }), _jsxs("div", { className: "space-y-4", children: [_jsxs(Card, { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h3", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50", children: "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0445 \u0440\u0430\u0431\u043E\u0442" }), _jsx(Link, { to: "/assignments", className: "text-surface-400 dark:text-surface-500 hover:text-primary-500 transition-colors", children: _jsx(Icon, { name: "chevron-right", size: 18 }) })] }), _jsxs("div", { className: "flex items-baseline gap-3 mb-3", children: [_jsxs("span", { className: "text-3xl font-bold text-surface-900 dark:text-surface-50", children: [completionPercent, "%"] }), _jsx("span", { className: "text-sm font-medium text-success-500", children: "+5%" })] }), _jsx(ProgressBar, { value: completionPercent, color: "success" }), _jsxs("div", { className: "text-xs text-surface-400 dark:text-surface-500 mt-2", children: [completedCount, " \u0438\u0437 ", totalCount, " \u0437\u0430\u0434\u0430\u043D\u0438\u0439 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043E"] })] }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h3", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide", children: "\u0413\u043E\u0440\u044F\u0449\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u044B" }), _jsxs(Link, { to: "/assignments", className: "text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1", children: ["\u0412\u0441\u0435", _jsx(Icon, { name: "chevron-right", size: 14 })] })] }), _jsx("div", { className: "space-y-3", children: burningDeadlines.length === 0 ? (_jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 py-2 text-center", children: "\u041D\u0435\u0442 \u0433\u043E\u0440\u044F\u0449\u0438\u0445 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u043E\u0432" })) : (burningDeadlines.map((a) => (_jsx(DeadlineCard, { assignment: a }, a.id)))) })] })] }), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide", children: "\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C" }), _jsxs("span", { className: "text-xs text-surface-400 dark:text-surface-500", children: [completedCount, "/", totalCount] })] }), _jsx(Card, { children: activeTasks.length === 0 ? (_jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 py-4 text-center", children: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447" })) : (activeTasks.map((task) => (_jsx(TaskItem, { task: task, onToggle: handleToggleTask }, task.id)))) })] })] }), _jsxs("div", { className: "md:hidden space-y-6", children: [_jsxs("section", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsxs(Link, { to: "/schedule", className: "text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1", children: ["\u0412\u0441\u0435", _jsx(Icon, { name: "chevron-right", size: 14 })] })] }), _jsx("div", { className: "space-y-3", children: scheduleWithGaps.length === 0 ? (_jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 py-4 text-center", children: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F \u043F\u0430\u0440 \u043D\u0435\u0442" })) : (scheduleWithGaps.map((item, idx) => item.type === 'entry' ? (_jsx(ScheduleCard, { entry: item.entry }, item.entry.id)) : (_jsx(WindowGap, { minutes: item.minutes }, `gap-m-${idx}`)))) })] }), _jsxs("section", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide", children: "\u0413\u043E\u0440\u044F\u0449\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u044B" }), _jsxs(Link, { to: "/assignments", className: "text-xs text-primary-500 hover:text-primary-600 font-medium flex items-center gap-1", children: ["\u0412\u0441\u0435", _jsx(Icon, { name: "chevron-right", size: 14 })] })] }), _jsx("div", { className: "space-y-3", children: burningDeadlines.length === 0 ? (_jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 py-4 text-center", children: "\u041D\u0435\u0442 \u0433\u043E\u0440\u044F\u0449\u0438\u0445 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u043E\u0432" })) : (burningDeadlines.map((a) => (_jsx(DeadlineCard, { assignment: a }, a.id)))) })] }), _jsx("section", { children: _jsxs(Card, { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h3", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50", children: "\u0412\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u044B\u0445 \u0440\u0430\u0431\u043E\u0442" }), _jsx("span", { className: "text-sm font-medium text-success-500", children: "+5%" })] }), _jsx("div", { className: "flex items-baseline gap-3 mb-3", children: _jsxs("span", { className: "text-2xl font-bold text-surface-900 dark:text-surface-50", children: [completionPercent, "%"] }) }), _jsx(ProgressBar, { value: completionPercent, color: "success" }), _jsxs("div", { className: "text-xs text-surface-400 dark:text-surface-500 mt-2", children: [completedCount, " \u0438\u0437 ", totalCount, " \u0437\u0430\u0434\u0430\u043D\u0438\u0439"] })] }) }), _jsxs("section", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h2", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 uppercase tracking-wide", children: "\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C" }), _jsxs("span", { className: "text-xs text-surface-400 dark:text-surface-500", children: [completedCount, "/", totalCount] })] }), _jsx(Card, { children: activeTasks.length === 0 ? (_jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 py-4 text-center", children: "\u041D\u0435\u0442 \u0430\u043A\u0442\u0438\u0432\u043D\u044B\u0445 \u0437\u0430\u0434\u0430\u0447" })) : (activeTasks.map((task) => (_jsx(TaskItem, { task: task, onToggle: handleToggleTask }, task.id)))) })] })] })] }));
}
