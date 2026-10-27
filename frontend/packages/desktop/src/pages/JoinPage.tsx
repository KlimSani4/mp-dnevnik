import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuthStore, useJoinGroup } from '@nexora/shared'
import { Button, Card } from '../components/ui'
import { useT } from '../i18n'

type State = 'joining' | 'done' | 'already' | 'error'

export function JoinPage() {
  const { code = '' } = useParams()
  const { t } = useT()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { mutateAsync } = useJoinGroup()
  const [state, setState] = useState<State>('joining')
  const sent = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || sent.current) return
    sent.current = true
    mutateAsync(code).then(
      () => setState('done'),
      (e: { status?: number }) => setState(e?.status === 409 ? 'already' : 'error'),
    )
  }, [isAuthenticated, code, mutateAsync])

  if (!isAuthenticated) return <Navigate to={`/onboarding?group=${encodeURIComponent(code)}`} replace />

  const text: Record<State, string> = {
    joining: t('join.joining', { code }),
    done: t('join.done', { code }),
    already: t('join.already', { code }),
    error: t('join.error'),
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4">
      <Card padding="lg" className="w-full max-w-md text-center space-y-4">
        <p className="text-surface-900 dark:text-surface-50">{text[state]}</p>
        {state !== 'joining' && (
          <Link to="/">
            <Button>{t('join.toApp')}</Button>
          </Link>
        )}
      </Card>
    </div>
  )
}
