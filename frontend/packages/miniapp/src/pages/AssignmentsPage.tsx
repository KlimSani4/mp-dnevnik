import { useState } from 'react'
import {
  useAssignments,
  useCreateAssignment,
  useVoteAssignment,
  useGroupContext,
  useGroupSubjects,
} from '@nexora/shared'
import type { Assignment, Priority } from '@nexora/shared'

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочно',
}

const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  normal: '#6b7280',
  low: '#9ca3af',
}

function formatDeadline(deadline: string) {
  return new Date(deadline).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function AssignmentSkeleton() {
  return (
    <div style={{ marginBottom: 8 }}>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            background: 'var(--tg-theme-secondary-bg-color)',
            borderRadius: 12,
            padding: '12px 14px',
            marginBottom: 8,
            opacity: 0.5,
          }}
        >
          <div
            style={{
              height: 16,
              background: 'var(--tg-theme-hint-color)',
              borderRadius: 4,
              marginBottom: 8,
              width: '70%',
            }}
          />
          <div
            style={{
              height: 12,
              background: 'var(--tg-theme-hint-color)',
              borderRadius: 4,
              width: '40%',
            }}
          />
        </div>
      ))}
    </div>
  )
}

function AssignmentCard({
  assignment,
  onVote,
}: {
  assignment: Assignment
  onVote: (id: string, vote: 1 | -1) => void
}) {
  return (
    <div
      style={{
        background: 'var(--tg-theme-secondary-bg-color)',
        borderRadius: 12,
        padding: '12px 14px',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontWeight: 500,
              fontSize: 15,
              color: 'var(--tg-theme-text-color)',
              marginBottom: 2,
            }}
          >
            {assignment.title}
          </div>
          <div style={{ color: 'var(--tg-theme-hint-color)', fontSize: 13, marginBottom: 4 }}>
            {assignment.subject.name}
          </div>
          {assignment.description && (
            <div
              style={{
                color: 'var(--tg-theme-hint-color)',
                fontSize: 13,
                marginBottom: 4,
                lineHeight: 1.4,
              }}
            >
              {assignment.description}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                color: PRIORITY_COLORS[assignment.priority],
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {PRIORITY_LABELS[assignment.priority]}
            </span>
            <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: 12 }}>·</span>
            <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: 12 }}>
              до {formatDeadline(assignment.deadline)}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--tg-theme-hint-color)',
          opacity: 0.3,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => onVote(assignment.id, 1)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--tg-theme-hint-color)',
            fontSize: 13,
            padding: '2px 6px',
            borderRadius: 6,
          }}
        >
          👍 {assignment.votes_up}
        </button>
        <button
          onClick={() => onVote(assignment.id, -1)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--tg-theme-hint-color)',
            fontSize: 13,
            padding: '2px 6px',
            borderRadius: 6,
          }}
        >
          👎 {assignment.votes_down}
        </button>
        {assignment.is_verified && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              color: '#16a34a',
              fontWeight: 500,
            }}
          >
            ✓ Подтверждено
          </span>
        )}
      </div>
    </div>
  )
}

interface CreateFormState {
  title: string
  description: string
  deadline: string
  subject_id: string
  priority: Priority
}

const EMPTY_FORM: CreateFormState = {
  title: '',
  description: '',
  deadline: '',
  subject_id: '',
  priority: 'normal',
}

export function AssignmentsPage() {
  const { groupId, groupCode } = useGroupContext()
  const { data: assignments, isLoading } = useAssignments({
    group_id: groupId ?? '',
  })
  const { data: subjects } = useGroupSubjects(groupCode ?? undefined)
  const createAssignment = useCreateAssignment()
  const voteAssignment = useVoteAssignment()

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM)

  const handleVote = (id: string, vote: 1 | -1) => {
    voteAssignment.mutate({ id, data: { vote } })
  }

  const handleSubmit = () => {
    if (!form.title || !form.deadline || !form.subject_id || !groupId) return

    createAssignment.mutate(
      {
        group_id: groupId,
        subject_id: form.subject_id,
        title: form.title,
        description: form.description,
        deadline: new Date(form.deadline).toISOString(),
        priority: form.priority,
      },
      {
        onSuccess: () => {
          setForm(EMPTY_FORM)
          setShowForm(false)
        },
      }
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: 'var(--tg-theme-bg-color)',
    border: '1px solid var(--tg-theme-hint-color)',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 14,
    color: 'var(--tg-theme-text-color)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: '16px 12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: 'var(--tg-theme-text-color)',
          }}
        >
          Задания
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: 'var(--tg-theme-button-color)',
            color: 'var(--tg-theme-button-text-color)',
            border: 'none',
            borderRadius: 8,
            padding: '7px 14px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          {showForm ? 'Отмена' : '+ Дедлайн'}
        </button>
      </div>

      {showForm && (
        <div
          style={{
            background: 'var(--tg-theme-secondary-bg-color)',
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--tg-theme-text-color)',
              marginBottom: 12,
            }}
          >
            Новый дедлайн
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              placeholder="Название"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={inputStyle}
            />

            <textarea
              placeholder="Описание (необязательно)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              style={{ ...inputStyle, resize: 'none' }}
            />

            <input
              type="date"
              value={form.deadline}
              onChange={(e) => setForm({ ...form, deadline: e.target.value })}
              style={inputStyle}
            />

            <select
              value={form.subject_id}
              onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
              style={inputStyle}
            >
              <option value="">Выберите предмет</option>
              {(subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={form.priority}
              onChange={(e) => setForm({ ...form, priority: e.target.value as Priority })}
              style={inputStyle}
            >
              <option value="low">Низкий</option>
              <option value="normal">Обычный</option>
              <option value="high">Высокий</option>
              <option value="urgent">Срочно</option>
            </select>

            <button
              onClick={handleSubmit}
              disabled={createAssignment.isPending || !form.title || !form.deadline || !form.subject_id}
              style={{
                background: 'var(--tg-theme-button-color)',
                color: 'var(--tg-theme-button-text-color)',
                border: 'none',
                borderRadius: 8,
                padding: '11px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: createAssignment.isPending || !form.title || !form.deadline || !form.subject_id ? 0.6 : 1,
              }}
            >
              {createAssignment.isPending ? 'Сохранение...' : 'Добавить'}
            </button>
          </div>
        </div>
      )}

      {isLoading && <AssignmentSkeleton />}

      {!isLoading && (!assignments || assignments.length === 0) && (
        <p
          style={{
            color: 'var(--tg-theme-hint-color)',
            textAlign: 'center',
            paddingTop: 48,
            fontSize: 15,
          }}
        >
          Дедлайнов нет
        </p>
      )}

      {(assignments ?? []).map((a) => (
        <AssignmentCard key={a.id} assignment={a} onVote={handleVote} />
      ))}
    </div>
  )
}
