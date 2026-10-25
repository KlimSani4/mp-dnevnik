import { useState } from 'react'
import { format } from 'date-fns'
import { Badge, Button, Card, Input } from './ui'
import {
  useApplyTeacher,
  useCreateSupportRequest,
  useCurrentUser,
  useMySupportRequests,
  useMyTeacherApplication,
} from '@nexora/shared'
import type { ApplicationStatus, SupportStatus } from '@nexora/shared'
import { useT, type MessageKey } from '../i18n'

export const SUPPORT_STATUS: Record<SupportStatus, { label: MessageKey; variant: 'urgent' | 'high' | 'success' }> = {
  new: { label: 'support.status.new', variant: 'urgent' },
  in_progress: { label: 'support.status.in_progress', variant: 'high' },
  closed: { label: 'support.status.closed', variant: 'success' },
}

export const APPLICATION_STATUS: Record<ApplicationStatus, { label: MessageKey; variant: 'high' | 'success' | 'urgent' }> = {
  pending: { label: 'teacher.status.pending', variant: 'high' },
  approved: { label: 'teacher.status.approved', variant: 'success' },
  rejected: { label: 'teacher.status.rejected', variant: 'urgent' },
}

/** Настройки → Поддержка: написать в поддержку и подать заявку преподавателя (#99). */
export function SupportSection() {
  const { t, locale } = useT()
  const user = useCurrentUser().data

  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const createSupport = useCreateSupportRequest()
  const myRequests = useMySupportRequests()

  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const myApplication = useMyTeacherApplication()
  const applyTeacher = useApplyTeacher()

  const sendSupport = async () => {
    setSent(false)
    await createSupport.mutateAsync(message.trim())
    setMessage('')
    setSent(true)
  }

  const application = myApplication.data
  const canApply = !user?.is_teacher && application?.status !== 'pending'

  return (
    <div className="space-y-6">
      <Card padding="lg">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-1">{t('support.title')}</h2>
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">{t('support.hint')}</p>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          maxLength={4000}
          placeholder={t('support.placeholder')}
          className="w-full rounded-lg border border-surface-200 bg-white p-3 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-50"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={message.trim().length < 5 || createSupport.isPending}
            onClick={sendSupport}
          >
            {createSupport.isPending ? t('common.saving') : t('support.send')}
          </Button>
          {sent && <span className="text-sm text-success-600 dark:text-success-400">{t('support.sent')}</span>}
          {createSupport.isError && <span className="text-sm text-danger-500">{t('support.error')}</span>}
        </div>

        {(myRequests.data?.length ?? 0) > 0 && (
          <div className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-surface-700 dark:text-surface-300">{t('support.mine')}</h3>
            {myRequests.data!.map((r) => (
              <div key={r.id} className="rounded-lg border border-surface-100 p-3 dark:border-surface-700">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-surface-400">{format(new Date(r.created_at), 'd MMM, HH:mm', { locale })}</span>
                  <Badge variant={SUPPORT_STATUS[r.status].variant} size="sm">{t(SUPPORT_STATUS[r.status].label)}</Badge>
                </div>
                <p className="text-sm text-surface-700 dark:text-surface-300 whitespace-pre-wrap">{r.message}</p>
                {r.reply && (
                  <p className="mt-2 border-l-2 border-primary-500 pl-3 text-sm text-surface-900 dark:text-surface-50 whitespace-pre-wrap">
                    {r.reply}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padding="lg">
        <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50 mb-1">{t('teacher.title')}</h2>
        <p className="text-sm text-surface-500 dark:text-surface-400 mb-4">{t('teacher.hint')}</p>

        {user?.is_teacher ? (
          <Badge variant="success">{t('teacher.youAreTeacher')}</Badge>
        ) : (
          <>
            {application && (
              <div className="mb-4 flex items-center gap-2 text-sm">
                <span className="text-surface-600 dark:text-surface-400">{t('teacher.yourApplication')}</span>
                <Badge variant={APPLICATION_STATUS[application.status].variant} size="sm">
                  {t(APPLICATION_STATUS[application.status].label)}
                </Badge>
              </div>
            )}
            {canApply && (
              <div className="space-y-3">
                <Input label={t('teacher.fullName')} value={fullName} onChange={(e) => setFullName(e.target.value)} />
                <Input label={t('teacher.department')} value={department} onChange={(e) => setDepartment(e.target.value)} />
                <Button
                  variant="secondary"
                  disabled={fullName.trim().length < 3 || applyTeacher.isPending}
                  onClick={() => applyTeacher.mutate({ full_name: fullName.trim(), department: department.trim() || undefined })}
                >
                  {t('teacher.apply')}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
