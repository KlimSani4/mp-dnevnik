import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { Card, Badge, ProgressBar, Icon } from '../components/ui';
import { useGroupSubjects, useGroupContext } from '@nexora/shared';
// The API Subject type may not have assignment breakdown.
// We'll show what we have: name, teacher (if available).
// Progress is shown as 0/unknown if no assignment data.
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
export function SubjectsPage() {
    const { groupCode } = useGroupContext();
    const subjectsQuery = useGroupSubjects(groupCode ?? undefined);
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
                    const progress = getSubjectProgress(subject);
                    const admitted = isAdmitted(progress);
                    const assignmentsLabel = formatAssignments(subject.assignments);
                    return (_jsx(Link, { to: `/assignments?subject=${subject.id}`, className: "block group", children: _jsxs(Card, { variant: "hover", className: "h-full transition-shadow group-hover:shadow-md", children: [_jsxs("div", { className: "flex items-start justify-between gap-3", children: [_jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "flex items-center gap-2 mb-1", children: _jsx("h3", { className: "text-base font-semibold text-surface-900 dark:text-surface-50 truncate", children: subject.name }) }), subject.teacher && (_jsxs("div", { className: "flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400", children: [_jsx(Icon, { name: "users", size: 14, className: "shrink-0" }), _jsx("span", { className: "truncate", children: subject.teacher })] }))] }), _jsxs("div", { className: "flex items-center gap-2 shrink-0", children: [_jsx(Badge, { variant: admitted ? 'success' : 'urgent', children: admitted ? 'ДОПУСК' : 'НЕДОПУСК' }), _jsx(Icon, { name: "chevron-right", size: 18, className: "text-surface-400 dark:text-surface-500 group-hover:text-primary-500 transition-colors" })] })] }), _jsx("div", { className: "mt-3", children: _jsx(ProgressBar, { value: progress, color: admitted ? 'success' : 'danger', showLabel: true, trend: assignmentsLabel || undefined }) }), subject.assignments && subject.assignments.length > 0 && (_jsxs("div", { className: "mt-3 flex items-center justify-between", children: [_jsx("div", { className: "flex items-center gap-3", children: subject.assignments.map((a) => (_jsxs("span", { className: clsx('text-xs', a.done === a.total
                                                    ? 'text-success-500'
                                                    : 'text-surface-500 dark:text-surface-400'), children: [_jsx(Icon, { name: a.done === a.total ? 'check' : 'file', size: 12, className: "inline-block mr-1 -mt-px" }), a.type, ": ", a.done, "/", a.total] }, a.type))) }), subject.control && (_jsx("span", { className: "text-xs text-surface-400 dark:text-surface-500 capitalize", children: subject.control }))] }))] }) }, subject.id));
                }) }))] }));
}
