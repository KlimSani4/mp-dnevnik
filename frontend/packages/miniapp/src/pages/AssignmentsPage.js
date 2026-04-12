import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useAssignments, useCreateAssignment, useVoteAssignment, useGroupContext, useGroupSubjects, } from '@nexora/shared';
const PRIORITY_LABELS = {
    low: 'Низкий',
    normal: 'Обычный',
    high: 'Высокий',
    urgent: 'Срочно',
};
const PRIORITY_COLORS = {
    urgent: '#ef4444',
    high: '#f97316',
    normal: '#6b7280',
    low: '#9ca3af',
};
function formatDeadline(deadline) {
    return new Date(deadline).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}
function AssignmentSkeleton() {
    return (_jsx("div", { style: { marginBottom: 8 }, children: [1, 2, 3].map((i) => (_jsxs("div", { style: {
                background: 'var(--tg-theme-secondary-bg-color)',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 8,
                opacity: 0.5,
            }, children: [_jsx("div", { style: {
                        height: 16,
                        background: 'var(--tg-theme-hint-color)',
                        borderRadius: 4,
                        marginBottom: 8,
                        width: '70%',
                    } }), _jsx("div", { style: {
                        height: 12,
                        background: 'var(--tg-theme-hint-color)',
                        borderRadius: 4,
                        width: '40%',
                    } })] }, i))) }));
}
function AssignmentCard({ assignment, onVote, }) {
    return (_jsxs("div", { style: {
            background: 'var(--tg-theme-secondary-bg-color)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 8,
        }, children: [_jsx("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }, children: _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: {
                                fontWeight: 500,
                                fontSize: 15,
                                color: 'var(--tg-theme-text-color)',
                                marginBottom: 2,
                            }, children: assignment.title }), _jsx("div", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 13, marginBottom: 4 }, children: assignment.subject.name }), assignment.description && (_jsx("div", { style: {
                                color: 'var(--tg-theme-hint-color)',
                                fontSize: 13,
                                marginBottom: 4,
                                lineHeight: 1.4,
                            }, children: assignment.description })), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: {
                                        color: PRIORITY_COLORS[assignment.priority],
                                        fontSize: 12,
                                        fontWeight: 500,
                                    }, children: PRIORITY_LABELS[assignment.priority] }), _jsx("span", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 12 }, children: "\u00B7" }), _jsxs("span", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 12 }, children: ["\u0434\u043E ", formatDeadline(assignment.deadline)] })] })] }) }), _jsx("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: '1px solid var(--tg-theme-hint-color)',
                    opacity: 0.3,
                } }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsxs("button", { onClick: () => onVote(assignment.id, 1), style: {
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--tg-theme-hint-color)',
                            fontSize: 13,
                            padding: '2px 6px',
                            borderRadius: 6,
                        }, children: ["\uD83D\uDC4D ", assignment.votes_up] }), _jsxs("button", { onClick: () => onVote(assignment.id, -1), style: {
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--tg-theme-hint-color)',
                            fontSize: 13,
                            padding: '2px 6px',
                            borderRadius: 6,
                        }, children: ["\uD83D\uDC4E ", assignment.votes_down] }), assignment.is_verified && (_jsx("span", { style: {
                            marginLeft: 'auto',
                            fontSize: 11,
                            color: '#16a34a',
                            fontWeight: 500,
                        }, children: "\u2713 \u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u043E" }))] })] }));
}
const EMPTY_FORM = {
    title: '',
    description: '',
    deadline: '',
    subject_id: '',
    priority: 'normal',
};
export function AssignmentsPage() {
    const { groupId, groupCode } = useGroupContext();
    const { data: assignments, isLoading } = useAssignments({
        group_id: groupId ?? '',
    });
    const { data: subjects } = useGroupSubjects(groupCode ?? undefined);
    const createAssignment = useCreateAssignment();
    const voteAssignment = useVoteAssignment();
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const handleVote = (id, vote) => {
        voteAssignment.mutate({ id, data: { vote } });
    };
    const handleSubmit = () => {
        if (!form.title || !form.deadline || !form.subject_id || !groupId)
            return;
        createAssignment.mutate({
            group_id: groupId,
            subject_id: form.subject_id,
            title: form.title,
            description: form.description,
            deadline: new Date(form.deadline).toISOString(),
            priority: form.priority,
        }, {
            onSuccess: () => {
                setForm(EMPTY_FORM);
                setShowForm(false);
            },
        });
    };
    const inputStyle = {
        width: '100%',
        background: 'var(--tg-theme-bg-color)',
        border: '1px solid var(--tg-theme-hint-color)',
        borderRadius: 8,
        padding: '10px 12px',
        fontSize: 14,
        color: 'var(--tg-theme-text-color)',
        outline: 'none',
        boxSizing: 'border-box',
    };
    return (_jsxs("div", { style: { padding: '16px 12px' }, children: [_jsxs("div", { style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 16,
                }, children: [_jsx("h1", { style: {
                            fontSize: 20,
                            fontWeight: 600,
                            color: 'var(--tg-theme-text-color)',
                        }, children: "\u0417\u0430\u0434\u0430\u043D\u0438\u044F" }), _jsx("button", { onClick: () => setShowForm(!showForm), style: {
                            background: 'var(--tg-theme-button-color)',
                            color: 'var(--tg-theme-button-text-color)',
                            border: 'none',
                            borderRadius: 8,
                            padding: '7px 14px',
                            fontSize: 13,
                            fontWeight: 500,
                            cursor: 'pointer',
                        }, children: showForm ? 'Отмена' : '+ Дедлайн' })] }), showForm && (_jsxs("div", { style: {
                    background: 'var(--tg-theme-secondary-bg-color)',
                    borderRadius: 12,
                    padding: 14,
                    marginBottom: 16,
                }, children: [_jsx("div", { style: {
                            fontSize: 14,
                            fontWeight: 600,
                            color: 'var(--tg-theme-text-color)',
                            marginBottom: 12,
                        }, children: "\u041D\u043E\u0432\u044B\u0439 \u0434\u0435\u0434\u043B\u0430\u0439\u043D" }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsx("input", { placeholder: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }), style: inputStyle }), _jsx("textarea", { placeholder: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435 (\u043D\u0435\u043E\u0431\u044F\u0437\u0430\u0442\u0435\u043B\u044C\u043D\u043E)", value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }), rows: 2, style: { ...inputStyle, resize: 'none' } }), _jsx("input", { type: "date", value: form.deadline, onChange: (e) => setForm({ ...form, deadline: e.target.value }), style: inputStyle }), _jsxs("select", { value: form.subject_id, onChange: (e) => setForm({ ...form, subject_id: e.target.value }), style: inputStyle, children: [_jsx("option", { value: "", children: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442" }), (subjects ?? []).map((s) => (_jsx("option", { value: s.id, children: s.name }, s.id)))] }), _jsxs("select", { value: form.priority, onChange: (e) => setForm({ ...form, priority: e.target.value }), style: inputStyle, children: [_jsx("option", { value: "low", children: "\u041D\u0438\u0437\u043A\u0438\u0439" }), _jsx("option", { value: "normal", children: "\u041E\u0431\u044B\u0447\u043D\u044B\u0439" }), _jsx("option", { value: "high", children: "\u0412\u044B\u0441\u043E\u043A\u0438\u0439" }), _jsx("option", { value: "urgent", children: "\u0421\u0440\u043E\u0447\u043D\u043E" })] }), _jsx("button", { onClick: handleSubmit, disabled: createAssignment.isPending || !form.title || !form.deadline || !form.subject_id, style: {
                                    background: 'var(--tg-theme-button-color)',
                                    color: 'var(--tg-theme-button-text-color)',
                                    border: 'none',
                                    borderRadius: 8,
                                    padding: '11px',
                                    fontSize: 14,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    opacity: createAssignment.isPending || !form.title || !form.deadline || !form.subject_id ? 0.6 : 1,
                                }, children: createAssignment.isPending ? 'Сохранение...' : 'Добавить' })] })] })), isLoading && _jsx(AssignmentSkeleton, {}), !isLoading && (!assignments || assignments.length === 0) && (_jsx("p", { style: {
                    color: 'var(--tg-theme-hint-color)',
                    textAlign: 'center',
                    paddingTop: 48,
                    fontSize: 15,
                }, children: "\u0414\u0435\u0434\u043B\u0430\u0439\u043D\u043E\u0432 \u043D\u0435\u0442" })), (assignments ?? []).map((a) => (_jsx(AssignmentCard, { assignment: a, onVote: handleVote }, a.id)))] }));
}
