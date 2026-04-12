import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTasks, useUpdateTask, useGroupContext } from '@nexora/shared';
const STATE_LABELS = {
    todo: 'Нужно сделать',
    doing: 'В процессе',
    review: 'На проверке',
    done: 'Зачтено',
};
const PRIORITY_COLORS = {
    urgent: '#ef4444',
    high: '#f97316',
    normal: '#6b7280',
    low: '#9ca3af',
};
function formatDeadline(deadline) {
    const d = new Date(deadline);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}
function TaskCard({ task, onSubmit }) {
    const { assignment, state } = task;
    const isDone = state === 'done';
    const isReview = state === 'review';
    return (_jsx("div", { style: {
            background: 'var(--tg-theme-secondary-bg-color)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 8,
        }, children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }, children: [_jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: {
                                fontWeight: 500,
                                color: 'var(--tg-theme-text-color)',
                                fontSize: 15,
                                marginBottom: 2,
                            }, children: assignment.title }), _jsx("div", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 13, marginBottom: 4 }, children: assignment.subject.name }), _jsxs("div", { style: {
                                color: PRIORITY_COLORS[assignment.priority] || '#6b7280',
                                fontSize: 12,
                            }, children: ["\u0434\u043E ", formatDeadline(assignment.deadline)] })] }), _jsx("div", { style: { flexShrink: 0, marginTop: 2 }, children: isDone || isReview ? (_jsx("span", { style: {
                            background: isDone ? '#16a34a22' : '#ca8a0422',
                            color: isDone ? '#16a34a' : '#ca8a04',
                            borderRadius: 8,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 500,
                        }, children: isDone ? 'Зачтено' : 'На проверке' })) : (_jsx("button", { onClick: () => onSubmit(assignment.id), style: {
                            background: 'var(--tg-theme-button-color)',
                            color: 'var(--tg-theme-button-text-color)',
                            border: 'none',
                            borderRadius: 8,
                            padding: '6px 14px',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                        }, children: "\u0421\u0434\u0430\u0442\u044C" })) })] }) }));
}
function Spinner() {
    return (_jsxs("div", { style: { display: 'flex', justifyContent: 'center', padding: 32 }, children: [_jsx("div", { style: {
                    width: 28,
                    height: 28,
                    border: '3px solid var(--tg-theme-hint-color)',
                    borderTopColor: 'var(--tg-theme-button-color)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                } }), _jsx("style", { children: `@keyframes spin { to { transform: rotate(360deg); } }` })] }));
}
const GROUPS = [
    { state: 'todo', label: 'Нужно сделать' },
    { state: 'doing', label: 'В процессе' },
    { state: 'review', label: 'На проверке' },
    { state: 'done', label: 'Зачтено' },
];
export function TasksPage() {
    const { groupId } = useGroupContext();
    const { data: tasks, isLoading } = useTasks({ group_id: groupId ?? '' });
    const updateTask = useUpdateTask();
    const handleSubmit = (assignmentId) => {
        updateTask.mutate({ assignmentId, data: { state: 'review' } });
    };
    const grouped = GROUPS.map(({ state, label }) => ({
        state,
        label,
        items: (tasks ?? []).filter((t) => t.state === state),
    })).filter(({ items }) => items.length > 0);
    return (_jsxs("div", { style: { padding: '16px 12px' }, children: [_jsx("h1", { style: {
                    fontSize: 20,
                    fontWeight: 600,
                    color: 'var(--tg-theme-text-color)',
                    marginBottom: 16,
                }, children: "\u041C\u043E\u0438 \u0437\u0430\u0434\u0430\u0447\u0438" }), isLoading && _jsx(Spinner, {}), !isLoading && (!tasks || tasks.length === 0) && (_jsx("p", { style: {
                    color: 'var(--tg-theme-hint-color)',
                    textAlign: 'center',
                    paddingTop: 48,
                    fontSize: 15,
                }, children: "\u0417\u0430\u0434\u0430\u043D\u0438\u0439 \u043D\u0435\u0442" })), grouped.map(({ state, label, items }) => (_jsxs("div", { style: { marginBottom: 20 }, children: [_jsxs("div", { style: {
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--tg-theme-hint-color)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: 8,
                        }, children: [label, " \u00B7 ", items.length] }), items.map((task) => (_jsx(TaskCard, { task: task, onSubmit: handleSubmit }, task.id)))] }, state)))] }));
}
