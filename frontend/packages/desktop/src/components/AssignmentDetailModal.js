import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import clsx from 'clsx';
import { format, formatDistanceToNow, isPast, startOfDay } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useState, useCallback } from 'react';
import { Modal, Button, Badge, Avatar, Icon, Input, Select } from './ui';
import { useUpdateAssignment, useDeleteAssignment } from '@nexora/shared';
import { PRIORITY_LABELS, PRIORITY_BADGE_VARIANT, AUTHORS, } from '../types/assignments';
/* ─── Constants ─── */
const STATE_LABELS = {
    todo: 'Нужно сделать',
    review: 'На проверке',
    done: 'Зачтено',
};
const PRIORITY_OPTIONS = [
    { value: 'low', label: 'Низкий' },
    { value: 'normal', label: 'Обычный' },
    { value: 'high', label: 'Высокий' },
    { value: 'urgent', label: 'Срочный' },
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
function pluralize(n, forms) {
    const abs = Math.abs(n);
    if (abs % 10 === 1 && abs % 100 !== 11)
        return forms[0];
    if ([2, 3, 4].includes(abs % 10) && ![12, 13, 14].includes(abs % 100))
        return forms[1];
    return forms[2];
}
/** Format ISO datetime → date string for <input type="date"> */
function isoToDateInput(iso) {
    return iso.slice(0, 10);
}
/* ─── Component ─── */
function AssignmentDetailModal({ task, onClose, onStateChange, onVote, userVote = null, }) {
    const updateAssignment = useUpdateAssignment();
    const deleteAssignment = useDeleteAssignment();
    const [editMode, setEditMode] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    // Edit form state — initialised when task changes
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editDeadline, setEditDeadline] = useState('');
    const [editPriority, setEditPriority] = useState('normal');
    const [editLink, setEditLink] = useState('');
    const enterEditMode = useCallback(() => {
        if (!task)
            return;
        const a = task.assignment;
        setEditTitle(a.title);
        setEditDescription(a.description ?? '');
        setEditDeadline(isoToDateInput(a.deadline));
        setEditPriority(a.priority);
        setEditLink(a.link ?? '');
        setEditMode(true);
    }, [task]);
    const cancelEdit = useCallback(() => {
        setEditMode(false);
    }, []);
    const handleSave = useCallback(() => {
        if (!task)
            return;
        updateAssignment.mutate({
            id: task.assignment.id,
            data: {
                title: editTitle.trim(),
                description: editDescription.trim() || undefined,
                deadline: editDeadline ? new Date(editDeadline).toISOString() : undefined,
                priority: editPriority,
                link: editLink.trim() || undefined,
            },
        }, {
            onSuccess: () => {
                setEditMode(false);
            },
        });
    }, [task, updateAssignment, editTitle, editDescription, editDeadline, editPriority, editLink]);
    const handleDelete = useCallback(() => {
        if (!task)
            return;
        deleteAssignment.mutate(task.assignment.id, {
            onSuccess: () => {
                setShowDeleteConfirm(false);
                onClose();
            },
        });
    }, [task, deleteAssignment, onClose]);
    const handleClose = useCallback(() => {
        setEditMode(false);
        setShowDeleteConfirm(false);
        onClose();
    }, [onClose]);
    if (!task)
        return null;
    const { assignment } = task;
    const overdue = isOverdue(assignment.deadline);
    const authorName = AUTHORS[assignment.author_id] ?? 'Неизвестный';
    /* ─── Delete confirm dialog ─── */
    if (showDeleteConfirm) {
        return (_jsxs(Modal, { open: true, onClose: () => setShowDeleteConfirm(false), className: "!max-w-sm", children: [_jsxs("div", { className: "px-6 py-5 text-center space-y-3", children: [_jsx("div", { className: "mx-auto w-12 h-12 rounded-full bg-danger-50 dark:bg-danger-500/10 flex items-center justify-center", children: _jsx(Icon, { name: "trash-2", size: 22, className: "text-danger-500" }) }), _jsx("h3", { className: "text-base font-semibold text-surface-900 dark:text-surface-50", children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u043D\u0438\u0435?" }), _jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400", children: "\u042D\u0442\u043E \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043D\u0435\u043B\u044C\u0437\u044F \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C" })] }), _jsxs("div", { className: "flex items-center justify-end gap-3 px-6 pb-5", children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: () => setShowDeleteConfirm(false), children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { variant: "danger", size: "sm", icon: _jsx(Icon, { name: "trash-2", size: 16 }), onClick: handleDelete, children: deleteAssignment.isPending ? 'Удаление...' : 'Удалить' })] })] }));
    }
    return (_jsxs(Modal, { open: !!task, onClose: handleClose, className: "!max-w-2xl", children: [_jsxs("div", { className: "flex items-start justify-between px-6 pt-5 pb-4 border-b border-surface-200 dark:border-surface-700", children: [_jsxs("div", { className: "flex-1 min-w-0 pr-4", children: [_jsxs("div", { className: "flex items-center gap-2 mb-2", children: [_jsx("span", { className: "text-sm font-medium text-primary-500 dark:text-primary-400", children: assignment.subject.name }), assignment.is_verified && (_jsxs(Badge, { variant: "verified", size: "sm", children: [_jsx(Icon, { name: "check", size: 10, className: "mr-0.5" }), "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E"] }))] }), !editMode && (_jsxs(_Fragment, { children: [_jsx("h2", { className: "text-lg font-semibold text-surface-900 dark:text-surface-50 leading-tight mb-3", children: assignment.title }), _jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsxs("div", { className: clsx('inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg', overdue
                                                    ? 'bg-danger-50 text-danger-600 dark:bg-danger-500/10 dark:text-danger-400'
                                                    : 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300'), children: [_jsx(Icon, { name: "clock", size: 14 }), _jsx("span", { children: formatDeadlineShort(assignment.deadline) })] }), _jsx(Badge, { variant: PRIORITY_BADGE_VARIANT[assignment.priority], children: PRIORITY_LABELS[assignment.priority] }), _jsx(Badge, { variant: task.state === 'done' ? 'success' : 'default', children: STATE_LABELS[task.state] })] })] })), editMode && (_jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400", children: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F" }))] }), _jsx("button", { onClick: handleClose, className: "btn btn-ghost btn-icon shrink-0 -mt-1 -mr-2", "aria-label": "\u0417\u0430\u043A\u0440\u044B\u0442\u044C", children: _jsx(Icon, { name: "x", size: 20 }) })] }), _jsx("div", { className: "px-6 py-5 space-y-6 max-h-[60vh] overflow-y-auto", children: editMode ? (
                /* ─── Edit form ─── */
                _jsxs("div", { className: "space-y-4", children: [_jsx(Input, { label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", value: editTitle, onChange: (e) => setEditTitle(e.target.value), placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435 \u0437\u0430\u0434\u0430\u043D\u0438\u044F" }), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("label", { htmlFor: "edit-description", className: "text-sm font-medium text-surface-700 dark:text-surface-300", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("textarea", { id: "edit-description", value: editDescription, onChange: (e) => setEditDescription(e.target.value), placeholder: "\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C...", rows: 4, className: "input resize-none" })] }), _jsx(Input, { label: "\u0414\u0435\u0434\u043B\u0430\u0439\u043D", type: "date", value: editDeadline, onChange: (e) => setEditDeadline(e.target.value) }), _jsx(Select, { label: "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442", options: PRIORITY_OPTIONS, value: editPriority, onChange: setEditPriority }), _jsx(Input, { label: "\u0421\u0441\u044B\u043B\u043A\u0430 \u043D\u0430 \u0437\u0430\u0434\u0430\u043D\u0438\u0435", type: "url", value: editLink, onChange: (e) => setEditLink(e.target.value), placeholder: "https://..." })] })) : (
                /* ─── View mode ─── */
                _jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center justify-between p-3 rounded-xl bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700", children: [_jsx("div", { className: "flex items-center gap-3", children: _jsxs("span", { className: "text-sm text-surface-700 dark:text-surface-300", children: [_jsx("span", { className: "font-semibold text-success-600 dark:text-success-400", children: assignment.votes_up }), ' ', pluralize(assignment.votes_up, ['подтвердил', 'подтвердили', 'подтвердили']), ' / ', _jsx("span", { className: "font-semibold text-danger-600 dark:text-danger-400", children: assignment.votes_down }), ' ', pluralize(assignment.votes_down, ['оспаривает', 'оспаривают', 'оспаривают'])] }) }), _jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("button", { onClick: () => onVote(assignment.id, 1), className: clsx('inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all', userVote === 1
                                                ? 'bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-400 ring-1 ring-success-300 dark:ring-success-500/30'
                                                : 'text-surface-500 hover:text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10 dark:hover:text-success-400'), "aria-label": "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C", children: _jsx(Icon, { name: "thumbs-up", size: 16 }) }), _jsx("button", { onClick: () => onVote(assignment.id, -1), className: clsx('inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all', userVote === -1
                                                ? 'bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-400 ring-1 ring-danger-300 dark:ring-danger-500/30'
                                                : 'text-surface-500 hover:text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/10 dark:hover:text-danger-400'), "aria-label": "\u041E\u0441\u043F\u043E\u0440\u0438\u0442\u044C", children: _jsx(Icon, { name: "thumbs-down", size: 16 }) })] })] }), _jsxs("div", { className: "flex items-center gap-2 text-sm", children: [_jsx(Icon, { name: "clock", size: 16, className: clsx(overdue
                                        ? 'text-danger-500'
                                        : 'text-surface-400 dark:text-surface-500') }), _jsxs("span", { className: clsx('font-medium', overdue
                                        ? 'text-danger-600 dark:text-danger-400'
                                        : 'text-surface-700 dark:text-surface-300'), children: [overdue ? 'Просрочено' : 'Дедлайн', ":", ' ', formatDeadline(assignment.deadline)] }), _jsxs("span", { className: "text-xs text-surface-400 dark:text-surface-500", children: ["(", getRelativeDeadline(assignment.deadline), ")"] })] }), _jsxs("div", { children: [_jsx("h3", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 mb-2", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("p", { className: "text-sm text-surface-600 dark:text-surface-400 leading-relaxed whitespace-pre-wrap", children: assignment.description })] }), assignment.link && (_jsxs("a", { href: assignment.link, target: "_blank", rel: "noopener noreferrer", className: clsx('flex items-center gap-2 px-4 py-3 rounded-xl', 'bg-primary-50 dark:bg-primary-500/10', 'border border-primary-200 dark:border-primary-500/20', 'text-primary-600 dark:text-primary-400', 'hover:bg-primary-100 dark:hover:bg-primary-500/15', 'transition-colors group'), children: [_jsx(Icon, { name: "link", size: 16, className: "shrink-0" }), _jsx("span", { className: "text-sm font-medium truncate flex-1", children: assignment.link }), _jsx(Icon, { name: "chevron-right", size: 16, className: "shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" })] })), _jsxs("div", { className: "flex items-center gap-3 pt-2 border-t border-surface-200 dark:border-surface-700", children: [_jsx(Avatar, { name: authorName, size: "sm" }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("p", { className: "text-sm font-medium text-surface-700 dark:text-surface-300", children: authorName }), _jsxs("p", { className: "text-xs text-surface-400 dark:text-surface-500", children: ["\u0421\u043E\u0437\u0434\u0430\u043D\u043E ", formatCreatedAt(assignment.created_at)] })] })] })] })) }), _jsxs("div", { className: "flex items-center justify-between gap-3 px-6 py-4 border-t border-surface-200 dark:border-surface-700", children: [_jsx("div", { className: "flex items-center gap-2", children: !editMode && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(Icon, { name: "pencil", size: 14 }), onClick: enterEditMode, children: "\u0420\u0435\u0434\u0430\u043A\u0442\u0438\u0440\u043E\u0432\u0430\u0442\u044C" }), _jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(Icon, { name: "trash-2", size: 14 }), onClick: () => setShowDeleteConfirm(true), className: "!text-danger-500 hover:!bg-danger-50 dark:hover:!bg-danger-500/10", children: "\u0423\u0434\u0430\u043B\u0438\u0442\u044C" })] })) }), _jsx("div", { className: "flex items-center gap-2", children: editMode ? (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: cancelEdit, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { variant: "primary", size: "sm", onClick: handleSave, children: updateAssignment.isPending ? 'Сохранение...' : 'Сохранить' })] })) : (_jsxs(_Fragment, { children: [task.state === 'todo' && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "secondary", size: "sm", onClick: handleClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { variant: "primary", size: "sm", icon: _jsx(Icon, { name: "chevron-right", size: 16 }), onClick: () => onStateChange(task.id, 'review'), children: "\u0421\u0434\u0430\u043B" })] })), task.state === 'review' && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "danger", size: "sm", icon: _jsx(Icon, { name: "x", size: 16 }), onClick: () => onStateChange(task.id, 'todo'), children: "\u041D\u0435 \u0441\u0434\u0430\u043B" }), _jsx(Button, { variant: "success", size: "sm", icon: _jsx(Icon, { name: "check", size: 16 }), onClick: () => onStateChange(task.id, 'done'), children: "\u0417\u0430\u0447\u0442\u0435\u043D\u043E" })] })), task.state === 'done' && (_jsxs(_Fragment, { children: [_jsx(Button, { variant: "ghost", size: "sm", icon: _jsx(Icon, { name: "chevron-left", size: 16 }), onClick: () => onStateChange(task.id, 'todo'), children: "\u0412\u0435\u0440\u043D\u0443\u0442\u044C \u0432 \u0440\u0430\u0431\u043E\u0442\u0443" }), _jsx(Button, { variant: "secondary", size: "sm", onClick: handleClose, children: "\u0417\u0430\u043A\u0440\u044B\u0442\u044C" })] }))] })) })] })] }));
}
export { AssignmentDetailModal };
