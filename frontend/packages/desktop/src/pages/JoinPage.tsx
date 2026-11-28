/**
 * /join/<токен> — вступление по ссылке-приглашению или QR (#147, начато в #30).
 *
 * Не вошёл — показываем, какая группа зовёт, и ведём на вход; после входа онбординг
 * возвращает сюда. Вошёл и без группы — заявка уходит сразу. Уже в другой группе —
 * спрашиваем про смену (одна группа на человека, #162).
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ApiClientError, useAuthStore, useInvitePreview, useJoinByInvite, useMyGroups } from '@nexora/shared'
import { Button, Card, Icon, Skeleton } from '../components/ui'
import { useT } from '../i18n'

type State = 'idle' | 'sending' | 'done' | 'member' | 'switch' | 'error'

export function JoinPage() {
  const { token = '' } = useParams()
  const { t } = useT()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const preview = useInvitePreview(token)
  const myGroups = useMyGroups({ enabled: isAuthenticated })
  const join = useJoinByInvite()
  const [state, setState] = useState<State>('idle')
  const sent = useRef(false)

  const code = preview.data?.code ?? ''
  const current = myGroups.data?.[0]?.group.code

  const send = (switchGroup = false) => {
    setState('sending')
    join.mutate(
      { token, switchGroup },
      {
        onSuccess: () => setState('done'),
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === 'ALREADY_IN_GROUP') setState('switch')
          else if (e instanceof ApiClientError && e.code === 'ALREADY_MEMBER') setState('member')
          else setState('error')
        },
      },
    )
  }

  // Вошёл и группы ещё нет — заявка сразу, без лишнего клика
  useEffect(() => {
    if (!isAuthenticated || !preview.data || !myGroups.data || sent.current) return
    sent.current = true
    if (myGroups.data.some((m) => m.group.code === preview.data.code)) setState('member')
    else if (myGroups.data.length) setState('switch')
    else send()
  }, [isAuthenticated, preview.data, myGroups.data]) // eslint-disable-line react-hooks/exhaustive-deps

  let body: React.ReactNode
  if (preview.isLoading) {
    body = <Skeleton className="h-24 rounded-xl" />
  } else if (preview.isError) {
    body = (
      <>
        <h1 className="text-lg font-semibold text-surface-900 dark:text-surface-50">{t('join.invalidTitle')}</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400">{t('join.invalid')}</p>
        <Link to="/settings?section=group"><Button>{t('join.pickManually')}</Button></Link>
      </>
    )
  } else if (!isAuthenticated) {
    body = (
      <>
        <GroupBadge code={code} members={preview.data?.members ?? 0} />
        <p className="text-sm text-surface-600 dark:text-surface-300">{t('join.loginFirst')}</p>
        <Button onClick={() => navigate(`/onboarding?invite=${encodeURIComponent(token)}`)}>{t('join.login')}</Button>
      </>
    )
  } else if (state === 'switch') {
    body = (
      <>
        <GroupBadge code={code} members={preview.data?.members ?? 0} />
        <p className="text-sm text-surface-700 dark:text-surface-200">{t('groupSwitch.only', { current: current ?? '' })}</p>
        <ul className="space-y-1 text-left text-sm text-surface-600 dark:text-surface-300">
          <li>• {t('groupSwitch.schedule', { code })}</li>
          <li>• {t('groupSwitch.personal')}</li>
          <li>• {t('groupSwitch.lost', { current: current ?? '' })}</li>
        </ul>
        <div className="flex justify-center gap-2">
          <Link to="/"><Button variant="ghost">{t('join.stay', { current: current ?? '' })}</Button></Link>
          <Button disabled={join.isPending} onClick={() => send(true)}>{t('groupSwitch.confirm', { code })}</Button>
        </div>
      </>
    )
  } else {
    const text = {
      idle: t('join.sending', { code }),
      sending: t('join.sending', { code }),
      done: t('join.done', { code }),
      member: t('join.member', { code }),
      error: t('join.error'),
    }[state]
    body = (
      <>
        <GroupBadge code={code} members={preview.data?.members ?? 0} />
        <p className="text-sm text-surface-700 dark:text-surface-200">{text}</p>
        {state === 'error' && <Button onClick={() => send()}>{t('join.retry')}</Button>}
        {(state === 'done' || state === 'member') && (
          <Link to="/"><Button>{t('join.toApp')}</Button></Link>
        )}
      </>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4">
      <Card padding="lg" className="w-full max-w-md space-y-4 text-center">{body}</Card>
    </div>
  )
}

function GroupBadge({ code, members }: { code: string; members: number }) {
  const { t } = useT()
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-500 dark:bg-primary-500/10">
        <Icon name="users" size={22} />
      </span>
      <div className="text-xs uppercase tracking-wide text-surface-500 dark:text-surface-400">{t('join.invitedTo')}</div>
      <div className="text-2xl font-semibold tabular-nums text-surface-900 dark:text-surface-50">{code}</div>
      <div className="text-xs text-surface-500 dark:text-surface-400">{t('join.members', { n: members })}</div>
    </div>
  )
}
