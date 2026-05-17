import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addDays, startOfWeek, isToday, isSameDay, differenceInMinutes, parse, } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useWeekSchedule, useGroupContext, useCreateScheduleOverride, } from '@nexora/shared';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Icon } from '../components/ui/Icon';
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PAIR_TIMES = {
    1: { start: '09:00', end: '10:30' },
    2: { start: '10:40', end: '12:10' },
    3: { start: '12:20', end: '13:50' },
    4: { start: '14:30', end: '16:00' },
    5: { start: '16:10', end: '17:40' },
};
const WEEKDAY_NAMES_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isCancelled(entry) {
    if (entry.lesson_type === 'cancelled')
        return true;
    if (entry.overrides?.some((o) => o.field === 'cancelled' || o.value === 'cancelled'))
        return true;
    return false;
}
function isCustomEvent(entry) {
    return entry.lesson_type === 'custom' || !!entry.subject.is_custom;
}
function getClassType(entry) {
    if (isCustomEvent(entry))
        return 'custom';
    const loc = (entry.location ?? '').toLowerCase();
    const room = (entry.room ?? '').toLowerCase();
    if (loc.includes('webinar') || loc.includes('вебинар') || room === 'вебинар')
        return 'webinar';
    if (loc.startsWith('http') ||
        loc.includes('meet') ||
        loc.includes('сдо') ||
        loc.includes('lms') ||
        loc.includes('онлайн') ||
        room === 'онлайн')
        return 'online';
    return 'offline';
}
const classTypeConfig = {
    offline: {
        icon: 'map-pin',
        label: 'Очно',
        bg: 'bg-surface-100 dark:bg-surface-700',
        text: 'text-surface-500 dark:text-surface-400',
    },
    online: {
        icon: 'play',
        label: 'Онлайн',
        bg: 'bg-green-100 dark:bg-green-900/30',
        text: 'text-green-600 dark:text-green-400',
    },
    webinar: {
        icon: 'video',
        label: 'Вебинар',
        bg: 'bg-blue-100 dark:bg-blue-900/30',
        text: 'text-blue-600 dark:text-blue-400',
    },
    custom: {
        icon: 'plus-circle',
        label: 'Своё',
        bg: 'bg-violet-100 dark:bg-violet-900/30',
        text: 'text-violet-600 dark:text-violet-400',
    },
};
const lessonTypeLabels = {
    лекция: 'Лекция',
    практика: 'Практика',
    лаб: 'Лаб. работа',
    custom: 'Своё занятие',
};
function parseTimeFlexible(t) {
    const fmt = t.length > 5 ? 'HH:mm:ss' : 'HH:mm';
    return parse(t, fmt, new Date());
}
function formatTimeDisplay(t) {
    if (!t)
        return '';
    return t.length > 5 ? t.slice(0, 5) : t;
}
function formatGap(entry1, entry2) {
    const end = parseTimeFlexible(entry1.end_time);
    const start = parseTimeFlexible(entry2.start_time);
    const mins = differenceInMinutes(start, end);
    if (mins <= 10)
        return null;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    if (hours > 0 && remainMins > 0)
        return `Окно ${hours}ч ${remainMins}мин`;
    if (hours > 0)
        return `Окно ${hours}ч`;
    return `Окно ${remainMins}мин`;
}
function useIsMobile() {
    const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth < 768 : false);
    useEffect(() => {
        function handleResize() {
            setIsMobile(window.innerWidth < 768);
        }
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return isMobile;
}
function AddEventModal({ date, onClose, anchorEntryId }) {
    const createOverride = useCreateScheduleOverride();
    const [subject, setSubject] = useState('');
    const [startTime, setStartTime] = useState('09:00');
    const [endTime, setEndTime] = useState('10:30');
    const [location, setLocation] = useState('');
    const [teacher, setTeacher] = useState('');
    const [lessonType, setLessonType] = useState('');
    const [scope, setScope] = useState('personal');
    const backdropRef = useRef(null);
    function handleBackdropClick(e) {
        if (e.target === backdropRef.current)
            onClose();
    }
    async function handleSubmit(e) {
        e.preventDefault();
        if (!subject.trim())
            return;
        const payload = {
            subject: subject.trim(),
            start_time: startTime,
            end_time: endTime,
            ...(location ? { location } : {}),
            ...(teacher ? { teacher } : {}),
            ...(lessonType ? { lesson_type: lessonType } : {}),
        };
        await createOverride.mutateAsync({
            entry_id: anchorEntryId,
            scope,
            override_type: 'add',
            value: JSON.stringify(payload),
            target_date: date,
        });
        onClose();
    }
    return (_jsx("div", { ref: backdropRef, className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm", onClick: handleBackdropClick, children: _jsxs("div", { className: "w-full max-w-md mx-4 bg-white dark:bg-surface-900 rounded-2xl shadow-2xl overflow-hidden", children: [_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-surface-100 dark:border-surface-800", children: [_jsx("h2", { className: "text-base font-semibold text-surface-900 dark:text-surface-50", children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043D\u044F\u0442\u0438\u0435" }), _jsx("button", { onClick: onClose, className: "text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 transition-colors", children: _jsx(Icon, { name: "x", size: 18 }) })] }), _jsxs("form", { onSubmit: handleSubmit, className: "px-6 py-4 space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1", children: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 *" }), _jsx("input", { type: "text", value: subject, onChange: (e) => setSubject(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u0414\u043E\u043F\u043E\u043B\u043D\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u0437\u0430\u043D\u044F\u0442\u0438\u0435", required: true, className: "w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40" })] }), _jsxs("div", { className: "grid grid-cols-2 gap-3", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1", children: "\u041D\u0430\u0447\u0430\u043B\u043E" }), _jsxs("select", { value: startTime, onChange: (e) => setStartTime(e.target.value), className: "w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40", children: [Object.values(PAIR_TIMES).map((t) => (_jsx("option", { value: t.start, children: t.start }, t.start))), _jsx("option", { value: "custom", children: "\u0414\u0440\u0443\u0433\u043E\u0435" })] }), startTime === 'custom' && (_jsx("input", { type: "time", className: "mt-1 w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40", onChange: (e) => setStartTime(e.target.value) }))] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1", children: "\u041A\u043E\u043D\u0435\u0446" }), _jsxs("select", { value: endTime, onChange: (e) => setEndTime(e.target.value), className: "w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40", children: [Object.values(PAIR_TIMES).map((t) => (_jsx("option", { value: t.end, children: t.end }, t.end))), _jsx("option", { value: "custom", children: "\u0414\u0440\u0443\u0433\u043E\u0435" })] }), endTime === 'custom' && (_jsx("input", { type: "time", className: "mt-1 w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40", onChange: (e) => setEndTime(e.target.value) }))] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1", children: "\u041C\u0435\u0441\u0442\u043E / \u0441\u0441\u044B\u043B\u043A\u0430" }), _jsx("input", { type: "text", value: location, onChange: (e) => setLocation(e.target.value), placeholder: "\u0410\u0443\u0434\u0438\u0442\u043E\u0440\u0438\u044F \u0438\u043B\u0438 URL", className: "w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1", children: "\u041F\u0440\u0435\u043F\u043E\u0434\u0430\u0432\u0430\u0442\u0435\u043B\u044C" }), _jsx("input", { type: "text", value: teacher, onChange: (e) => setTeacher(e.target.value), placeholder: "\u0424\u0430\u043C\u0438\u043B\u0438\u044F \u0418.\u041E.", className: "w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-surface-500 dark:text-surface-400 mb-1", children: "\u0422\u0438\u043F \u0437\u0430\u043D\u044F\u0442\u0438\u044F" }), _jsxs("select", { value: lessonType, onChange: (e) => setLessonType(e.target.value), className: "w-full px-3 py-2 text-sm bg-surface-50 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-surface-900 dark:text-surface-50 focus:outline-none focus:ring-2 focus:ring-primary-500/40", children: [_jsx("option", { value: "", children: "\u2014 \u043D\u0435 \u0443\u043A\u0430\u0437\u0430\u043D \u2014" }), _jsx("option", { value: "\u043B\u0435\u043A\u0446\u0438\u044F", children: "\u041B\u0435\u043A\u0446\u0438\u044F" }), _jsx("option", { value: "\u043F\u0440\u0430\u043A\u0442\u0438\u043A\u0430", children: "\u041F\u0440\u0430\u043A\u0442\u0438\u043A\u0430" }), _jsx("option", { value: "\u043B\u0430\u0431", children: "\u041B\u0430\u0431. \u0440\u0430\u0431\u043E\u0442\u0430" })] })] }), _jsxs("div", { className: "flex items-center gap-2 p-3 bg-surface-50 dark:bg-surface-800 rounded-xl", children: [_jsx("button", { type: "button", onClick: () => setScope('personal'), className: `flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${scope === 'personal'
                                        ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-50 shadow-sm'
                                        : 'text-surface-500 dark:text-surface-400'}`, children: "\u0422\u043E\u043B\u044C\u043A\u043E \u0434\u043B\u044F \u043C\u0435\u043D\u044F" }), _jsx("button", { type: "button", onClick: () => setScope('group'), className: `flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${scope === 'group'
                                        ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-50 shadow-sm'
                                        : 'text-surface-500 dark:text-surface-400'}`, children: "\u0414\u043B\u044F \u0433\u0440\u0443\u043F\u043F\u044B" })] }), _jsxs("div", { className: "flex gap-2 pt-2", children: [_jsx(Button, { type: "button", variant: "ghost", size: "sm", className: "flex-1", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { type: "submit", variant: "primary", size: "sm", className: "flex-1", disabled: createOverride.isPending || !subject.trim(), children: createOverride.isPending ? 'Добавление...' : 'Добавить' })] })] })] }) }));
}
// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function ClassTypeIcon({ type, size = 20, }) {
    const config = classTypeConfig[type];
    return (_jsx("div", { className: `flex items-center justify-center rounded-lg shrink-0 ${config.bg} ${config.text}`, style: { width: size + 16, height: size + 16 }, children: _jsx(Icon, { name: config.icon, size: size }) }));
}
// ---------------------------------------------------------------------------
// Daily class card (large, detailed)
// ---------------------------------------------------------------------------
function DailyClassCard({ entry, targetDate, anchorEntryId, }) {
    const [hovered, setHovered] = useState(false);
    const skipOverride = useCreateScheduleOverride();
    const createOverride = useCreateScheduleOverride();
    const type = getClassType(entry);
    const config = classTypeConfig[type];
    const isOnline = type === 'online' || type === 'webinar';
    const cancelled = isCancelled(entry);
    const custom = isCustomEvent(entry);
    async function handleSkip() {
        await skipOverride.mutateAsync({
            entry_id: entry.id,
            scope: 'personal',
            override_type: 'skip',
            target_date: targetDate,
        });
    }
    async function handleShare() {
        // Re-create the same entry as group-scope ADD override
        // Build payload from entry fields
        const payload = {
            subject: entry.subject.name,
            short_name: entry.subject.short_name ?? undefined,
            start_time: entry.start_time,
            end_time: entry.end_time,
            location: entry.location ?? undefined,
            room: entry.room ?? undefined,
            teacher: entry.teacher ?? undefined,
            lesson_type: entry.lesson_type ?? undefined,
        };
        await createOverride.mutateAsync({
            entry_id: anchorEntryId,
            scope: 'group',
            override_type: 'add',
            value: JSON.stringify(payload),
            target_date: targetDate,
        });
    }
    return (_jsxs(Card, { className: `overflow-hidden relative group${cancelled ? ' opacity-50' : ''}`, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), children: [!custom && hovered && !cancelled && (_jsxs("button", { onClick: handleSkip, disabled: skipOverride.isPending, title: "\u0421\u043A\u0440\u044B\u0442\u044C \u0437\u0430\u043D\u044F\u0442\u0438\u0435", className: "absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400 transition-colors", children: [_jsx(Icon, { name: "x", size: 12 }), "\u0421\u043A\u0440\u044B\u0442\u044C"] })), _jsxs("div", { className: "flex items-start gap-3 p-4", children: [_jsx(ClassTypeIcon, { type: type, size: 20 }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("span", { className: `font-medium text-surface-900 dark:text-surface-50 truncate${cancelled ? ' line-through' : ''}`, children: entry.subject.name }), cancelled && (_jsx("span", { className: "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400", children: "\u041E\u0422\u041C\u0415\u041D\u0415\u041D\u0410" })), custom && (_jsx("span", { className: "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400", children: "\u041C\u041E\u0401" }))] }), _jsxs("div", { className: "flex items-center gap-2 text-sm text-surface-500 dark:text-surface-400", children: [_jsx(Icon, { name: "clock", size: 14 }), _jsxs("span", { children: [formatTimeDisplay(entry.start_time), " \u2013 ", formatTimeDisplay(entry.end_time)] }), _jsx(Badge, { size: "sm", variant: "default", children: entry.lesson_type ? (lessonTypeLabels[entry.lesson_type] ?? entry.lesson_type) : 'Занятие' })] }), (entry.room || entry.location) && (_jsxs("div", { className: "flex items-center gap-2 mt-2 text-sm", children: [_jsx(Icon, { name: "map-pin", size: 14, className: config.text }), isOnline && entry.location ? (_jsx("a", { href: entry.location, target: "_blank", rel: "noopener noreferrer", className: "text-primary-500 hover:underline truncate", children: entry.room === 'Вебинар' ? 'Ссылка на вебинар' : 'Ссылка на занятие' })) : (_jsx("span", { className: "text-surface-600 dark:text-surface-300 truncate", children: [entry.room, entry.location].filter(Boolean).join(', ') }))] })), entry.teacher && (_jsxs("div", { className: "flex items-center gap-2 mt-2 text-sm text-surface-500 dark:text-surface-400", children: [_jsx("div", { className: "w-5 h-5 rounded-full bg-surface-200 dark:bg-surface-600 shrink-0" }), _jsx("span", { className: "truncate", children: entry.teacher })] })), _jsxs("div", { className: "flex items-center gap-2 mt-3 flex-wrap", children: [isOnline && entry.location && (_jsx(Button, { variant: "success", size: "sm", icon: _jsx(Icon, { name: "play", size: 14 }), onClick: () => entry.location && window.open(entry.location, '_blank'), children: "\u041F\u041E\u0414\u041A\u041B\u042E\u0427\u0418\u0422\u042C\u0421\u042F" })), custom && (_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(Icon, { name: "share-2", size: 14 }), disabled: createOverride.isPending, onClick: handleShare, children: "\u041F\u043E\u0434\u0435\u043B\u0438\u0442\u044C\u0441\u044F \u0441 \u0433\u0440\u0443\u043F\u043F\u043E\u0439" }))] })] })] })] }));
}
// ---------------------------------------------------------------------------
// Gap indicator
// ---------------------------------------------------------------------------
function GapIndicator({ label }) {
    return (_jsxs("div", { className: "flex items-center gap-3 py-2 px-1", children: [_jsx("div", { className: "h-px flex-1 bg-surface-200 dark:bg-surface-700" }), _jsx("span", { className: "text-xs font-medium text-surface-400 dark:text-surface-500 whitespace-nowrap", children: label }), _jsx("div", { className: "h-px flex-1 bg-surface-200 dark:bg-surface-700" })] }));
}
// ---------------------------------------------------------------------------
// Weekly grid cell (compact)
// ---------------------------------------------------------------------------
function WeeklyClassCell({ entry, targetDate, anchorEntryId, }) {
    const [hovered, setHovered] = useState(false);
    const skipOverride = useCreateScheduleOverride();
    const type = getClassType(entry);
    const config = classTypeConfig[type];
    const isOnline = type === 'online' || type === 'webinar';
    const cancelled = isCancelled(entry);
    const custom = isCustomEvent(entry);
    async function handleSkip(e) {
        e.stopPropagation();
        await skipOverride.mutateAsync({
            entry_id: entry.id,
            scope: 'personal',
            override_type: 'skip',
            target_date: targetDate,
        });
    }
    // suppress unused warning
    void anchorEntryId;
    return (_jsxs("div", { className: `card p-2.5 text-xs h-full flex flex-col overflow-hidden relative${cancelled ? ' opacity-50' : ''}`, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false), children: [hovered && !cancelled && !custom && (_jsx("button", { onClick: handleSkip, disabled: skipOverride.isPending, title: "\u0421\u043A\u0440\u044B\u0442\u044C", className: "absolute top-1 right-1 z-10 w-5 h-5 flex items-center justify-center rounded bg-surface-200 dark:bg-surface-600 text-surface-500 dark:text-surface-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/40 dark:hover:text-red-400 transition-colors", children: _jsx(Icon, { name: "x", size: 10 }) })), _jsxs("div", { className: "flex items-center gap-1.5 mb-1", children: [_jsx("div", { className: `w-5 h-5 rounded flex items-center justify-center shrink-0 ${config.bg} ${config.text}`, children: _jsx(Icon, { name: config.icon, size: 12 }) }), _jsx("span", { className: `font-medium text-surface-900 dark:text-surface-50 truncate leading-tight${cancelled ? ' line-through' : ''}`, children: entry.subject.short_name ?? entry.subject.name }), cancelled && (_jsx("span", { className: "shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400", children: "\u041E\u0422\u041C" })), custom && (_jsx("span", { className: "shrink-0 text-[9px] font-semibold px-1 py-0.5 rounded bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400", children: "\u041C\u041E\u0401" }))] }), _jsx("div", { className: "text-surface-500 dark:text-surface-400 truncate", children: entry.lesson_type ? (lessonTypeLabels[entry.lesson_type] ?? entry.lesson_type) : 'Занятие' }), _jsxs("div", { className: "mt-auto pt-1", children: [isOnline ? (_jsx("span", { className: "text-primary-500 truncate block", children: config.label })) : (_jsx("span", { className: "text-surface-500 dark:text-surface-400 truncate block", children: entry.room })), _jsx("div", { className: "text-surface-400 dark:text-surface-500 truncate mt-0.5", title: entry.teacher ?? '', children: entry.teacher?.split(',')[0] })] })] }));
}
// ---------------------------------------------------------------------------
// Daily view
// ---------------------------------------------------------------------------
function DailyView({ dayOffset, onPrev, onNext, onToday, weekData, }) {
    const targetDate = addDays(new Date(), dayOffset);
    const targetDateStr = format(targetDate, 'yyyy-MM-dd');
    const [showAddModal, setShowAddModal] = useState(false);
    const daySchedule = useMemo(() => {
        return weekData.find((d) => isSameDay(parse(d.schedule_date, 'yyyy-MM-dd', new Date()), targetDate));
    }, [weekData, targetDate]);
    const dateLabel = format(targetDate, 'd MMMM, EEEE', { locale: ru });
    const entries = daySchedule?.entries ?? [];
    const sorted = [...entries].sort((a, b) => a.pair_number - b.pair_number);
    // First entry id as anchor for ADD overrides; fall back to a sentinel (won't be used)
    const anchorEntryId = useMemo(() => sorted.find((e) => !isCustomEvent(e))?.id ?? '', [sorted]);
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold text-surface-900 dark:text-surface-50", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400 mt-1 capitalize", children: dateLabel })] }), dayOffset !== 0 && (_jsx(Button, { variant: "ghost", size: "sm", onClick: onToday, children: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F" }))] }), _jsxs("div", { className: "flex items-center gap-2 mb-5", children: [_jsx(Button, { variant: "ghost", size: "sm", iconOnly: true, icon: _jsx(Icon, { name: "chevron-left", size: 18 }), onClick: onPrev }), _jsx("span", { className: "text-sm font-medium text-surface-700 dark:text-surface-200 min-w-[120px] text-center capitalize", children: format(targetDate, 'EEEE', { locale: ru }) }), _jsx(Button, { variant: "ghost", size: "sm", iconOnly: true, icon: _jsx(Icon, { name: "chevron-right", size: 18 }), onClick: onNext })] }), sorted.length === 0 ? (_jsxs(Card, { className: "p-8 text-center", children: [_jsx("div", { className: "text-surface-400 dark:text-surface-500 mb-2", children: _jsx(Icon, { name: "calendar", size: 40, className: "mx-auto" }) }), _jsx("p", { className: "text-surface-500 dark:text-surface-400 font-medium", children: "\u041D\u0435\u0442 \u0437\u0430\u043D\u044F\u0442\u0438\u0439" }), _jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 mt-1", children: isToday(targetDate) ? 'Сегодня выходной!' : 'В этот день занятий нет' })] })) : (_jsx("div", { className: "space-y-1", children: sorted.map((entry, idx) => (_jsxs("div", { children: [idx > 0 && (() => {
                            const gap = formatGap(sorted[idx - 1], entry);
                            return gap ? _jsx(GapIndicator, { label: gap }) : null;
                        })(), _jsx(DailyClassCard, { entry: entry, targetDate: targetDateStr, anchorEntryId: anchorEntryId || entry.id })] }, entry.id))) })), anchorEntryId && (_jsx("div", { className: "mt-4 flex justify-center", children: _jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(Icon, { name: "plus", size: 16 }), onClick: () => setShowAddModal(true), children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043D\u044F\u0442\u0438\u0435" }) })), showAddModal && anchorEntryId && (_jsx(AddEventModal, { date: targetDateStr, anchorEntryId: anchorEntryId, onClose: () => setShowAddModal(false) }))] }));
}
// ---------------------------------------------------------------------------
// Weekly view
// ---------------------------------------------------------------------------
function getISOWeek(date) {
    const tmp = new Date(date.valueOf());
    tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    return Math.ceil(((tmp.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7);
}
function getWeekParity(weekOffset) {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const targetWeekStart = addDays(currentWeekStart, weekOffset * 7);
    return getISOWeek(targetWeekStart) % 2 === 0 ? 'Знаменатель' : 'Числитель';
}
function WeeklyView({ weekOffset, onPrevWeek, onNextWeek, onToday, weekData, }) {
    const today = new Date();
    const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
    const targetWeekStart = addDays(currentWeekStart, weekOffset * 7);
    const targetWeekEnd = addDays(targetWeekStart, 5);
    const weekLabel = `${format(targetWeekStart, 'd', { locale: ru })}–${format(targetWeekEnd, 'd MMMM', { locale: ru })}`;
    const weekParity = getWeekParity(weekOffset);
    const pairNumbers = [1, 2, 3, 4, 5];
    // State for "add event" modal per day column
    const [addModalForDate, setAddModalForDate] = useState(null);
    const [addModalAnchorId, setAddModalAnchorId] = useState('');
    function openAddModal(dateStr, dayEntries) {
        const anchor = dayEntries.find((e) => !isCustomEvent(e))?.id ?? '';
        if (!anchor)
            return;
        setAddModalAnchorId(anchor);
        setAddModalForDate(dateStr);
    }
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-6", children: [_jsx("h1", { className: "text-2xl font-semibold text-surface-900 dark:text-surface-50", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsxs("div", { className: "flex items-center gap-2", children: [weekOffset !== 0 && (_jsx(Button, { variant: "ghost", size: "sm", onClick: onToday, children: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F" })), _jsx(Button, { variant: "ghost", size: "sm", iconOnly: true, icon: _jsx(Icon, { name: "chevron-left", size: 18 }), onClick: onPrevWeek }), _jsx("span", { className: "text-sm font-medium text-surface-700 dark:text-surface-200 min-w-[160px] text-center", children: weekLabel }), _jsx(Button, { variant: "ghost", size: "sm", iconOnly: true, icon: _jsx(Icon, { name: "chevron-right", size: 18 }), onClick: onNextWeek }), _jsx(Badge, { size: "sm", variant: weekParity === 'Числитель' ? 'success' : 'default', className: "ml-1 shrink-0", children: weekParity })] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full border-collapse min-w-[800px] table-fixed", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { className: "w-[80px] p-2 text-xs font-medium text-surface-400 dark:text-surface-500 text-left", children: "\u0412\u0440\u0435\u043C\u044F" }), weekData.map((day, idx) => {
                                        const date = parse(day.schedule_date, 'yyyy-MM-dd', new Date());
                                        const current = isToday(date);
                                        return (_jsxs("th", { className: `p-2 text-center ${current
                                                ? 'bg-primary-50 dark:bg-primary-900/20 rounded-t-lg'
                                                : ''}`, children: [_jsx("div", { className: `text-xs font-medium ${current
                                                        ? 'text-primary-600 dark:text-primary-400'
                                                        : 'text-surface-400 dark:text-surface-500'}`, children: WEEKDAY_NAMES_SHORT[idx] }), _jsx("div", { className: `text-sm font-semibold mt-0.5 ${current
                                                        ? 'text-primary-600 dark:text-primary-400'
                                                        : 'text-surface-700 dark:text-surface-200'}`, children: format(date, 'd') })] }, day.schedule_date));
                                    })] }) }), _jsxs("tbody", { children: [pairNumbers.map((pn) => (_jsxs("tr", { className: "border-t border-surface-100 dark:border-surface-800", children: [_jsxs("td", { className: "p-2 align-top", children: [_jsx("div", { className: "text-xs font-medium text-surface-500 dark:text-surface-400", children: PAIR_TIMES[pn].start }), _jsx("div", { className: "text-xs text-surface-400 dark:text-surface-500", children: PAIR_TIMES[pn].end })] }), weekData.map((day) => {
                                            const date = parse(day.schedule_date, 'yyyy-MM-dd', new Date());
                                            const current = isToday(date);
                                            const entry = day.entries.find((e) => e.pair_number === pn);
                                            const anchorId = day.entries.find((e) => !isCustomEvent(e))?.id ?? '';
                                            return (_jsx("td", { className: `p-1 align-top h-[90px] ${current
                                                    ? 'bg-primary-50/50 dark:bg-primary-900/10'
                                                    : ''}`, children: entry ? (_jsx(WeeklyClassCell, { entry: entry, targetDate: day.schedule_date, anchorEntryId: anchorId })) : null }, `${day.schedule_date}-${pn}`));
                                        })] }, pn))), _jsxs("tr", { className: "border-t border-surface-100 dark:border-surface-800", children: [_jsx("td", { className: "p-2" }), weekData.map((day) => {
                                            const anchorExists = day.entries.some((e) => !isCustomEvent(e));
                                            return (_jsx("td", { className: "p-1", children: anchorExists && (_jsxs("button", { onClick: () => openAddModal(day.schedule_date, day.entries), title: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C \u0437\u0430\u043D\u044F\u0442\u0438\u0435", className: "w-full py-1 rounded-lg text-xs text-surface-400 dark:text-surface-600 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center justify-center gap-1", children: [_jsx(Icon, { name: "plus", size: 12 }), _jsx("span", { children: "\u0414\u043E\u0431\u0430\u0432\u0438\u0442\u044C" })] })) }, `add-${day.schedule_date}`));
                                        })] })] })] }) }), addModalForDate && addModalAnchorId && (_jsx(AddEventModal, { date: addModalForDate, anchorEntryId: addModalAnchorId, onClose: () => setAddModalForDate(null) }))] }));
}
// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export function SchedulePage() {
    const isMobile = useIsMobile();
    const [viewMode, setViewMode] = useState(isMobile ? 'daily' : 'weekly');
    const [dayOffset, setDayOffset] = useState(0);
    const [weekOffset, setWeekOffset] = useState(0);
    // Sync view mode when screen size changes
    useEffect(() => {
        setViewMode(isMobile ? 'daily' : 'weekly');
    }, [isMobile]);
    const { groupCode } = useGroupContext();
    const weekScheduleQuery = useWeekSchedule(groupCode ?? undefined, weekOffset);
    const weekData = useMemo(() => {
        return weekScheduleQuery.data ?? [];
    }, [weekScheduleQuery.data]);
    const isLoading = weekScheduleQuery.isLoading;
    return (_jsxs("div", { children: [!isMobile && (_jsxs("div", { className: "flex items-center gap-1 mb-4", children: [_jsx(Button, { variant: viewMode === 'weekly' ? 'secondary' : 'ghost', size: "sm", onClick: () => setViewMode('weekly'), icon: _jsx(Icon, { name: "calendar", size: 16 }), children: "\u041D\u0435\u0434\u0435\u043B\u044F" }), _jsx(Button, { variant: viewMode === 'daily' ? 'secondary' : 'ghost', size: "sm", onClick: () => setViewMode('daily'), icon: _jsx(Icon, { name: "clock", size: 16 }), children: "\u0414\u0435\u043D\u044C" })] })), !groupCode ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-20", children: [_jsx("p", { className: "text-surface-500 dark:text-surface-400 font-medium", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u043D\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E" }), _jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 mt-1", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u0433\u0440\u0443\u043F\u043F\u0443 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445, \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" })] })) : isLoading ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-20", children: [_jsx("div", { className: "w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" }), _jsx("p", { className: "mt-4 text-sm text-surface-500 dark:text-surface-400", children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u044F..." })] })) : viewMode === 'daily' ? (_jsx(DailyView, { dayOffset: dayOffset, onPrev: () => setDayOffset((d) => d - 1), onNext: () => setDayOffset((d) => d + 1), onToday: () => setDayOffset(0), weekData: weekData })) : (_jsx(WeeklyView, { weekOffset: weekOffset, onPrevWeek: () => setWeekOffset((w) => w - 1), onNextWeek: () => setWeekOffset((w) => w + 1), onToday: () => setWeekOffset(0), weekData: weekData }))] }));
}
