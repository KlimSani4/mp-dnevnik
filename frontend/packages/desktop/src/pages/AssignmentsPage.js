import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useMemo, useCallback } from 'react';
import { useTasks, useUpdateTask, useVoteAssignment, useCreateAssignment, useGroupContext, useGroupSubjects, } from '@nexora/shared';
import clsx from 'clsx';
import { startOfDay, addDays, isBefore } from 'date-fns';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners, } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, Badge, Icon, Modal, Select, SearchInput, Input } from '../components/ui';
import { AssignmentDetailModal } from '../components/AssignmentDetailModal';
import { SUBJECTS, AUTHORS, COLUMNS, PRIORITY_LABELS, PRIORITY_BADGE_VARIANT, DEADLINE_FILTER_OPTIONS, COLUMN_COLORS, COLUMN_COUNT_COLORS, PRIORITY_BORDER_COLORS, today, isBurning, isOverdue, daysLeft, getDayWord, createMockTasks, } from '../types/assignments';
function BoardCard({ task, userVote, onVote, onClick, isDragOverlay }) {
    const { assignment } = task;
    const burning = isBurning(assignment.deadline);
    const overdue = isOverdue(assignment.deadline);
    const days = daysLeft(assignment.deadline);
    const isDone = task.state === 'done';
    const isExpired = overdue && !isDone;
    return (_jsxs("div", { onClick: onClick, className: clsx('group relative rounded-md border cursor-pointer transition-all duration-150', 'border-l-[3px]', isDone
            ? 'bg-surface-50 dark:bg-surface-800/60 border-surface-200 dark:border-surface-700 border-l-success-400 dark:border-l-success-600'
            : isExpired
                ? 'bg-danger-50/50 dark:bg-danger-950/20 border-danger-200 dark:border-danger-800/50 border-l-danger-500'
                : 'bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 shadow-sm', !isDone && !isExpired && PRIORITY_BORDER_COLORS[assignment.priority], isDragOverlay
            ? 'shadow-xl opacity-90 rotate-[2deg] scale-105'
            : !isDone && 'hover:shadow-md hover:border-surface-300 dark:hover:border-surface-600'), children: [!isDragOverlay && (_jsx("div", { className: "absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-surface-400 dark:text-surface-500 pointer-events-none", children: _jsx(Icon, { name: "grip-vertical", size: 12, strokeWidth: 3 }) })), _jsxs("div", { className: clsx('px-2.5 py-2 pl-4', isDone && 'opacity-70'), children: [_jsxs("div", { className: "flex items-center gap-1 mb-1", children: [_jsx("span", { className: clsx('text-[10px] font-medium px-1.5 py-0.5 rounded truncate max-w-[70%]', isDone
                                    ? 'text-surface-500 dark:text-surface-400 bg-surface-100 dark:bg-surface-700/50'
                                    : isExpired
                                        ? 'text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-500/10'
                                        : 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-500/10'), children: assignment.subject.name }), assignment.is_verified && (_jsx(Icon, { name: "check", size: 10, className: "text-success-500 dark:text-success-400 flex-shrink-0" })), assignment.link && (_jsx("a", { href: assignment.link, target: "_blank", rel: "noopener noreferrer", onClick: (e) => e.stopPropagation(), className: "text-info-500 hover:text-info-600 transition-colors ml-auto flex-shrink-0", children: _jsx(Icon, { name: "link", size: 10 }) }))] }), _jsx("h3", { className: clsx('text-[13px] font-semibold leading-snug line-clamp-2 mb-1', isDone
                            ? 'text-surface-500 dark:text-surface-400 line-through decoration-surface-300 dark:decoration-surface-600'
                            : isExpired
                                ? 'text-danger-800 dark:text-danger-300'
                                : 'text-surface-900 dark:text-surface-50'), children: assignment.title }), isDone ? (_jsxs("div", { className: "flex items-center gap-1 text-[10px] font-medium mb-1.5 text-success-500 dark:text-success-400", children: [_jsx(Icon, { name: "check", size: 10 }), _jsx("span", { children: "\u0421\u0434\u0430\u043D\u043E" })] })) : (_jsxs("div", { className: clsx('flex items-center gap-1 text-[10px] font-medium mb-1.5', overdue || burning
                            ? 'text-danger-500'
                            : 'text-surface-500 dark:text-surface-400'), children: [_jsx(Icon, { name: overdue ? 'alert-triangle' : 'clock', size: 10 }), overdue ? (_jsxs("span", { className: "font-bold", children: ["\u041F\u0440\u043E\u0441\u0440\u043E\u0447\u0435\u043D\u043E ", Math.abs(days), " ", getDayWord(days)] })) : days <= 0 ? (_jsx("span", { children: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F" })) : burning ? (_jsxs("span", { children: [days, " ", getDayWord(days), " \u2014 \u0433\u043E\u0440\u0438\u0442"] })) : (_jsxs("span", { children: [days, " ", getDayWord(days)] }))] })), _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex items-center gap-1.5", children: [_jsx("div", { className: "w-4 h-4 rounded-full bg-surface-200 dark:bg-surface-600 flex items-center justify-center flex-shrink-0", children: _jsx("span", { className: "text-[9px] font-medium text-surface-600 dark:text-surface-300", children: (AUTHORS[assignment.author_id] ?? 'U')[0] }) }), !isDone && (_jsx(Badge, { variant: PRIORITY_BADGE_VARIANT[assignment.priority], size: "sm", children: PRIORITY_LABELS[assignment.priority] }))] }), _jsxs("div", { className: "flex items-center gap-0.5", children: [_jsxs("button", { onClick: (e) => {
                                            e.stopPropagation();
                                            onVote(assignment.id, 'up');
                                        }, className: clsx('flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] transition-colors', userVote === 'up'
                                            ? 'text-success-600 bg-success-50 dark:bg-success-500/10'
                                            : 'text-surface-400 hover:text-success-500 hover:bg-surface-100 dark:hover:bg-surface-700'), children: [_jsx(Icon, { name: "thumbs-up", size: 10 }), _jsx("span", { children: assignment.votes_up })] }), _jsxs("button", { onClick: (e) => {
                                            e.stopPropagation();
                                            onVote(assignment.id, 'down');
                                        }, className: clsx('flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] transition-colors', userVote === 'down'
                                            ? 'text-danger-600 bg-danger-50 dark:bg-danger-500/10'
                                            : 'text-surface-400 hover:text-danger-500 hover:bg-surface-100 dark:hover:bg-surface-700'), children: [_jsx(Icon, { name: "thumbs-down", size: 10 }), _jsx("span", { children: assignment.votes_down })] })] })] })] })] }));
}
function SortableBoardCard({ task, userVote, onVote, onTaskClick }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: task.id,
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };
    return (_jsx("div", { ref: setNodeRef, style: style, ...attributes, ...listeners, className: clsx(isDragging && 'opacity-30'), children: _jsx(BoardCard, { task: task, userVote: userVote, onVote: onVote, onClick: () => onTaskClick(task) }) }));
}
function BoardColumn({ state, label, tasks, userVotes, onVote, onTaskClick, isOver }) {
    const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks]);
    return (_jsxs("div", { className: clsx('flex flex-col rounded-lg bg-surface-50 dark:bg-surface-800/50 border-t-[3px] min-w-0', COLUMN_COLORS[state] ?? 'border-t-surface-300', isOver && 'ring-2 ring-primary-400/50'), children: [_jsxs("div", { className: "flex items-center justify-between px-2 py-2", children: [_jsx("h2", { className: "text-[11px] font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wider truncate", children: label }), _jsx("span", { className: clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0', COLUMN_COUNT_COLORS[state] ?? 'bg-surface-200/70 text-surface-500'), children: tasks.length })] }), _jsx("div", { className: "px-1.5 pb-1.5 space-y-1.5 min-h-[120px] max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin", children: _jsx(SortableContext, { items: taskIds, strategy: verticalListSortingStrategy, children: tasks.length === 0 ? (_jsxs("div", { className: "flex flex-col items-center justify-center py-8 text-surface-400 dark:text-surface-500", children: [_jsx(Icon, { name: "clipboard", size: 28, className: "mb-1.5 opacity-50" }), _jsx("p", { className: "text-xs", children: "\u041D\u0435\u0442 \u0437\u0430\u0434\u0430\u043D\u0438\u0439" })] })) : (tasks.map((task) => (_jsx(SortableBoardCard, { task: task, userVote: userVotes[task.assignment.id] ?? null, onVote: onVote, onTaskClick: onTaskClick }, task.id)))) }) })] }));
}
function MobileCard({ task, columnState, onMove, userVote, onVote, onClick }) {
    return (_jsxs("div", { children: [_jsx(BoardCard, { task: task, userVote: userVote, onVote: onVote, onClick: onClick }), columnState !== 'done' && (_jsxs("div", { className: "flex mt-[-1px] rounded-b-lg border border-t-0 border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden", children: [columnState === 'todo' && (_jsxs("button", { onClick: () => onMove(task.id, 'doing'), className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors", children: [_jsx(Icon, { name: "chevron-right", size: 14 }), "\u041D\u0430\u0447\u0430\u0442\u044C"] })), columnState === 'doing' && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => onMove(task.id, 'todo'), className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors border-r border-surface-200 dark:border-surface-700", children: [_jsx(Icon, { name: "chevron-left", size: 14 }), "\u041D\u0430\u0437\u0430\u0434"] }), _jsxs("button", { onClick: () => onMove(task.id, 'review'), className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors", children: [_jsx(Icon, { name: "chevron-right", size: 14 }), "\u0421\u0434\u0430\u043B"] })] })), columnState === 'review' && (_jsxs(_Fragment, { children: [_jsxs("button", { onClick: () => onMove(task.id, 'todo'), className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors border-r border-surface-200 dark:border-surface-700", children: [_jsx(Icon, { name: "chevron-left", size: 14 }), "\u0412\u0435\u0440\u043D\u0443\u0442\u044C"] }), _jsxs("button", { onClick: () => onMove(task.id, 'done'), className: "flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10 transition-colors", children: [_jsx(Icon, { name: "check", size: 14 }), "\u0417\u0430\u0447\u0442\u0435\u043D\u043E"] })] }))] }))] }));
}
function CreateAssignmentModal({ open, onClose, onSubmit }) {
    const [subjectId, setSubjectId] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [deadline, setDeadline] = useState('');
    const [priority, setPriority] = useState('normal');
    const [errors, setErrors] = useState({});
    const resetForm = useCallback(() => {
        setSubjectId('');
        setTitle('');
        setDescription('');
        setDeadline('');
        setPriority('normal');
        setErrors({});
    }, []);
    const handleClose = useCallback(() => {
        resetForm();
        onClose();
    }, [onClose, resetForm]);
    const validate = useCallback(() => {
        const newErrors = {};
        if (!subjectId)
            newErrors.subjectId = 'Выберите предмет';
        if (!title.trim())
            newErrors.title = 'Введите название';
        if (!description.trim())
            newErrors.description = 'Введите описание';
        if (!deadline)
            newErrors.deadline = 'Укажите дедлайн';
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [subjectId, title, description, deadline]);
    const handleSubmit = useCallback((e) => {
        e.preventDefault();
        if (!validate())
            return;
        onSubmit({
            subjectId,
            title: title.trim(),
            description: description.trim(),
            deadline,
            priority: priority,
        });
        resetForm();
    }, [subjectId, title, description, deadline, priority, validate, onSubmit, resetForm]);
    const subjectOptions = SUBJECTS.map((s) => ({ value: s.id, label: s.name }));
    const priorityOptions = [
        { value: 'low', label: 'Низкий' },
        { value: 'normal', label: 'Обычный' },
        { value: 'high', label: 'Высокий' },
        { value: 'urgent', label: 'Срочный' },
    ];
    return (_jsx(Modal, { open: open, onClose: handleClose, title: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C \u0437\u0430\u0434\u0430\u043D\u0438\u0435", children: _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4", children: [_jsx(Select, { label: "\u041F\u0440\u0435\u0434\u043C\u0435\u0442", options: subjectOptions, value: subjectId, onChange: setSubjectId, placeholder: "\u0412\u044B\u0431\u0435\u0440\u0438\u0442\u0435 \u043F\u0440\u0435\u0434\u043C\u0435\u0442", error: errors.subjectId }), _jsx(Input, { label: "\u041D\u0430\u0437\u0432\u0430\u043D\u0438\u0435", value: title, onChange: (e) => setTitle(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: \u041F\u0417 \u21165 \u2014 \u0413\u0440\u0430\u0444\u044B", error: errors.title }), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("label", { htmlFor: "create-description", className: "text-sm font-medium text-surface-700 dark:text-surface-300", children: "\u041E\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsx("textarea", { id: "create-description", value: description, onChange: (e) => setDescription(e.target.value), placeholder: "\u0427\u0442\u043E \u043D\u0443\u0436\u043D\u043E \u0441\u0434\u0435\u043B\u0430\u0442\u044C...", rows: 3, className: clsx('input resize-none', errors.description && 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500') }), errors.description && (_jsx("p", { className: "text-xs text-danger-500", children: errors.description }))] }), _jsx(Input, { label: "\u0414\u0435\u0434\u043B\u0430\u0439\u043D", type: "date", value: deadline, onChange: (e) => setDeadline(e.target.value), error: errors.deadline }), _jsx(Select, { label: "\u041F\u0440\u0438\u043E\u0440\u0438\u0442\u0435\u0442", options: priorityOptions, value: priority, onChange: setPriority }), _jsxs("div", { className: "flex justify-end gap-3 pt-2", children: [_jsx(Button, { variant: "secondary", type: "button", onClick: handleClose, children: "\u041E\u0442\u043C\u0435\u043D\u0430" }), _jsx(Button, { variant: "primary", type: "submit", children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C" })] })] }) }));
}
/* ─── Main Component ─── */
export function AssignmentsPage() {
    const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';
    // ─── API hooks (always called, conditional use) ───
    const { groupId, groupCode } = useGroupContext();
    const tasksQuery = useTasks({ group_id: SKIP_AUTH ? '' : (groupId ?? '') });
    const updateTaskMutation = useUpdateTask();
    const voteAssignmentMutation = useVoteAssignment();
    const createAssignmentMutation = useCreateAssignment();
    const groupSubjectsQuery = useGroupSubjects(SKIP_AUTH ? undefined : (groupCode ?? undefined));
    // Mock state (only used when SKIP_AUTH)
    const [mockTasks, setMockTasks] = useState(createMockTasks);
    // The active tasks source
    const tasks = SKIP_AUTH ? mockTasks : (tasksQuery.data ?? []);
    // Filters
    const [search, setSearch] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('');
    const [deadlineFilter, setDeadlineFilter] = useState('');
    // Mobile column selector
    const [activeColumn, setActiveColumn] = useState('todo');
    // Create modal
    const [createModalOpen, setCreateModalOpen] = useState(false);
    // Votes
    const [userVotes, setUserVotes] = useState({});
    // Detail modal
    const [selectedTask, setSelectedTask] = useState(null);
    // DnD state
    const [activeId, setActiveId] = useState(null);
    const [overColumnId, setOverColumnId] = useState(null);
    const sensors = useSensors(useSensor(PointerSensor, {
        activationConstraint: { distance: 5 },
    }));
    // ─── Filtering ───
    const filteredTasks = useMemo(() => {
        return tasks.filter((task) => {
            if (search) {
                const q = search.toLowerCase();
                const matchesTitle = task.assignment.title.toLowerCase().includes(q);
                const matchesDesc = task.assignment.description.toLowerCase().includes(q);
                const matchesSubject = task.assignment.subject.name.toLowerCase().includes(q);
                if (!matchesTitle && !matchesDesc && !matchesSubject)
                    return false;
            }
            if (subjectFilter && task.assignment.subject.id !== subjectFilter)
                return false;
            if (deadlineFilter === 'burning') {
                const dl = startOfDay(new Date(task.assignment.deadline));
                const endOfWeek = addDays(today(), 7);
                if (!isBefore(dl, endOfWeek))
                    return false;
            }
            if (deadlineFilter === 'this-month') {
                const dl = new Date(task.assignment.deadline);
                const now = new Date();
                if (dl.getMonth() !== now.getMonth() || dl.getFullYear() !== now.getFullYear())
                    return false;
            }
            if (deadlineFilter === 'hide-overdue') {
                if (task.state !== 'done' && isOverdue(task.assignment.deadline))
                    return false;
            }
            return true;
        });
    }, [tasks, search, subjectFilter, deadlineFilter]);
    const tasksByColumn = useMemo(() => {
        const grouped = { todo: [], doing: [], review: [], done: [] };
        for (const task of filteredTasks) {
            grouped[task.state].push(task);
        }
        return grouped;
    }, [filteredTasks]);
    // ─── Actions ───
    const moveTask = useCallback((taskId, newState) => {
        if (SKIP_AUTH) {
            setMockTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, state: newState, updated_at: new Date().toISOString() } : t));
        }
        else {
            updateTaskMutation.mutate({ assignmentId: taskId, data: { state: newState } });
        }
    }, [SKIP_AUTH, updateTaskMutation]);
    const toggleVote = useCallback((assignmentId, direction) => {
        if (SKIP_AUTH) {
            const current = userVotes[assignmentId] ?? null;
            setUserVotes((prev) => ({
                ...prev,
                [assignmentId]: current === direction ? null : direction,
            }));
            setMockTasks((prev) => prev.map((t) => {
                if (t.assignment.id !== assignmentId)
                    return t;
                const a = { ...t.assignment };
                if (current === 'up')
                    a.votes_up -= 1;
                if (current === 'down')
                    a.votes_down -= 1;
                if (current !== direction) {
                    if (direction === 'up')
                        a.votes_up += 1;
                    if (direction === 'down')
                        a.votes_down += 1;
                }
                return { ...t, assignment: a };
            }));
        }
        else {
            voteAssignmentMutation.mutate({
                id: assignmentId,
                data: { vote: direction === 'up' ? 1 : -1 },
            });
        }
    }, [SKIP_AUTH, userVotes, voteAssignmentMutation]);
    const handleCreateTask = useCallback((data) => {
        if (SKIP_AUTH) {
            const subject = SUBJECTS.find((s) => s.id === data.subjectId);
            if (!subject)
                return;
            const newTask = {
                id: `t${Date.now()}`,
                state: 'todo',
                updated_at: new Date().toISOString(),
                assignment: {
                    id: `a${Date.now()}`,
                    title: data.title,
                    description: data.description,
                    deadline: new Date(data.deadline).toISOString(),
                    priority: data.priority,
                    link: null,
                    votes_up: 0,
                    votes_down: 0,
                    is_verified: false,
                    author_id: 'a1',
                    subject,
                    created_at: new Date().toISOString(),
                },
            };
            setMockTasks((prev) => [newTask, ...prev]);
        }
        else {
            createAssignmentMutation.mutate({
                group_id: groupId,
                subject_id: data.subjectId,
                title: data.title,
                description: data.description,
                deadline: new Date(data.deadline).toISOString(),
                priority: data.priority,
            });
        }
        setCreateModalOpen(false);
    }, [SKIP_AUTH, groupId, createAssignmentMutation]);
    // ─── DnD Handlers ───
    const findColumnForTask = useCallback((taskId) => {
        for (const col of COLUMNS) {
            if (tasksByColumn[col.key].some((t) => t.id === taskId)) {
                return col.key;
            }
        }
        return null;
    }, [tasksByColumn]);
    const handleDragStart = useCallback((event) => {
        setActiveId(event.active.id);
    }, []);
    const handleDragOver = useCallback((event) => {
        const { active, over } = event;
        if (!over) {
            setOverColumnId(null);
            return;
        }
        const overId = over.id;
        // Check if hovering over a column droppable
        const isColumn = COLUMNS.some((c) => c.key === overId);
        if (isColumn) {
            setOverColumnId(overId);
            return;
        }
        // Otherwise it's over a card — find which column that card belongs to
        const overColumn = findColumnForTask(overId);
        if (overColumn) {
            setOverColumnId(overColumn);
            // If dragging to different column, move immediately for visual feedback
            const activeColumn = findColumnForTask(active.id);
            if (activeColumn && activeColumn !== overColumn) {
                moveTask(active.id, overColumn);
            }
        }
    }, [findColumnForTask, moveTask]);
    const handleDragEnd = useCallback((event) => {
        const { active, over } = event;
        setActiveId(null);
        setOverColumnId(null);
        if (!over)
            return;
        const overId = over.id;
        const activeTaskId = active.id;
        // Determine target column
        const isColumn = COLUMNS.some((c) => c.key === overId);
        const targetColumn = isColumn ? overId : findColumnForTask(overId);
        if (!targetColumn)
            return;
        // Move to the target column if different
        const currentColumn = findColumnForTask(activeTaskId);
        if (currentColumn !== targetColumn) {
            moveTask(activeTaskId, targetColumn);
        }
        // Handle reordering within the same column
        if (currentColumn === targetColumn && !isColumn && overId !== activeTaskId) {
            const columnTasks = tasksByColumn[targetColumn];
            const oldIndex = columnTasks.findIndex((t) => t.id === activeTaskId);
            const newIndex = columnTasks.findIndex((t) => t.id === overId);
            if (oldIndex !== -1 && newIndex !== -1 && SKIP_AUTH) {
                const reordered = arrayMove(columnTasks, oldIndex, newIndex);
                setMockTasks((prev) => {
                    const otherTasks = prev.filter((t) => t.state !== targetColumn);
                    return [...otherTasks, ...reordered];
                });
            }
        }
    }, [findColumnForTask, moveTask, tasksByColumn]);
    const activeTask = useMemo(() => (activeId ? tasks.find((t) => t.id === activeId) ?? null : null), [activeId, tasks]);
    // ─── Render ───
    const apiSubjects = groupSubjectsQuery.data ?? [];
    const subjectOptions = [
        { value: '', label: 'Все предметы' },
        ...(SKIP_AUTH
            ? SUBJECTS.map((s) => ({ value: s.id, label: s.name }))
            : apiSubjects.map((s) => ({ value: s.id, label: s.name }))),
    ];
    return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between mb-4", children: [_jsx("h1", { className: "text-xl font-semibold text-surface-900 dark:text-surface-50", children: "\u0417\u0430\u0434\u0430\u043D\u0438\u044F" }), _jsx(Button, { variant: "primary", icon: _jsx(Icon, { name: "plus", size: 16 }), onClick: () => setCreateModalOpen(true), children: "\u0421\u043E\u0437\u0434\u0430\u0442\u044C" })] }), _jsxs("div", { className: "flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-surface-200 dark:border-surface-700", children: [_jsx("div", { className: "w-full sm:w-56", children: _jsx(SearchInput, { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\u041F\u043E\u0438\u0441\u043A..." }) }), _jsx("div", { className: "w-36", children: _jsx(Select, { options: subjectOptions, value: subjectFilter, onChange: setSubjectFilter }) }), _jsx("div", { className: "w-44", children: _jsx(Select, { options: DEADLINE_FILTER_OPTIONS, value: deadlineFilter, onChange: setDeadlineFilter }) })] }), !SKIP_AUTH && tasksQuery.isLoading && (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-4 gap-3", children: COLUMNS.map((col) => (_jsxs("div", { className: "rounded-lg bg-surface-50 dark:bg-surface-800/50 p-3 space-y-2", children: [_jsx("div", { className: "h-4 w-24 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" }), [1, 2, 3].map((i) => (_jsxs("div", { className: "rounded-md border border-surface-200 dark:border-surface-700 p-3 space-y-2", children: [_jsx("div", { className: "h-3 w-16 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" }), _jsx("div", { className: "h-4 w-full bg-surface-200 dark:bg-surface-700 rounded animate-pulse" }), _jsx("div", { className: "h-3 w-20 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" })] }, i)))] }, col.key))) })), !SKIP_AUTH && tasksQuery.error && (_jsxs("div", { className: "rounded-lg border border-danger-200 dark:border-danger-800/50 bg-danger-50/50 dark:bg-danger-950/20 p-6 text-center", children: [_jsx(Icon, { name: "alert-triangle", size: 32, className: "mx-auto text-danger-400 dark:text-danger-500 mb-2" }), _jsx("p", { className: "text-sm font-medium text-danger-700 dark:text-danger-300 mb-1", children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0437\u0430\u0434\u0430\u043D\u0438\u044F" }), _jsx("p", { className: "text-xs text-danger-500 dark:text-danger-400 mb-3", children: tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Произошла ошибка' }), _jsx(Button, { variant: "secondary", onClick: () => tasksQuery.refetch(), children: "\u041F\u043E\u043F\u0440\u043E\u0431\u043E\u0432\u0430\u0442\u044C \u0441\u043D\u043E\u0432\u0430" })] })), (SKIP_AUTH || (!tasksQuery.isLoading && !tasksQuery.error)) && (_jsxs(_Fragment, { children: [_jsx("div", { className: "flex md:hidden gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-lg mb-4", children: COLUMNS.map((col) => {
                            const count = tasksByColumn[col.key].length;
                            return (_jsxs("button", { onClick: () => setActiveColumn(col.key), className: clsx('flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors', activeColumn === col.key
                                    ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-50 shadow-sm'
                                    : 'text-surface-500 dark:text-surface-400'), children: [col.label, count > 0 && (_jsx("span", { className: "ml-1.5 text-xs text-surface-400 dark:text-surface-500", children: count }))] }, col.key));
                        }) }), _jsx("div", { className: "md:hidden space-y-3", children: tasksByColumn[activeColumn].length === 0 ? (_jsxs("div", { className: "rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-700 p-8 text-center", children: [_jsx(Icon, { name: "clipboard", size: 32, className: "mx-auto text-surface-300 dark:text-surface-600 mb-2" }), _jsx("p", { className: "text-sm text-surface-400 dark:text-surface-500", children: "\u041D\u0435\u0442 \u0437\u0430\u0434\u0430\u043D\u0438\u0439" })] })) : (tasksByColumn[activeColumn].map((task) => (_jsx(MobileCard, { task: task, columnState: activeColumn, onMove: moveTask, userVote: userVotes[task.assignment.id] ?? null, onVote: toggleVote, onClick: () => setSelectedTask(task) }, task.id)))) }), _jsx("div", { className: "hidden md:block", children: _jsxs(DndContext, { sensors: sensors, collisionDetection: closestCorners, onDragStart: handleDragStart, onDragOver: handleDragOver, onDragEnd: handleDragEnd, children: [_jsx("div", { className: "grid grid-cols-4 gap-3", children: COLUMNS.map((col) => (_jsx(BoardColumn, { state: col.key, label: col.label, tasks: tasksByColumn[col.key], userVotes: userVotes, onVote: toggleVote, onTaskClick: setSelectedTask, isOver: overColumnId === col.key }, col.key))) }), _jsx(DragOverlay, { children: activeTask ? (_jsx(BoardCard, { task: activeTask, userVote: userVotes[activeTask.assignment.id] ?? null, onVote: () => { }, isDragOverlay: true })) : null })] }) })] })), _jsx(AssignmentDetailModal, { task: selectedTask, onClose: () => setSelectedTask(null), onStateChange: (taskId, newState) => {
                    moveTask(taskId, newState);
                    setSelectedTask(null);
                }, onVote: (assignmentId, vote) => {
                    toggleVote(assignmentId, vote === 1 ? 'up' : 'down');
                }, userVote: selectedTask
                    ? userVotes[selectedTask.assignment.id] === 'up'
                        ? 1
                        : userVotes[selectedTask.assignment.id] === 'down'
                            ? -1
                            : null
                    : null }), _jsx(CreateAssignmentModal, { open: createModalOpen, onClose: () => setCreateModalOpen(false), onSubmit: handleCreateTask })] }));
}
