import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuthStore, useJoinGroup } from '@nexora/shared'
import { Button, Card } from '../components/ui'
import { useT } from '../i18n'

type State = 'joining' | 'done' | 'already' | 'error'

const GROUP_CODE = /^\d{2,3}-\d{2,3}$/

export function JoinPage() {
  const { code = '' } = useParams()
  const { t } = useT()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const { mutateAsync } = useJoinGroup()
  const valid = GROUP_CODE.test(code)
  const [state, setState] = useState<State>(valid ? 'joining' : 'error')
  const sent = useRef<string | null>(null)

  useEffect(() => {
    if (!valid || !isAuthenticated || sent.current === code) return
    sent.current = code
    setState('joining')
    mutateAsync(code).then(
      () => setState('done'),
      (e: { status?: number }) => setState(e?.status === 409 ? 'already' : 'error'),
    )
  }, [valid, isAuthenticated, code, mutateAsync])

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
