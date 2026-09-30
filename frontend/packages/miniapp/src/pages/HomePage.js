import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCurrentUser, useTodaySchedule, useTasks, useGroupContext } from '@nexora/shared';
import { useTelegramWebApp } from '../telegram/useTelegramWebApp';
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12)
        return 'Доброе утро';
    if (hour < 18)
        return 'Добрый день';
    return 'Добрый вечер';
}
function formatTime(timeStr) {
    return timeStr.slice(0, 5);
}
function formatDeadline(deadline) {
    return new Date(deadline).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
    });
}
function getPairCountText(n) {
    if (n === 0)
        return 'Сегодня пар нет';
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
function ScheduleCard({ entry }) {
    const isOnline = entry.lesson_type === 'онлайн' || entry.lesson_type === 'вебинар';
    const location = isOnline
        ? entry.lesson_type
        : [entry.room, entry.location].filter(Boolean).join(', ') || 'Аудитория не указана';
    return (_jsxs("div", { style: {
            background: 'var(--tg-theme-secondary-bg-color)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 8,
            display: 'flex',
            gap: 12,
            alignItems: 'flex-start',
        }, children: [_jsx("div", { style: {
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: 'var(--tg-theme-bg-color)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                }, children: _jsx("span", { style: { fontSize: 16 }, children: isOnline ? '▶' : '●' }) }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: {
                            fontWeight: 500,
                            fontSize: 15,
                            color: 'var(--tg-theme-text-color)',
                            marginBottom: 2,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }, children: entry.subject.name }), _jsxs("div", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 13, marginBottom: 2 }, children: [formatTime(entry.start_time), " \u2013 ", formatTime(entry.end_time)] }), _jsx("div", { style: { color: 'var(--tg-theme-link-color)', fontSize: 13 }, children: location })] })] }));
}
function ScheduleSkeleton() {
    return (_jsx(_Fragment, { children: [1, 2].map((i) => (_jsxs("div", { style: {
                background: 'var(--tg-theme-secondary-bg-color)',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 8,
                opacity: 0.5,
            }, children: [_jsx("div", { style: { height: 15, background: 'var(--tg-theme-hint-color)', borderRadius: 4, width: '60%', marginBottom: 6 } }), _jsx("div", { style: { height: 12, background: 'var(--tg-theme-hint-color)', borderRadius: 4, width: '35%' } })] }, i))) }));
}
export function HomePage() {
    const { webApp } = useTelegramWebApp();
    const { groupId, groupCode } = useGroupContext();
    const { data: user } = useCurrentUser();
    const { data: schedule, isLoading: scheduleLoading } = useTodaySchedule(groupCode ?? undefined);
    const { data: tasks } = useTasks({ group_id: groupId ?? '' });
    const greeting = getGreeting();
    // Prefer API display_name, fall back to Telegram first name
    const tgUser = webApp?.initDataUnsafe.user;
    const userName = user?.display_name?.split(' ')[0] || tgUser?.first_name || 'Студент';
    const entries = schedule?.entries ?? [];
    const pairCount = entries.length;
    // Burning deadlines: tasks not done, sorted by deadline
    const burningDeadlines = (tasks ?? [])
        .filter((t) => t.state !== 'done')
        .map((t) => t.assignment)
        .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
        .slice(0, 3);
    return (_jsxs("div", { style: { padding: '16px 12px' }, children: [_jsxs("h1", { style: { fontSize: 20, fontWeight: 600, color: 'var(--tg-theme-text-color)', marginBottom: 4 }, children: [greeting, ", ", userName, "!"] }), _jsx("p", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 14, marginBottom: 24 }, children: getPairCountText(pairCount) }), _jsxs("section", { style: { marginBottom: 24 }, children: [_jsx("h2", { style: {
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--tg-theme-hint-color)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: 10,
                        }, children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), scheduleLoading && _jsx(ScheduleSkeleton, {}), !scheduleLoading && entries.length === 0 && (_jsx("p", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 14, textAlign: 'center', padding: '12px 0' }, children: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F \u043F\u0430\u0440 \u043D\u0435\u0442" })), entries.map((entry) => (_jsx(ScheduleCard, { entry: entry }, entry.id)))] }), burningDeadlines.length > 0 && (_jsxs("section", { children: [_jsx("h2", { style: {
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--tg-theme-hint-color)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: 10,
                        }, children: "\u0413\u043E\u0440\u044F\u0449\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u044B" }), _jsx("div", { children: burningDeadlines.map((assignment) => (_jsx("div", { style: {
                                background: 'var(--tg-theme-secondary-bg-color)',
                                borderRadius: 12,
                                padding: '12px 14px',
                                marginBottom: 8,
                            }, children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }, children: [_jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("div", { style: {
                                                    fontWeight: 500,
                                                    fontSize: 15,
                                                    color: 'var(--tg-theme-text-color)',
                                                    marginBottom: 2,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }, children: assignment.title }), _jsx("div", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 13 }, children: assignment.subject.name })] }), _jsx("div", { style: { flexShrink: 0, marginLeft: 8 }, children: _jsxs("span", { style: {
                                                fontSize: 12,
                                                color: assignment.priority === 'urgent'
                                                    ? '#ef4444'
                                                    : assignment.priority === 'high'
                                                        ? '#f97316'
                                                        : 'var(--tg-theme-hint-color)',
                                                fontWeight: 500,
                                            }, children: ["\u0434\u043E ", formatDeadline(assignment.deadline)] }) })] }) }, assignment.id))) })] }))] }));
}
