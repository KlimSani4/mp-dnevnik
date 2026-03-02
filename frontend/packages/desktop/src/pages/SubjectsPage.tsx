import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { Card, Badge, ProgressBar, Icon } from '../components/ui'

interface AssignmentGroup {
  type: string
  done: number
  total: number
}

interface SubjectData {
  id: string
  name: string
  short_name: string
  teacher: string
  assignments: AssignmentGroup[]
  control: string
}

const MOCK_SUBJECTS: SubjectData[] = [
  {
    id: 'matan',
    name: 'Математический анализ',
    short_name: 'Матан',
    teacher: 'Петров А. И.',
    assignments: [
      { type: 'лаб', done: 6, total: 8 },
      { type: 'ПЗ', done: 3, total: 4 },
    ],
    control: 'экзамен',
  },
  {
    id: 'linalg',
    name: 'Линейная алгебра',
    short_name: 'Линал',
    teacher: 'Сидорова Е. В.',
    assignments: [
      { type: 'лаб', done: 4, total: 4 },
      { type: 'ПЗ', done: 3, total: 3 },
    ],
    control: 'экзамен',
  },
  {
    id: 'physics',
    name: 'Физика',
    short_name: 'Физика',
    teacher: 'Козлов Д. М.',
    assignments: [
      { type: 'лаб', done: 2, total: 6 },
    ],
    control: 'экзамен',
  },
  {
    id: 'programming',
    name: 'Программирование',
    short_name: 'Прога',
    teacher: 'Иванов С. К.',
    assignments: [
      { type: 'лаб', done: 5, total: 6 },
      { type: 'ПЗ', done: 2, total: 2 },
    ],
    control: 'экзамен',
  },
  {
    id: 'mathlogic',
    name: 'Математическая логика',
    short_name: 'Мат. логика',
    teacher: 'Фёдорова Н. А.',
    assignments: [
      { type: 'ПЗ', done: 3, total: 5 },
    ],
    control: 'зачёт',
  },
  {
    id: 'english',
    name: 'Английский язык',
    short_name: 'Англ. яз.',
    teacher: 'Смирнова О. Л.',
    assignments: [
      { type: 'ПЗ', done: 7, total: 8 },
    ],
    control: 'зачёт',
  },
  {
    id: 'history',
    name: 'История',
    short_name: 'История',
    teacher: 'Орлов В. П.',
    assignments: [
      { type: 'ПЗ', done: 3, total: 3 },
    ],
    control: 'зачёт',
  },
  {
    id: 'discrete',
    name: 'Дискретная математика',
    short_name: 'Дискретка',
    teacher: 'Белов Г. Р.',
    assignments: [
      { type: 'лаб', done: 4, total: 7 },
      { type: 'ПЗ', done: 2, total: 3 },
    ],
    control: 'экзамен',
  },
]

function getSubjectProgress(subject: SubjectData) {
  const totalDone = subject.assignments.reduce((sum, a) => sum + a.done, 0)
  const totalAll = subject.assignments.reduce((sum, a) => sum + a.total, 0)
  if (totalAll === 0) return 100
  return Math.round((totalDone / totalAll) * 100)
}

function formatAssignments(assignments: AssignmentGroup[]): string {
  return assignments
    .map((a) => `${a.done}/${a.total} ${a.type}`)
    .join(', ')
}

function isAdmitted(progress: number): boolean {
  return progress >= 70
}

export function SubjectsPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-surface-900 dark:text-surface-50">
            Мои предметы
          </h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-1">
            Весенний семестр 2025/2026 — {MOCK_SUBJECTS.length} предметов
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {MOCK_SUBJECTS.map((subject) => {
          const progress = getSubjectProgress(subject)
          const admitted = isAdmitted(progress)

          return (
            <Link
              key={subject.id}
              to={`/assignments?subject=${subject.id}`}
              className="block group"
            >
              <Card
                variant="hover"
                className="h-full transition-shadow group-hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-base font-semibold text-surface-900 dark:text-surface-50 truncate">
                        {subject.name}
                      </h3>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-surface-500 dark:text-surface-400">
                      <Icon name="users" size={14} className="shrink-0" />
                      <span className="truncate">{subject.teacher}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={admitted ? 'success' : 'urgent'}>
                      {admitted ? 'ДОПУСК' : 'НЕДОПУСК'}
                    </Badge>
                    <Icon
                      name="chevron-right"
                      size={18}
                      className="text-surface-400 dark:text-surface-500 group-hover:text-primary-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <ProgressBar
                    value={progress}
                    color={admitted ? 'success' : 'danger'}
                    showLabel
                    trend={formatAssignments(subject.assignments)}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {subject.assignments.map((a) => (
                      <span
                        key={a.type}
                        className={clsx(
                          'text-xs',
                          a.done === a.total
                            ? 'text-success-500'
                            : 'text-surface-500 dark:text-surface-400'
                        )}
                      >
                        <Icon
                          name={a.done === a.total ? 'check' : 'file'}
                          size={12}
                          className="inline-block mr-1 -mt-px"
                        />
                        {a.type}: {a.done}/{a.total}
                      </span>
                    ))}
                  </div>
                  <span className="text-xs text-surface-400 dark:text-surface-500 capitalize">
                    {subject.control}
                  </span>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
