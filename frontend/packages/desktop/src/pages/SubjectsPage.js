import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useState, useCallback } from 'react';
import { Card, Badge, ProgressBar, Icon, Button, Input } from '../components/ui';
import { useGroupSubjects, useGroupContext, useMyGroups, useUpdateSubjectRequirements, useGroup, } from '@nexora/shared';
function getSubjectProgress(subject) {
    const assignments = subject.assignments;
    if (!assignments || assignments.length === 0)
        return 0;
    const totalDone = assignments.reduce((sum, a) => sum + a.done, 0);
    const totalAll = assignments.reduce((sum, a) => sum + a.total, 0);
    if (totalAll === 0)
        return 100;
    return Math.round((totalDone / totalAll) * 100);
}
function formatAssignments(assignments) {
    if (!assignments || assignments.length === 0)
        return '';
    return assignments
        .map((a) => `${a.done}/${a.total} ${a.type}`)
        .join(', ');
}
function isAdmitted(progress) {
    return progress >= 70;
}
/** Get subject requirements from group settings */
function getRequirements(settings, subjectId) {
    const reqs = settings.subject_requirements;
    if (!reqs)
        return {};
    return reqs[subjectId] ?? {};
}
function RequirementsEditor({ subjectId, groupCode, currentTotal, onClose }) {
    const updateRequirements = useUpdateSubjectRequirements();
    const [total, setTotal] = useState(String(currentTotal ?? ''));
    const handleSave = useCallback(() => {
        const num = parseInt(total, 10);
        updateRequirements.mutate({
            code: groupCode,
            subjectId,
            total: isNaN(num) ? undefined : num,
        }, { onSuccess: onClose });
    }, [total, groupCode, subjectId, updateRequirements, onClose]);
    return (_jsxs("div", { className: "mt-2 p-3 rounded-lg border border-primary-200 dark:border-primary-500/30 bg-primary-50/50 dark:bg-primary-500/5 space-y-2", onClick: (e) => e.preventDefault(), children: [_jsx("p", { className: "text-xs font-medium text-surface-600 dark:text-surface-400", children: "\u0422\u0440\u0435\u0431\u0443\u0435\u043C\u043E\u0435 \u0447\u0438\u0441\u043B\u043E \u0437\u0430\u0434\u0430\u043D\u0438\u0439" }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Input, { type: "number", value: total, onChange: (e) => setTotal(e.target.value), placeholder: "\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: 8", className: "!py-1 !text-sm w-28" }), _jsx(Button, { variant: "primary", size: "sm", onClick: handleSave, children: updateRequirements.isPending ? '...' : 'Сохранить' }), _jsx(Button, { variant: "ghost", size: "sm", onClick: onClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })] }));
}
/* ─── Main Page ─── */
export function SubjectsPage() {
    const { groupId, groupCode } = useGroupContext();
    const subjectsQuery = useGroupSubjects(groupCode ?? undefined);
    const myGroupsQuery = useMyGroups();
    const groupQuery = useGroup(groupCode ?? '');
    const [editingSubjectId, setEditingSubjectId] = useState(null);
    // Determine if current user is starosta/deputy/moderator
    const myMembership = myGroupsQuery.data?.find((m) => m.group.code === groupCode);
    const isStarosta = myMembership?.role && ['starosta', 'deputy', 'moderator'].includes(myMembership.role);
    const groupSettings = (groupQuery.data?.settings ?? {});
    const subjects = (subjectsQuery.data ?? []);
    if (!groupCode) {
        return (_jsxs("div", { children: [_jsx("div", { className: "flex items-center justify-between mb-6", children: _jsx("div", { children: _jsx("h1", { className: "text-2xl font-semibold text-surface-900 dark:text-surface-50", children: "\u041C\u043E\u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B" }) }) }), _jsxs("div", { className: "text-center py-20", children: [_jsx("p", { className: "text-surface-500 dark:text-surface-400 font-medium", children: "\u0413\u0440\u0443\u043F\u043F\u0430 \u043D\u0435 \u0432\u044B\u0431\u0440\u0430\u043D\u0430" }), _jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 mt-1", children: "\u0423\u043A\u0430\u0436\u0438\u0442\u0435 \u0433\u0440\u0443\u043F\u043F\u0443 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445, \u0447\u0442\u043E\u0431\u044B \u0443\u0432\u0438\u0434\u0435\u0442\u044C \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B" })] })] }));
    }
    if (subjectsQuery.isLoading) {
        return (_jsxs("div", { children: [_jsx("div", { className: "flex items-center justify-between mb-6", children: _jsx("div", { children: _jsx("h1", { className: "text-2xl font-semibold text-surface-900 dark:text-surface-50", children: "\u041C\u043E\u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B" }) }) }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: [1, 2, 3, 4, 5, 6].map((i) => (_jsx("div", { className: "h-32 bg-surface-200 dark:bg-surface-700 rounded-xl animate-pulse" }, i))) })] }));
    }
    return (_jsxs("div", { children: [_jsx("div", { className: "flex items-center justify-between mb-6", children: _jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold text-surface-900 dark:text-surface-50", children: "\u041C\u043E\u0438 \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u044B" }), _jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400 mt-1", children: subjects.length > 0
                                ? `Группа ${groupCode} — ${subjects.length} предметов`
                                : `Группа ${groupCode}` })] }) }), subjects.length === 0 ? (_jsxs("div", { className: "text-center py-20", children: [_jsx("p", { className: "text-surface-500 dark:text-surface-400 font-medium", children: "\u041F\u0440\u0435\u0434\u043C\u0435\u0442\u044B \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u044B" }), _jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500 mt-1", children: "\u0421\u043F\u0438\u0441\u043E\u043A \u043F\u0440\u0435\u0434\u043C\u0435\u0442\u043E\u0432 \u0434\u043B\u044F \u0432\u0430\u0448\u0435\u0439 \u0433\u0440\u0443\u043F\u043F\u044B \u043F\u043E\u043A\u0430 \u043F\u0443\u0441\u0442" })] })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: subjects.map((subject) => {
                    const requirements = getRequirements(groupSettings, subject.id);
                    const progress = (() => {
                        if (subject.assignments && subject.assignments.length > 0) {
                            return getSubjectProgress(subject);
                        }
                        // If requirements set, progress = 0 (no done yet from assignments)
                        return 0;
                    })();
                    const admitted = isAdmitted(progress);
                    const assignmentsLabel = (() => {
                        if (formatAssignments(subject.assignments))
                            return formatAssignments(subject.assignments);
                        if (requirements.total != null)
                            return `0/${requirements.total}`;
                        return '';
                    })();
                    const isEditing = editingSubjectId === subject.id;
                    return (_jsx("div", { className: "block group", children: _jsx(Link, { to: `/assignments?subject=${subject.id}`, className: "block", onClick: (e) => isEditing && e.preventDefault(), children: _jsxs(Card, { variant: "hover", className: "h-full transition-shadow group-hover:shadow-md", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsxs("div", { className: "flex items-center gap-2 mb-1", children: [_jsx("h3", { className: "text-base font-semibold text-surface-900 dark:text-surface-50 truncate", children: subject.name }), subject.is_custom && (_jsx("span", { className: "text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-100 dark:bg-surface-700 text-surface-500 dark:text-surface-400 shrink-0", children: "\u043B\u0438\u0447\u043D\u044B\u0439" }))] }), subject.teacher && (_jsxs("div", { className: "flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400", children: [_jsx(Icon, { name: "users", size: 14, className: "shrink-0" }), _jsx("span", { className: "truncate", children: subject.teacher })] }))] }), _jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [isStarosta && (_jsx("button", { type: "button", onClick: (e) => {
                                                            e.preventDefault();
                                                            setEditingSubjectId(isEditing ? null : subject.id);
                                                        }, className: clsx('p-1 rounded transition-colors', isEditing
                                                            ? 'text-primary-500 bg-primary-50 dark:bg-primary-500/10'
                                                            : 'text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 opacity-0 group-hover:opacity-100'), title: "\u0423\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u0442\u0440\u0435\u0431\u043E\u0432\u0430\u043D\u0438\u044F", children: _jsx(Icon, { name: "settings", size: 14 }) })), _jsx(Badge, { variant: admitted ? 'success' : 'urgent', children: admitted ? 'ДОПУСК' : 'НЕДОПУСК' }), _jsx(Icon, { name: "chevron-right", size: 18, className: "text-surface-400 dark:text-surface-500 group-hover:text-primary-500 transition-colors" })] })] }), _jsx("div", { className: "mt-3", children: _jsx(ProgressBar, { value: progress, color: admitted ? 'success' : 'danger', showLabel: true, trend: assignmentsLabel || undefined }) }), subject.assignments && subject.assignments.length > 0 && (_jsxs("div", { className: "mt-3 flex items-center justify-between", children: [_jsx("div", { className: "flex items-center gap-3", children: subject.assignments.map((a) => (_jsxs("span", { className: clsx('text-xs', a.done === a.total
                                                        ? 'text-success-500'
                                                        : 'text-surface-500 dark:text-surface-400'), children: [_jsx(Icon, { name: a.done === a.total ? 'check' : 'file', size: 12, className: "inline-block mr-1 -mt-px" }), a.type, ": ", a.done, "/", a.total] }, a.type))) }), subject.control && (_jsx("span", { className: "text-xs text-surface-400 dark:text-surface-500 capitalize", children: subject.control }))] })), isEditing && groupCode && (_jsx(RequirementsEditor, { subjectId: subject.id, groupCode: groupCode, currentTotal: requirements.total, onClose: () => setEditingSubjectId(null) })), !subject.assignments?.length && requirements.total != null && !isEditing && (_jsxs("p", { className: "mt-2 text-xs text-surface-400 dark:text-surface-500", children: ["\u0422\u0440\u0435\u0431\u0443\u0435\u0442\u0441\u044F: ", requirements.total, " \u0437\u0430\u0434\u0430\u043D\u0438\u0439"] }))] }) }) }, subject.id));
                }) }))] }));
}
