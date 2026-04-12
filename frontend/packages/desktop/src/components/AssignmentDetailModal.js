import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useCallback } from 'react';
import clsx from 'clsx';
import { format, formatDistanceToNow, isPast, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Modal, Button, Badge, Avatar, Icon } from './ui';
import { PRIORITY_LABELS, PRIORITY_BADGE_VARIANT, AUTHORS, } from '../types/assignments';
/* ─── Constants ─── */
const STATE_LABELS = {
    todo: 'Нужно сделать',
    doing: 'В работе',
    review: 'На проверке',
    done: 'Зачтено',
};
const MOCK_CHECKLIST = [
    { id: 'cl1', label: 'Прочитать теоретический материал', checked: true },
    { id: 'cl2', label: 'Решить задачи из методички', checked: true },
    { id: 'cl3', label: 'Оформить решение в LaTeX', checked: false },
    { id: 'cl4', label: 'Проверить вычисления', checked: false },
];
const MOCK_ATTACHMENTS = [
    { id: 'f1', name: 'Методичка_ПЗ4.pdf', size: '2.3 МБ', type: 'pdf' },
    { id: 'f2', name: 'Пример_оформления.docx', size: '540 КБ', type: 'doc' },
    { id: 'f3', name: 'Формулы.png', size: '180 КБ', type: 'image' },
];
/* ─── Helpers ─── */
function formatDeadline(deadline) {
    return format(new Date(deadline), 'd MMMM yyyy, HH:mm', { locale: ru });
}
function formatDeadlineShort(deadline) {
    return format(new Date(deadline), 'd MMM yyyy', { locale: ru });
}
function formatCreatedAt(date) {
    return format(new Date(date), 'd MMMM yyyy', { locale: ru });
}
function getRelativeDeadline(deadline) {
    const dl = startOfDay(new Date(deadline));
    if (isPast(dl)) {
        return `Просрочено ${formatDistanceToNow(dl, { locale: ru, addSuffix: true })}`;
    }
    return `Осталось ${formatDistanceToNow(dl, { locale: ru })}`;
}
function isOverdue(deadline) {
    return isPast(startOfDay(new Date(deadline)));
}
function getFileIcon(_type) {
    return 'file';
}
function pluralize(n, forms) {
    const abs = Math.abs(n);
    if (abs % 10 === 1 && abs % 100 !== 11)
        return forms[0];
    if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100))
        return forms[1];
    return forms[2];
}
/* ─── Component ─── */
function AssignmentDetailModal({ task, onClose, onStateChange, onVote, userVote = null, }) {
    const [checklist, setChecklist] = useState(MOCK_CHECKLIST);
    const [isDragOver, setIsDragOver] = useState(false);
    const toggleChecklistItem = useCallback((itemId) => {
        setChecklist((prev) => prev.map((item) => item.id === itemId ? { ...item, checked: !item.checked } : item));
    }, []);
    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    }, []);
    const handleDragLeave = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        // Upload logic will be implemented later
    }, []);
    if (!task)
        return null;
    const { assignment } = task;
    const overdue = isOverdue(assignment.deadline);
    const completedCount = checklist.filter((item) => item.checked).length;
    const totalCount = checklist.length;
    const authorName = AUTHORS[assignment.author_id] ?? 'Неизвестный';
    return (_jsxs(Modal, { open: !!task, onClose: onClose, className: "!max-w-2xl", children: [_jsxs("div", { className: "flex items-start justify-between px-6 pt-5 pb-4 border-b border-surface-200 dark:border-surface-700", children: [_jsxs("div", { className: "flex-1 min-w-0 pr-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("span", { className: "text-sm font-medium text-primary-500 dark:text-primary-400", children: assignment.subject.name }), assignment.is_verified && (_jsxs(Badge, { variant: "verified", size: "sm", children: [_jsx(Icon, { name: "check", size: 10, className: "mr-0.5" }), "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E"] }))] }), _jsx("h2", { className: "text-lg font-semibold text-surface-900 dark:text-surface-50 leading-tight mb-3", children: assignment.title }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg', overdue
                                            ? 'bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400'
                                            : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'), children: [_jsx(Icon, { name: "clock", size: 14 }), _jsx("span", { children: formatDeadlineShort(assignment.deadline) })] }), _jsx(Badge, { variant: PRIORITY_BADGE_VARIANT[assignment.priority], children: PRIORITY_LABELS[assignment.priority] }), _jsx(Badge, { variant: task.state === 'done' ? 'success' : 'default', children: STATE_LABELS[task.state] })] })] }), _jsx("button", { onClick: onClose, className: "btn btn-ghost btn-icon shrink-0 -mt-1 -mr-2", "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(Icon, { name: "x", size: 20 }) })] }), _jsxs("div", { className: "px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto", children: [_jsxs("div", { className: "flex items-center justify-between p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700", children: [_jsx("div", { className: "flex items-center gap-3", children: _jsxs("span", { className: "text-sm text-surface-700 dark:text-surface-300", children: [_jsx("span", { className: "font-semibold text-success-600 dark:text-success-400", children: assignment.votes_up }), ' ', pluralize(assignment.votes_up, ['подтвердил', 'подтвердили', 'подтвердили']), ' / ', _jsx("span", { className: "font-semibold text-danger-600 dark:text-danger-400", children: assignment.votes_down }), ' ', pluralize(assignment.votes_down, ['оспаривает', 'оспаривают', 'оспаривают'])] }) }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("button", { onClick: () => onVote(assignment.id, 1), className: clsx('inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all', userVote === 1
                                            ? 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400 ring-1 ring-success-300 dark:ring-success-500/30'
                                            : 'text-surface-500 hover:text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10 dark:hover:text-success-400'), "aria-label": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C", children: _jsx(Icon, { name: "thumbs-up", size: 16 }) }), _jsx("button", { onClick: () => onVote(assignment.id, -1), className: clsx('inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all', userVote === -1
                                            ? 'bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-400 ring-1 ring-danger-300 dark:ring-danger-500/30'
                                            : 'text-surface-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10 dark:hover:text-danger-400'), "aria-label": "\u041E\u0441\u043F\u043E\u0440\u0438\u0442\u044C", children: _jsx(Icon, { name: "thumbs-down", size: 16 }) })] })] }), _jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsx(Icon, { name: "clock", size: 16, className: clsx(overdue
                                    ? 'text-danger-500'
                                    : 'text-surface-400 dark:text-surface-500') }), _jsxs("span", { className: clsx('font-medium', overdue
                                    ? 'text-danger-600 dark:text-danger-400'
                                    : 'text-surface-700 dark:text-surface-300'), children: [overdue ? 'Просрочено' : 'Дедлайн', ":", ' ', formatDeadline(assignment.deadline)] }), _jsxs("span", { className: "text-xs text-surface-400 dark:text-surface-500", children: ["(", getRelativeDeadline(assignment.deadline), ")"] })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 mb-2", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("p", { className: "text-sm text-surface-600 dark:text-surface-400 leading-relaxed whitespace-pre-wrap", children: assignment.description })] }), assignment.link && (_jsxs("a", { href: assignment.link, target: "_blank", rel: "noopener noreferrer", className: clsx('flex items-center gap-2 px-4 py-3 rounded-xl', 'bg-primary-50 dark:bg-primary-500/10', 'border border-primary-200 dark:border-primary-500/20', 'text-primary-600 dark:text-primary-400', 'hover:bg-primary-100 dark:hover:bg-primary-500/15', 'transition-colors group'), children: [_jsx(Icon, { name: "link", size: 16, className: "shrink-0" }), _jsx("span", { className: "text-sm font-medium truncate flex-1", children: assignment.link }), _jsx(Icon, { name: "chevron-right", size: 16, className: "shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" })] })), _jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-3", children: [_jsx("h3", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50", children: "\u0427\u0435\u043A\u043B\u0438\u0441\u0442" }), _jsxs("span", { className: "text-xs font-medium text-surface-400 dark:text-surface-500", children: [completedCount, "/", totalCount] })] }), _jsx("div", { className: "w-full h-1.5 bg-surface-200 dark:bg-surface-700 rounded-full mb-3 overflow-hidden", children: _jsx("div", { className: "h-full bg-primary-500 rounded-full transition-all duration-300", style: { width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` } }) }), _jsx("div", { className: "space-y-1.5", children: checklist.map((item) => (_jsxs("label", { className: clsx('flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer', 'hover:bg-surface-50 dark:hover:bg-surface-800/50', 'transition-colors'), children: [_jsx("input", { type: "checkbox", checked: item.checked, onChange: () => toggleChecklistItem(item.id), className: clsx('w-4 h-4 rounded border-2 cursor-pointer', 'border-surface-300 dark:border-surface-600', 'text-primary-500 focus:ring-primary-500/20 focus:ring-offset-0', 'dark:bg-surface-700') }), _jsx("span", { className: clsx('text-sm transition-all', item.checked
                                                ? 'text-surface-400 dark:text-surface-500 line-through'
                                                : 'text-surface-700 dark:text-surface-300'), children: item.label })] }, item.id))) })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 mb-3", children: "\u0412\u043B\u043E\u0436\u0435\u043D\u0438\u044F" }), _jsx("div", { className: "space-y-2", children: MOCK_ATTACHMENTS.map((file) => (_jsxs("div", { className: clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg', 'bg-surface-50 dark:bg-surface-800/50', 'border border-surface-200 dark:border-surface-700', 'hover:border-primary-300 dark:hover:border-primary-500/30', 'transition-colors cursor-pointer group'), children: [_jsx("div", { className: "w-8 h-8 rounded-lg bg-primary-100 dark:bg-primary-500/10 flex items-center justify-center shrink-0", children: _jsx(Icon, { name: getFileIcon(file.type), size: 16, className: "text-primary-500 dark:text-primary-400" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-surface-700 dark:text-surface-300 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors", children: file.name }), _jsx("p", { className: "text-xs text-surface-400 dark:text-surface-500", children: file.size })] }), _jsx(Icon, { name: "chevron-right", size: 16, className: "text-surface-300 dark:text-surface-600 group-hover:text-primary-400 transition-colors shrink-0" })] }, file.id))) })] }), _jsxs("div", { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop, className: clsx('relative flex flex-col items-center justify-center gap-3 px-6 py-8', 'rounded-xl border-2 border-dashed transition-all cursor-pointer', isDragOver
                            ? 'border-primary-400 bg-primary-50 dark:border-primary-500 dark:bg-primary-500/10'
                            : 'border-surface-300 dark:border-surface-600 hover:border-primary-300 dark:hover:border-primary-500/40 hover:bg-surface-50 dark:hover:bg-surface-800/30'), children: [_jsx("div", { className: clsx('w-12 h-12 rounded-xl flex items-center justify-center transition-colors', isDragOver
                                    ? 'bg-primary-100 dark:bg-primary-500/20'
                                    : 'bg-surface-100 dark:bg-surface-800'), children: _jsx(Icon, { name: "upload", size: 24, className: clsx('transition-colors', isDragOver
                                        ? 'text-primary-500'
                                        : 'text-surface-400 dark:text-surface-500') }) }), _jsxs("div", { className: "text-center", children: [_jsx("p", { className: clsx('text-sm font-medium transition-colors', isDragOver
                                            ? 'text-primary-600 dark:text-primary-400'
                                            : 'text-surface-600 dark:text-surface-400'), children: "\u041F\u0435\u0440\u0435\u0442\u0430\u0449\u0438 \u0432\u044B\u043F\u043E\u043B\u043D\u0435\u043D\u043D\u0443\u044E \u0440\u0430\u0431\u043E\u0442\u0443" }), _jsx("p", { className: "text-xs text-surface-400 dark:text-surface-500 mt-1", children: "PDF, DOCX, PNG, ZIP \u0434\u043E 50 \u041C\u0411" })] })] }), _jsxs("div", { className: "flex items-center gap-3 pt-2 border-t border-surface-200 dark:border-surface-700", children: [_jsx(Avatar, { name: authorName, size: "sm" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-surface-700 dark:text-surface-300", children: authorName }), _jsxs("p", { className: "text-xs text-surface-400 dark:text-surface-500", children: ["\u0421\u043E\u0437\u0434\u0430\u043D\u043E ", formatCreatedAt(assignment.created_at)] })] })] })] }), _jsxs("div", { className: "flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-200 dark:border-surface-700", children: [task.state === 'todo' && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { variant: "primary", size: "sm", icon: _jsx(Icon, { name: "chevron-right", size: 16 }), onClick: () => onStateChange(task.id, 'review'), children: "\u0421\u0434\u0430\u043B" })] })), task.state === 'doing' && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { variant: "primary", size: "sm", icon: _jsx(Icon, { name: "chevron-right", size: 16 }), onClick: () => onStateChange(task.id, 'review'), children: "\u0421\u0434\u0430\u043B" })] })), task.state === 'review' && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "danger", size: "sm", icon: _jsx(Icon, { name: "x", size: 16 }), onClick: () => onStateChange(task.id, 'todo'), children: "\u041D\u0435 \u0441\u0434\u0430\u043B" }), _jsx(Button, { variant: "success", size: "sm", icon: _jsx(Icon, { name: "check", size: 16 }), onClick: () => onStateChange(task.id, 'done'), children: "\u0417\u0430\u0447\u0442\u0435\u043D\u043E" })] })), task.state === 'done' && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(Icon, { name: "chevron-left", size: 16 }), onClick: () => onStateChange(task.id, 'todo'), children: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0443" }), _jsx(Button, { variant: "secondary", size: "sm", onClick: onClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }))] })] }));
}
export { AssignmentDetailModal };
