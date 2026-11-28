/**
 * Создание задания — оно же работа (#165): лаба, практика, ДЗ… — это задание с типом.
 * Используется на доске «Заданий» и на странице предмета.
 */
import { useCallback, useEffect, useState } from 'react'
import clsx from 'clsx'
import { useCreateCustomSubject } from '@nexora/shared'
import type { AssignmentCreateRequest } from '@nexora/shared'
import { Button, DatePicker, Dropdown, Icon, Input, Modal } from './ui'
import { PriorityDropdown } from './PriorityDropdown'
import { useT, type MessageKey } from '../i18n'
import { WORK_KINDS, type Priority, type WorkKind } from '../types/assignments'

export interface CreateAssignmentData {
  subjectId: string
  title: string
  description: string
  /** YYYY-MM-DD или пусто — без дедлайна */
  deadline: string
  priority: Priority
  link?: string
  teacher_contact?: string
  submission_link?: string
  is_personal: boolean
  max_points: number | null
  kind: WorkKind | null
  number: number | null
}

interface CreateAssignmentModalProps {
  open: boolean
  onClose: () => void
  subjects: { id: string; name: string }[]
  groupCode: string | null
  onSubmit: (data: CreateAssignmentData) => void
  /** Открыли со страницы предмета: предмет и тип уже выбраны */
  defaultSubjectId?: string
  defaultKind?: WorkKind | null
}

/** Данные формы → запрос API. Контакт и ссылку для сдачи дописываем в описание. */
export function toCreateRequest(data: CreateAssignmentData, groupId: string): AssignmentCreateRequest {
  const extras: string[] = []
  if (data.teacher_contact) extras.push(`Преподаватель: ${data.teacher_contact}`)
  if (data.submission_link) extras.push(`Сдать: ${data.submission_link}`)
  return {
    group_id: groupId,
    subject_id: data.subjectId,
    title: data.title,
    description: extras.length > 0 ? `${data.description}\n\n${extras.join('\n')}` : data.description,
    deadline: data.deadline ? new Date(data.deadline).toISOString() : null,
    priority: data.priority,
    link: data.link || undefined,
    is_personal: data.is_personal,
    max_points: data.max_points,
    kind: data.kind,
    number: data.number,
  }
}

export function CreateAssignmentModal({ open, onClose, subjects, groupCode, onSubmit, defaultSubjectId, defaultKind = null }: CreateAssignmentModalProps) {
  const { t } = useT()
  const createCustomSubject = useCreateCustomSubject()

  const [subjectId, setSubjectId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [priority, setPriority] = useState<string>('normal')
  const [link, setLink] = useState('')
  const [teacherContact, setTeacherContact] = useState('')
  const [submissionLink, setSubmissionLink] = useState('')
  const [isPersonal, setIsPersonal] = useState(false)
  const [maxPoints, setMaxPoints] = useState('')
  const [kind, setKind] = useState<WorkKind | null>(defaultKind)
  const [number, setNumber] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Custom subject inline input
  const [showCustomSubjectInput, setShowCustomSubjectInput] = useState(false)
  const [customSubjectName, setCustomSubjectName] = useState('')

  // Каждое открытие — с предметом и типом, с которыми позвали (страница предмета)
  useEffect(() => {
    if (open) {
      setSubjectId(defaultSubjectId ?? '')
      setKind(defaultKind)
    }
  }, [open, defaultSubjectId, defaultKind])

  const resetForm = useCallback(() => {
    setSubjectId('')
    setKind(defaultKind)
    setNumber('')
    setTitle('')
    setDescription('')
    setDeadline('')
    setPriority('normal')
    setLink('')
    setTeacherContact('')
    setSubmissionLink('')
    setIsPersonal(false)
    setMaxPoints('')
    setErrors({})
    setShowCustomSubjectInput(false)
    setCustomSubjectName('')
  }, [defaultKind])

  const handleClose = useCallback(() => {
    resetForm()
    onClose()
  }, [onClose, resetForm])

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}
    if (!subjectId) newErrors.subjectId = t('assign.chooseSubject')
    if (!title.trim()) newErrors.title = t('assign.enterTitle')
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [subjectId, title])

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
        link: link.trim() || undefined,
        teacher_contact: teacherContact.trim() || undefined,
        submission_link: submissionLink.trim() || undefined,
        is_personal: isPersonal,
        max_points: maxPoints.trim() === '' ? null : Math.max(0, Number(maxPoints.replace(',', '.')) || 0),
        kind,
        number: kind && number.trim() !== '' ? Math.max(0, Math.round(Number(number)) || 0) : null,
      })
      resetForm()
    },
    [subjectId, title, description, deadline, priority, link, teacherContact, submissionLink, isPersonal, maxPoints, kind, number, validate, onSubmit, resetForm],
  )

  const handleCreateCustomSubject = useCallback(() => {
    if (!customSubjectName.trim() || !groupCode) return
    createCustomSubject.mutate(
      { code: groupCode, name: customSubjectName.trim() },
      {
        onSuccess: (newSubject) => {
          setSubjectId(newSubject.id)
          setCustomSubjectName('')
          setShowCustomSubjectInput(false)
        },
      },
    )
  }, [customSubjectName, groupCode, createCustomSubject])

  const allSubjects = subjects
  const subjectOptions = allSubjects.map((s) => ({ value: s.id, label: s.name }))

  return (
    <Modal
      open={open}
      onClose={handleClose}
      hideCloseButton
      scrollOnOverflow
      className="!max-w-4xl !overflow-visible !rounded-2xl !border-[#d4d4d4] !bg-[#eeeeee] dark:!border-surface-700 dark:!bg-surface-900"
    >
      <div className="-mx-6 -my-4">
        <div className="mx-2 mt-2 flex items-center justify-between rounded-2xl bg-white px-4 pt-5 pb-4 dark:bg-surface-800">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
            {t('assign.create')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('common.close')}
            className="ml-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-surface-200 bg-surface-50 text-surface-600 transition hover:bg-surface-100 dark:border-surface-700 dark:bg-surface-700 dark:text-surface-300 dark:hover:bg-surface-600"
          >
            <Icon name="x" size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 bg-[#eeeeee] px-2 py-3 dark:bg-surface-900">
          <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
            <div className="space-y-3">
              <section className="space-y-4 rounded-2xl bg-white p-3 shadow-sm dark:bg-surface-800">
            <div className="space-y-2">
              <Dropdown
                label={t('assign.subject')}
                options={subjectOptions}
                value={subjectId}
                onChange={setSubjectId}
                placeholder={t('assign.chooseSubject')}
                searchPlaceholder={t('assign.searchSubject')}
                emptyText={t('assign.noSubjects')}
                error={errors.subjectId}
              />
              {/* Custom subject inline creation */}
              {!groupCode ? (
                <p className="text-xs text-surface-500 dark:text-surface-400">{t('assign.noGroup.subjectHint')}</p>
              ) : !showCustomSubjectInput ? (
                <button
                  type="button"
                  onClick={() => setShowCustomSubjectInput(true)}
                  className="flex items-center gap-1 text-xs text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
                >
                  <Icon name="plus" size={12} />
                  {t('assign.addSubject')}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customSubjectName}
                    onChange={(e) => setCustomSubjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleCreateCustomSubject() }
                      if (e.key === 'Escape') { setShowCustomSubjectInput(false); setCustomSubjectName('') }
                    }}
                    placeholder={t('assign.subjectName')}
                    className="input flex-1 text-sm py-1.5"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={handleCreateCustomSubject}
                  >
                    {createCustomSubject.isPending ? '...' : t('common.add')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setShowCustomSubjectInput(false); setCustomSubjectName('') }}
                  >
                    <Icon name="x" size={14} />
                  </Button>
                </div>
              )}
              {showCustomSubjectInput && (
                <p
                  className={clsx(
                    'text-xs',
                    createCustomSubject.isError ? 'text-danger-500' : 'text-surface-400 dark:text-surface-500',
                  )}
                >
                  {createCustomSubject.isError ? t('assign.addSubjectError') : t('assign.personalSubjectHint')}
                </p>
              )}
          </div>

            <div className={clsx('grid gap-3', kind ? 'grid-cols-[1fr_7rem]' : 'grid-cols-1')}>
              <Dropdown
                label={t('assign.kind')}
                options={[
                  { value: '', label: t('assign.kind.task') },
                  ...WORK_KINDS.map((k) => ({ value: k, label: t(`assign.kind.${k}` as MessageKey) })),
                ]}
                value={kind ?? ''}
                onChange={(v) => setKind((v || null) as WorkKind | null)}
              />
              {kind && (
                <Input
                  label={t('assign.number')}
                  type="number"
                  min={0}
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="1"
                />
              )}
            </div>

            <Input
              label={t('assign.title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('assign.titlePlaceholder')}
              error={errors.title}
            />
            </section>
            <section className="rounded-2xl bg-white p-3 shadow-sm dark:bg-surface-800">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="create-description"
                className="text-sm font-medium text-surface-700 dark:text-surface-300"
              >
                {t('assign.description')}
              </label>
              <textarea
                id="create-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('assign.descriptionPlaceholder')}
                rows={8}
                className={clsx(
                  'input resize-y font-mono text-[13px]',
                  errors.description && 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500',
                )}
              />
              <p className="text-xs text-surface-400">{t('assign.markdownHint')}</p>
              {errors.description && (
                <p className="text-xs text-danger-500">{errors.description}</p>
              )}
            </div>
          </section>
            </div>
            <div className="space-y-3">
              <section className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-3 shadow-sm dark:bg-surface-800">
            <Input
              label={t('assign.link')}
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://docs.google.com/..."
            />
            <Input
              label={t('assign.teacherContact')}
              value={teacherContact}
              onChange={(e) => setTeacherContact(e.target.value)}
              placeholder={t('assign.teacherPlaceholder')}
            />
            <Input
              label={t('assign.submissionLink')}
              type="url"
              value={submissionLink}
              onChange={(e) => setSubmissionLink(e.target.value)}
              placeholder="https://..."
            />
            <DatePicker
              label={t('assign.deadline')}
              value={deadline}
              onChange={setDeadline}
              error={errors.deadline}
            />
            <PriorityDropdown value={priority} onChange={setPriority} />
            <Input
              label={t('assign.maxPoints')}
              type="number"
              min={0}
              step="any"
              value={maxPoints}
              onChange={(e) => setMaxPoints(e.target.value)}
              placeholder={t('assign.maxPointsPlaceholder')}
            />
              </section>

              {/* Personal toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none rounded-2xl bg-white p-3 shadow-sm dark:bg-surface-800">
            <div
              onClick={() => setIsPersonal(!isPersonal)}
              className={clsx(
                'relative w-9 h-5 rounded-full transition-colors',
                isPersonal ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600',
              )}
            >
              <span
                className={clsx(
                  'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm',
                  isPersonal && 'translate-x-4',
                )}
              />
            </div>
            <div>
              <span className="text-sm font-medium text-surface-700 dark:text-surface-300">
                {isPersonal ? t('assign.onlyMe') : t('assign.wholeGroup')}
              </span>
              <p className="text-xs text-surface-400 dark:text-surface-500 mt-0.5">
                {isPersonal
                  ? t('assign.onlyMeHint')
                  : t('assign.wholeGroupHint')}
              </p>
            </div>
              </label>
            </div>
          </div>

          <div className="mb-2 ml-auto mr-2 flex w-fit max-w-full items-center justify-end gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-surface-800">
            <Button variant="secondary" type="button" onClick={handleClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" type="submit">
              {t('common.create')}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}

/* ─── Main Component ─── */

