import { useTasks, useUpdateTask, useGroupContext } from '@nexora/shared'
import type { Task, TaskState } from '@nexora/shared'

const STATE_LABELS: Record<TaskState, string> = {
  todo: 'Нужно сделать',
  review: 'На проверке',
  done: 'Зачтено',
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  normal: '#6b7280',
  low: '#9ca3af',
}

function formatDeadline(deadline: string) {
  const d = new Date(deadline)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function TaskCard({ task, onSubmit }: { task: Task; onSubmit: (id: string) => void }) {
  const { assignment, state } = task
  const isDone = state === 'done'
  const isReview = state === 'review'

  return (
    <div
      style={{
        background: 'var(--tg-theme-secondary-bg-color)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 500,
              color: 'var(--tg-theme-text-color)',
              fontSize: 15,
              marginBottom: 2,
            }}
          >
            {assignment.title}
          </div>
          <div style={{ color: 'var(--tg-theme-hint-color)', fontSize: 13, marginBottom: 4 }}>
            {assignment.subject.name}
          </div>
          <div
            style={{
              color: PRIORITY_COLORS[assignment.priority] || '#6b7280',
              fontSize: 12,
            }}
          >
            до {formatDeadline(assignment.deadline)}
          </div>
        </div>

        <div style={{ flexShrink: 0, marginTop: 2 }}>
          {isDone || isReview ? (
            <span
              style={{
                background: isDone ? '#16a34a22' : '#ca8a0422',
                color: isDone ? '#16a34a' : '#ca8a04',
                borderRadius: 8,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {isDone ? 'Зачтено' : 'На проверке'}
            </span>
          ) : (
            <button
              onClick={() => onSubmit(assignment.id)}
              style={{
                background: 'var(--tg-theme-button-color)',
                color: 'var(--tg-theme-button-text-color)',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Сдать
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
      <div
        style={{
          width: 28,
          height: 28,
          border: '3px solid var(--tg-theme-hint-color)',
          borderTopColor: 'var(--tg-theme-button-color)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const GROUPS: Array<{ state: TaskState; label: string }> = [
  { state: 'todo', label: 'Нужно сделать' },
  { state: 'review', label: 'На проверке' },
  { state: 'done', label: 'Зачтено' },
]

export function TasksPage() {
  const { groupId } = useGroupContext()
  const { data: tasks, isLoading } = useTasks({ group_id: groupId ?? '' })
  const updateTask = useUpdateTask()

  const handleSubmit = (assignmentId: string) => {
    updateTask.mutate({ assignmentId, data: { state: 'review' } })
  }

  const grouped = GROUPS.map(({ state, label }) => ({
    state,
    label,
    items: (tasks ?? []).filter((t) => t.state === state),
  })).filter(({ items }) => items.length > 0)

  return (
    <div style={{ padding: '16px 12px' }}>
      <h1
        style={{
          fontSize: 20,
          fontWeight: 600,
          color: 'var(--tg-theme-text-color)',
          marginBottom: 16,
        }}
      >
        Мои задачи
      </h1>

      {isLoading && <Spinner />}

      {!isLoading && (!tasks || tasks.length === 0) && (
        <p
          style={{
            color: 'var(--tg-theme-hint-color)',
            textAlign: 'center',
            paddingTop: 48,
            fontSize: 15,
          }}
        >
          Заданий нет
        </p>
      )}

      {grouped.map(({ state, label, items }) => (
        <div key={state} style={{ marginBottom: 20 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--tg-theme-hint-color)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 8,
            }}
          >
            {label} · {items.length}
          </div>
          {items.map((task) => (
            <TaskCard key={task.id} task={task} onSubmit={handleSubmit} />
          ))}
        </div>
      ))}
    </div>
  )
}
