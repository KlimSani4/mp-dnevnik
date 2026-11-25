import { format } from 'date-fns'
import {
  useChangeStudentRole,
  useGroupStudents,
  useRejectStudent,
  useVerifyStudent,
} from '@nexora/shared'
import type { GroupRole, GroupStudent } from '@nexora/shared'
import { Avatar, Button, Icon } from './ui'
import { useT, type MessageKey } from '../i18n'

interface GroupMembersProps {
  code: string
  /** Подтверждать и отклонять заявки: староста, заместитель, модератор платформы */
  canReview: boolean
  /** Назначать помощника: староста и модератор платформы */
  canManageRoles: boolean
}

/**
 * Участники и заявки группы (#148). Используется в Настройках у старосты и на странице
 * модерации, где модератор платформы работает с любой группой как староста (#150).
 */
export function GroupMembers({ code, canReview, canManageRoles }: GroupMembersProps) {
  const { t, locale } = useT()
  const studentsQuery = useGroupStudents(code)
  const verifyStudentMutation = useVerifyStudent()
  const rejectStudentMutation = useRejectStudent()
  const changeRoleMutation = useChangeStudentRole()

  const handleVerify = (userId: string) => verifyStudentMutation.mutate({ code, userId })
  const handleReject = (userId: string) => rejectStudentMutation.mutate({ code, userId })
  const handleChangeRole = (userId: string, role: GroupRole) =>
    changeRoleMutation.mutate({ code, userId, role })

  return (
    <>
      {studentsQuery.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-surface-200 dark:bg-surface-700 rounded animate-pulse" />
          ))}
        </div>
      ) : !studentsQuery.data || studentsQuery.data.length === 0 ? (
        <p className="text-sm text-surface-500 dark:text-surface-400 py-2">
          {t('settings.noMembers')}
        </p>
      ) : (
        <div className="space-y-1">
          {studentsQuery.data.map((student) => {
            const isPending =
              verifyStudentMutation.isPending ||
              rejectStudentMutation.isPending ||
              changeRoleMutation.isPending
            return (
              <div
                key={student.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 border-b border-surface-100 dark:border-surface-700 last:border-0"
              >
                <Avatar name={student.user.display_name || student.user_id} size="sm" />
                <div className="min-w-0 flex-1 basis-48">
                  <div className="text-sm font-medium text-surface-900 dark:text-surface-50 truncate">
                    {student.user.display_name || t('common.student')}
                  </div>
                  <TelegramLine student={student} />
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                    {student.verified ? (
                      <span className="text-xs text-success-600 dark:text-success-400 flex items-center gap-1">
                        <Icon name="check" size={12} />
                        {t('settings.verified')}
                      </span>
                    ) : (
                      <span className="text-xs text-warning-600 dark:text-warning-400">
                        {t('settings.awaitingApproval')}
                      </span>
                    )}
                    <span className="whitespace-nowrap text-xs text-surface-400 dark:text-surface-500">
                      · {format(new Date(student.created_at), 'd MMM', { locale })}
                      {student.joined_via && ` · ${t(JOINED_VIA[student.joined_via])}`}
                    </span>
                    {student.role !== 'student' && (
                      <span className="text-xs px-1.5 py-0.5 bg-primary-100 text-primary-600 dark:bg-primary-500/20 dark:text-primary-400 rounded font-medium capitalize">
                        {student.role === 'starosta' ? t('roles.starosta') : student.role === 'deputy' ? t('roles.deputy') : student.role === 'assistant' ? t('roles.assistant') : student.role}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-auto flex flex-shrink-0 items-center gap-2">
                  {!student.verified && canReview && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleReject(student.user_id)}
                      >
                        {t('settings.reject')}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleVerify(student.user_id)}
                      >
                        {t('settings.approve')}
                      </Button>
                    </>
                  )}
                  {canManageRoles && student.role === 'student' && student.verified && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleChangeRole(student.user_id, 'assistant')}
                    >
                      {t('settings.makeAssistant')}
                    </Button>
                  )}
                  {canManageRoles && student.role === 'assistant' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleChangeRole(student.user_id, 'student')}
                    >
                      {t('settings.removeRole')}
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

const JOINED_VIA: Record<NonNullable<GroupStudent['joined_via']>, MessageKey> = {
  site: 'settings.joinedVia.site',
  bot: 'settings.joinedVia.bot',
  invite: 'settings.joinedVia.invite',
}

/** Кто это в Telegram: @username со ссылкой на профиль или имя (#148) */
function TelegramLine({ student }: { student: GroupStudent }) {
  const { t } = useT()
  const tg = student.telegram
  if (!tg) {
    return <div className="text-xs text-surface-400 dark:text-surface-500">{t('settings.noTelegram')}</div>
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      {tg.username && tg.profile_url ? (
        <a
          href={tg.profile_url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-600 hover:underline dark:text-primary-400"
          title={t('settings.openTelegram')}
        >
          @{tg.username}
        </a>
      ) : (
        <span className="text-surface-400 dark:text-surface-500">{t('settings.noUsername')}</span>
      )}
      {tg.name && tg.name !== student.user.display_name && (
        <span className="truncate text-surface-400 dark:text-surface-500">· {tg.name}</span>
      )}
    </div>
  )
}
