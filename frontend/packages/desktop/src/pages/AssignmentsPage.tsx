import { useState, useMemo, useCallback } from 'react'
import {
  useTasks,
  useUpdateTask,
  useVoteAssignment,
  useCreateAssignment,
  useGroupContext,
  useGroupSubjects,
} from '@nexora/shared'
import clsx from 'clsx'
import { startOfDay, addDays, isBefore } from 'date-fns'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button, Badge, Icon, Modal, Select, SearchInput, Input } from '../components/ui'
import { AssignmentDetailModal } from '../components/AssignmentDetailModal'
import {
  type Priority,
  type TaskState,
  type Task,
  SUBJECTS,
  AUTHORS,
  COLUMNS,
  PRIORITY_LABELS,
  PRIORITY_BADGE_VARIANT,
  DEADLINE_FILTER_OPTIONS,
  COLUMN_COLORS,
  COLUMN_COUNT_COLORS,
  PRIORITY_BORDER_COLORS,
  today,
  isBurning,
  isOverdue,
  formatDeadline,
  daysLeft,
  getDayWord,
  createMockTasks,
} from '../types/assignments'

/* ─── Board Card ─── */

interface BoardCardProps {
  task: Task
  userVote: 'up' | 'down' | null
  onVote: (assignmentId: string, direction: 'up' | 'down') => void
  onClick?: () => void
  isDragOverlay?: boolean
}

function BoardCard({ task, userVote, onVote, onClick, isDragOverlay }: BoardCardProps) {
  const { assignment } = task
  const burning = isBurning(assignment.deadline)
  const overdue = isOverdue(assignment.deadline)
  const days = daysLeft(assignment.deadline)
  const isDone = task.state === 'done'
  const isExpired = overdue && !isDone

  return (
    <div
      onClick={onClick}
      className={clsx(
        'group relative rounded-md border cursor-pointer transition-all duration-150',
        'border-l-[3px]',
        isDone
          ? 'bg-surface-50 dark:bg-surface-800/60 border-surface-200 dark:border-surface-700 border-l-success-400 dark:border-l-success-600'
          : isExpired
            ? 'bg-danger-50/50 dark:bg-danger-950/20 border-danger-200 dark:border-danger-800/50 border-l-danger-500'
            : 'bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700 shadow-sm',
        !isDone && !isExpired && PRIORITY_BORDER_COLORS[assignment.priority],
        isDragOverlay
          ? 'shadow-xl opacity-90 rotate-[2deg] scale-105'
          : !isDone && 'hover:shadow-md hover:border-surface-300 dark:hover:border-surface-600',
      )}
    >
      {/* Drag handle */}
      {!isDragOverlay && (
        <div className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-surface-400 dark:text-surface-500 pointer-events-none">
          <Icon name="grip-vertical" size={12} strokeWidth={3} />
        </div>
      )}

      <div className={clsx('px-2.5 py-2 pl-4', isDone && 'opacity-70')}>
        {/* Row 1: Subject chip + Verified + Link */}
        <div className="flex items-center gap-1 mb-1">
          <span className={clsx(
            'text-[10px] font-medium px-1.5 py-0.5 rounded truncate max-w-[70%]',
            isDone
              ? 'text-surface-500 dark:text-surface-400 bg-surface-100 dark:bg-surface-700/50'
              : isExpired
                ? 'text-danger-600 dark:text-danger-400 bg-danger-50 dark:bg-danger-500/10'
                : 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-500/10',
          )}>
            {assignment.subject.name}
          </span>
          {assignment.is_verified && (
            <Icon name="check" size={10} className="text-success-500 dark:text-success-400 flex-shrink-0" />
          )}
          {assignment.link && (
            <a
              href={assignment.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-info-500 hover:text-info-600 transition-colors ml-auto flex-shrink-0"
            >
              <Icon name="link" size={10} />
            </a>
          )}
        </div>

        {/* Row 2: Title */}
        <h3 className={clsx(
          'text-[13px] font-semibold leading-snug line-clamp-2 mb-1',
          isDone
            ? 'text-surface-500 dark:text-surface-400 line-through decoration-surface-300 dark:decoration-surface-600'
            : isExpired
              ? 'text-danger-800 dark:text-danger-300'
              : 'text-surface-900 dark:text-surface-50',
        )}>
          {assignment.title}
        </h3>

        {/* Row 3: Deadline compact */}
        {isDone ? (
          <div className="flex items-center gap-1 text-[10px] font-medium mb-1.5 text-success-500 dark:text-success-400">
            <Icon name="check" size={10} />
            <span>Сдано</span>
          </div>
        ) : (
          <div
            className={clsx(
              'flex items-center gap-1 text-[10px] font-medium mb-1.5',
              overdue || burning
                ? 'text-danger-500'
                : 'text-surface-500 dark:text-surface-400',
            )}
          >
            <Icon name={overdue ? 'alert-triangle' : 'clock'} size={10} />
            {overdue ? (
              <span className="font-bold">Просрочено {Math.abs(days)} {getDayWord(days)}</span>
            ) : days <= 0 ? (
              <span>Сегодня</span>
            ) : burning ? (
              <span>{days} {getDayWord(days)} — горит</span>
            ) : (
              <span>{days} {getDayWord(days)}</span>
            )}
          </div>
        )}

        {/* Row 4: Footer — avatar, priority badge, votes */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded-full bg-surface-200 dark:bg-surface-600 flex items-center justify-center flex-shrink-0">
              <span className="text-[9px] font-medium text-surface-600 dark:text-surface-300">
                {(AUTHORS[assignment.author_id] ?? assignment.author_id ?? '?')[0]?.toUpperCase()}
              </span>
            </div>
            {!isDone && (
              <Badge variant={PRIORITY_BADGE_VARIANT[assignment.priority]} size="sm">
                {PRIORITY_LABELS[assignment.priority]}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onVote(assignment.id, 'up')
              }}
              className={clsx(
                'flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] transition-colors',
                userVote === 'up'
                  ? 'text-success-600 bg-success-50 dark:bg-success-500/10'
                  : 'text-surface-400 hover:text-success-500 hover:bg-surface-100 dark:hover:bg-surface-700',
              )}
            >
              <Icon name="thumbs-up" size={10} />
              <span>{assignment.votes_up}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onVote(assignment.id, 'down')
              }}
              className={clsx(
                'flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] transition-colors',
                userVote === 'down'
                  ? 'text-danger-600 bg-danger-50 dark:bg-danger-500/10'
                  : 'text-surface-400 hover:text-danger-500 hover:bg-surface-100 dark:hover:bg-surface-700',
              )}
            >
              <Icon name="thumbs-down" size={10} />
              <span>{assignment.votes_down}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Sortable Card Wrapper ─── */

interface SortableBoardCardProps {
  task: Task
  userVote: 'up' | 'down' | null
  onVote: (assignmentId: string, direction: 'up' | 'down') => void
  onTaskClick: (task: Task) => void
}

function SortableBoardCard({ task, userVote, onVote, onTaskClick }: SortableBoardCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={clsx(isDragging && 'opacity-30')}
    >
      <BoardCard
        task={task}
        userVote={userVote}
        onVote={onVote}
        onClick={() => onTaskClick(task)}
      />
    </div>
  )
}

/* ─── Board Column ─── */

interface BoardColumnProps {
  state: TaskState
  label: string
  tasks: Task[]
  userVotes: Record<string, 'up' | 'down' | null>
  onVote: (assignmentId: string, direction: 'up' | 'down') => void
  onTaskClick: (task: Task) => void
  isOver?: boolean
}

function BoardColumn({ state, label, tasks, userVotes, onVote, onTaskClick, isOver }: BoardColumnProps) {
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])

  return (
    <div
      className={clsx(
        'flex flex-col rounded-lg bg-surface-50 dark:bg-surface-800/50 border-t-[3px] min-w-0',
        COLUMN_COLORS[state] ?? 'border-t-surface-300',
        isOver && 'ring-2 ring-primary-400/50',
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-2 py-2">
        <h2 className="text-[11px] font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wider truncate">
          {label}
        </h2>
        <span className={clsx(
          'text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center flex-shrink-0',
          COLUMN_COUNT_COLORS[state] ?? 'bg-surface-200/70 text-surface-500',
        )}>
          {tasks.length}
        </span>
      </div>

      {/* Cards area */}
      <div className="px-1.5 pb-1.5 space-y-1.5 min-h-[120px] max-h-[calc(100vh-220px)] overflow-y-auto scrollbar-thin">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-surface-400 dark:text-surface-500">
              <Icon name="clipboard" size={28} className="mb-1.5 opacity-50" />
              <p className="text-xs">Нет заданий</p>
            </div>
          ) : (
            tasks.map((task) => (
              <SortableBoardCard
                key={task.id}
                task={task}
                userVote={userVotes[task.assignment.id] ?? null}
                onVote={onVote}
                onTaskClick={onTaskClick}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  )
}

/* ─── Mobile Card (with action buttons) ─── */

interface MobileCardProps {
  task: Task
  columnState: TaskState
  onMove: (taskId: string, newState: TaskState) => void
  userVote: 'up' | 'down' | null
  onVote: (assignmentId: string, direction: 'up' | 'down') => void
  onClick: () => void
}

function MobileCard({ task, columnState, onMove, userVote, onVote, onClick }: MobileCardProps) {
  return (
    <div>
      <BoardCard task={task} userVote={userVote} onVote={onVote} onClick={onClick} />
      {columnState !== 'done' && (
        <div className="flex mt-[-1px] rounded-b-lg border border-t-0 border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden">
          {columnState === 'todo' && (
            <button
              onClick={() => onMove(task.id, 'review')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors"
            >
              <Icon name="chevron-right" size={14} />
              Сдал
            </button>
          )}
          {columnState === 'review' && (
            <>
              <button
                onClick={() => onMove(task.id, 'todo')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors border-r border-surface-200 dark:border-surface-700"
              >
                <Icon name="chevron-left" size={14} />
                Вернуть
              </button>
              <button
                onClick={() => onMove(task.id, 'done')}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10 transition-colors"
              >
                <Icon name="check" size={14} />
                Зачтено
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Create Assignment Modal ─── */

interface CreateAssignmentModalProps {
  open: boolean
  onClose: () => void
  subjects: { id: string; name: string }[]
  onSubmit: (data: {
    subjectId: string
    title: string
    description: string
    deadline: string
    priority: Priority
  }) => void
}

function CreateAssignmentModal({ open, onClose, subjects, onSubmit }: CreateAssignmentModalProps) {
  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState<string>('normal')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const resetForm = useCallback(() => {
    setSubjectId('')
    setTitle('')
    setDescription('')
    setDeadline('')
    setPriority('normal')
    setErrors({})
  }, [])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [onClose, resetForm])

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}
    if (!subjectId) newErrors.subjectId = 'Выберите предмет'
    if (!title.trim()) newErrors.title = 'Введите название'
    if (!deadline) newErrors.deadline = 'Укажите дедлайн'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [subjectId, title, description, deadline])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!validate()) return
      onSubmit({
        subjectId,
        title: title.trim(),
        description: description.trim(),
        deadline,
        priority: priority as Priority,
      })
      resetForm()
    },
    [subjectId, title, description, deadline, priority, validate, onSubmit, resetForm],
  )

  const subjectOptions = subjects.map((s) => ({ value: s.id, label: s.name }))
  const priorityOptions = [
    { value: 'low', label: 'Низкий' },
    { value: 'normal', label: 'Обычный' },
    { value: 'high', label: 'Высокий' },
    { value: 'urgent', label: 'Срочный' },
  ]

  return (
    <Modal open={open} onClose={handleClose} title="Создать задание">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Предмет"
          options={subjectOptions}
          value={subjectId}
          onChange={setSubjectId}
          placeholder="Выберите предмет"
          error={errors.subjectId}
        />
        <Input
          label="Название"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Например: ПЗ №5 — Графы"
          error={errors.title}
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="create-description"
            className="text-sm font-medium text-surface-700 dark:text-surface-300"
          >
            Описание
          </label>
          <textarea
            id="create-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Что нужно сделать..."
            rows={3}
            className={clsx(
              'input resize-none',
              errors.description && 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500',
            )}
          />
          {errors.description && (
            <p className="text-xs text-danger-500">{errors.description}</p>
          )}
        </div>
        <Input
          label="Дедлайн"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          error={errors.deadline}
        />
        <Select
          label="Приоритет"
          options={priorityOptions}
          value={priority}
          onChange={setPriority}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" type="button" onClick={handleClose}>
            Отмена
          </Button>
          <Button variant="primary" type="submit">
            Создать
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ─── Main Component ─── */

export function AssignmentsPage() {
  const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

  // ─── API hooks (always called, conditional use) ───
  const { groupId, groupCode } = useGroupContext()
  const tasksQuery = useTasks({ group_id: SKIP_AUTH ? '' : (groupId ?? '') })
  const updateTaskMutation = useUpdateTask()
  const voteAssignmentMutation = useVoteAssignment()
  const createAssignmentMutation = useCreateAssignment()
  const groupSubjectsQuery = useGroupSubjects(SKIP_AUTH ? undefined : (groupCode ?? undefined))

  // Mock state (only used when SKIP_AUTH)
  const [mockTasks, setMockTasks] = useState<Task[]>(createMockTasks)

  // The active tasks source
  const tasks = SKIP_AUTH ? mockTasks : (tasksQuery.data ?? [])

  // Filters
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState('')

  // Mobile column selector
  const [activeColumn, setActiveColumn] = useState<TaskState>('todo')

  // Create modal
  const [createModalOpen, setCreateModalOpen] = useState(false)

  // Votes
  const [userVotes, setUserVotes] = useState<Record<string, 'up' | 'down' | null>>({})

  // Detail modal
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  )

  // ─── Filtering ───

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (search) {
        const q = search.toLowerCase()
        const matchesTitle = task.assignment.title.toLowerCase().includes(q)
        const matchesDesc = task.assignment.description.toLowerCase().includes(q)
        const matchesSubject = task.assignment.subject.name.toLowerCase().includes(q)
        if (!matchesTitle && !matchesDesc && !matchesSubject) return false
      }
      if (subjectFilter && task.assignment.subject.id !== subjectFilter) return false
      if (deadlineFilter === 'burning') {
        const dl = startOfDay(new Date(task.assignment.deadline))
        const endOfWeek = addDays(today(), 7)
        if (!isBefore(dl, endOfWeek)) return false
      }
      if (deadlineFilter === 'this-month') {
        const dl = new Date(task.assignment.deadline)
        const now = new Date()
        if (dl.getMonth() !== now.getMonth() || dl.getFullYear() !== now.getFullYear()) return false
      }
      if (deadlineFilter === 'hide-overdue') {
        if (task.state !== 'done' && isOverdue(task.assignment.deadline)) return false
      }
      return true
    })
  }, [tasks, search, subjectFilter, deadlineFilter])

  const tasksByColumn = useMemo(() => {
    const grouped: Record<TaskState, Task[]> = { todo: [], review: [], done: [] }
    for (const task of filteredTasks) {
      grouped[task.state].push(task)
    }
    return grouped
  }, [filteredTasks])

  // ─── Actions ───

  const moveTask = useCallback((taskId: string, newState: TaskState) => {
    if (SKIP_AUTH) {
      setMockTasks((prev) =>
        prev.map((t) =>
          t.id === taskId ? { ...t, state: newState, updated_at: new Date().toISOString() } : t,
        ),
      )
    } else {
      const task = tasks.find((t) => t.id === taskId)
      if (!task) return
      updateTaskMutation.mutate({ assignmentId: task.assignment.id, data: { state: newState } })
    }
  }, [SKIP_AUTH, tasks, updateTaskMutation])

  const toggleVote = useCallback(
    (assignmentId: string, direction: 'up' | 'down') => {
      if (SKIP_AUTH) {
        const current = userVotes[assignmentId] ?? null
        setUserVotes((prev) => ({
          ...prev,
          [assignmentId]: current === direction ? null : direction,
        }))
        setMockTasks((prev) =>
          prev.map((t) => {
            if (t.assignment.id !== assignmentId) return t
            const a = { ...t.assignment }
            if (current === 'up') a.votes_up -= 1
            if (current === 'down') a.votes_down -= 1
            if (current !== direction) {
              if (direction === 'up') a.votes_up += 1
              if (direction === 'down') a.votes_down += 1
            }
            return { ...t, assignment: a }
          }),
        )
      } else {
        voteAssignmentMutation.mutate({
          id: assignmentId,
          data: { vote: direction === 'up' ? 1 : -1 },
        })
      }
    },
    [SKIP_AUTH, userVotes, voteAssignmentMutation],
  )

  const handleCreateTask = useCallback(
    (data: { subjectId: string; title: string; description: string; deadline: string; priority: Priority }) => {
      if (SKIP_AUTH) {
        const subject = SUBJECTS.find((s) => s.id === data.subjectId)
        if (!subject) return
        const newTask: Task = {
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
        }
        setMockTasks((prev) => [newTask, ...prev])
      } else {
        createAssignmentMutation.mutate({
          group_id: groupId!,
          subject_id: data.subjectId,
          title: data.title,
          description: data.description,
          deadline: new Date(data.deadline).toISOString(),
          priority: data.priority,
        })
      }
      setCreateModalOpen(false)
    },
    [SKIP_AUTH, groupId, createAssignmentMutation],
  )

  // ─── DnD Handlers ───

  const findColumnForTask = useCallback(
    (taskId: string): TaskState | null => {
      for (const col of COLUMNS) {
        if (tasksByColumn[col.key].some((t) => t.id === taskId)) {
          return col.key
        }
      }
      return null
    },
    [tasksByColumn],
  )

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string)
  }, [])

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over } = event
      if (!over) {
        setOverColumnId(null)
        return
      }

      const overId = over.id as string

      // Check if hovering over a column droppable
      const isColumn = COLUMNS.some((c) => c.key === overId)
      if (isColumn) {
        setOverColumnId(overId)
        return
      }

      // Otherwise it's over a card — find which column that card belongs to.
      // Note: we deliberately do NOT call moveTask here; movement only happens on drop.
      const overColumn = findColumnForTask(overId)
      if (overColumn) {
        setOverColumnId(overColumn)
      }
    },
    [findColumnForTask],
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      setActiveId(null)
      setOverColumnId(null)

      if (!over) return

      const overId = over.id as string
      const activeTaskId = active.id as string

      // Determine target column
      const isColumn = COLUMNS.some((c) => c.key === overId)
      const targetColumn = isColumn ? (overId as TaskState) : findColumnForTask(overId)

      if (!targetColumn) return

      // Move to the target column if different
      const currentColumn = findColumnForTask(activeTaskId)
      if (currentColumn !== targetColumn) {
        moveTask(activeTaskId, targetColumn)
      }

      // Handle reordering within the same column
      if (currentColumn === targetColumn && !isColumn && overId !== activeTaskId) {
        const columnTasks = tasksByColumn[targetColumn]
        const oldIndex = columnTasks.findIndex((t) => t.id === activeTaskId)
        const newIndex = columnTasks.findIndex((t) => t.id === overId)

        if (oldIndex !== -1 && newIndex !== -1 && SKIP_AUTH) {
          const reordered = arrayMove(columnTasks, oldIndex, newIndex)
          setMockTasks((prev) => {
            const otherTasks = prev.filter((t) => t.state !== targetColumn)
            return [...otherTasks, ...reordered]
          })
        }
      }
    },
    [findColumnForTask, moveTask, tasksByColumn],
  )

  const activeTask = useMemo(
    () => (activeId ? tasks.find((t) => t.id === activeId) ?? null : null),
    [activeId, tasks],
  )

  // ─── Render ───

  const apiSubjects = groupSubjectsQuery.data ?? []
  const subjectOptions = [
    { value: '', label: 'Все предметы' },
    ...(SKIP_AUTH
      ? SUBJECTS.map((s) => ({ value: s.id, label: s.name }))
      : apiSubjects.map((s) => ({ value: s.id, label: s.name }))
    ),
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-surface-900 dark:text-surface-50">
          Задания
        </h1>
        <Button
          variant="primary"
          icon={<Icon name="plus" size={16} />}
          onClick={() => setCreateModalOpen(true)}
        >
          Создать
        </Button>
      </div>

      {/* Quick Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-surface-200 dark:border-surface-700">
        <div className="w-full sm:w-56">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
          />
        </div>
        <div className="w-36">
          <Select
            options={subjectOptions}
            value={subjectFilter}
            onChange={setSubjectFilter}
          />
        </div>
        <div className="w-44">
          <Select
            options={DEADLINE_FILTER_OPTIONS}
            value={deadlineFilter}
            onChange={setDeadlineFilter}
          />
        </div>
      </div>

      {/* API Loading State */}
      {!SKIP_AUTH && tasksQuery.isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {COLUMNS.map((col) => (
            <div key={col.key} className="rounded-lg bg-surface-50 dark:bg-surface-800/50 p-3 space-y-2">
              <div className="h-4 w-24 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-md border border-surface-200 dark:border-surface-700 p-3 space-y-2">
                  <div className="h-3 w-16 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
                  <div className="h-4 w-full bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
                  <div className="h-3 w-20 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* API Error State */}
      {!SKIP_AUTH && tasksQuery.error && (
        <div className="rounded-lg border border-danger-200 dark:border-danger-800/50 bg-danger-50/50 dark:bg-danger-950/20 p-6 text-center">
          <Icon name="alert-triangle" size={32} className="mx-auto text-danger-400 dark:text-danger-500 mb-2" />
          <p className="text-sm font-medium text-danger-700 dark:text-danger-300 mb-1">
            Не удалось загрузить задания
          </p>
          <p className="text-xs text-danger-500 dark:text-danger-400 mb-3">
            {tasksQuery.error instanceof Error ? tasksQuery.error.message : 'Произошла ошибка'}
          </p>
          <Button variant="secondary" onClick={() => tasksQuery.refetch()}>
            Попробовать снова
          </Button>
        </div>
      )}

      {/* Board content — hidden when API is loading or errored */}
      {(SKIP_AUTH || (!tasksQuery.isLoading && !tasksQuery.error)) && (
        <>
          {/* Mobile: Column Tabs */}
          <div className="flex md:hidden gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-lg mb-4">
            {COLUMNS.map((col) => {
              const count = tasksByColumn[col.key].length
              return (
                <button
                  key={col.key}
                  onClick={() => setActiveColumn(col.key)}
                  className={clsx(
                    'flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    activeColumn === col.key
                      ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-50 shadow-sm'
                      : 'text-surface-500 dark:text-surface-400',
                  )}
                >
                  {col.label}
                  {count > 0 && (
                    <span className="ml-1.5 text-xs text-surface-400 dark:text-surface-500">
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Mobile: Single column (no DnD) */}
          <div className="md:hidden space-y-3">
            {tasksByColumn[activeColumn].length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-surface-200 dark:border-surface-700 p-8 text-center">
                <Icon name="clipboard" size={32} className="mx-auto text-surface-300 dark:text-surface-600 mb-2" />
                <p className="text-sm text-surface-400 dark:text-surface-500">Нет заданий</p>
              </div>
            ) : (
              tasksByColumn[activeColumn].map((task) => (
                <MobileCard
                  key={task.id}
                  task={task}
                  columnState={activeColumn}
                  onMove={moveTask}
                  userVote={userVotes[task.assignment.id] ?? null}
                  onVote={toggleVote}
                  onClick={() => setSelectedTask(task)}
                />
              ))
            )}
          </div>

          {/* Desktop: 3-column kanban with DnD */}
          <div className="hidden md:block">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-3 gap-3">
                {COLUMNS.map((col) => (
                  <BoardColumn
                    key={col.key}
                    state={col.key}
                    label={col.label}
                    tasks={tasksByColumn[col.key]}
                    userVotes={userVotes}
                    onVote={toggleVote}
                    onTaskClick={setSelectedTask}
                    isOver={overColumnId === col.key}
                  />
                ))}
              </div>

              <DragOverlay>
                {activeTask ? (
                  <BoardCard
                    task={activeTask}
                    userVote={userVotes[activeTask.assignment.id] ?? null}
                    onVote={() => {}}
                    isDragOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </>
      )}

      {/* Assignment Detail Modal */}
      <AssignmentDetailModal
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onStateChange={(taskId, newState) => {
          moveTask(taskId, newState)
          setSelectedTask(null)
        }}
        onVote={(assignmentId, vote) => {
          toggleVote(assignmentId, vote === 1 ? 'up' : 'down')
        }}
        userVote={
          selectedTask
            ? userVotes[selectedTask.assignment.id] === 'up'
              ? 1
              : userVotes[selectedTask.assignment.id] === 'down'
                ? -1
                : null
            : null
        }
      />

      {/* Create Assignment Modal */}
      <CreateAssignmentModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        subjects={SKIP_AUTH ? SUBJECTS : apiSubjects}
        onSubmit={handleCreateTask}
      />
    </div>
  )
}
