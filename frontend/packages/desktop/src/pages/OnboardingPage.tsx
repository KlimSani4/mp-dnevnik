import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button, Card, Input } from '../components/ui'
import { useSearchGroups, useJoinGroup, useAuthStore, useDevLogin, useTelegramBotAuth, useTelegramBotPoll, useTodaySchedule } from '@nexora/shared'
import type { GroupMembership } from '@nexora/shared'
import { useT } from '../i18n'

type Step = 'welcome' | 'group' | 'preview' | 'done'

const PAIR_TIMES = [
  { num: 1, start: '9:00', end: '10:30' },
  { num: 2, start: '10:40', end: '12:10' },
  { num: 3, start: '12:20', end: '13:50' },
  { num: 4, start: '14:30', end: '16:00' },
  { num: 5, start: '16:10', end: '17:40' },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const { t } = useT()
  const [step, setStep] = useState<Step>('welcome')
  const [groupCode, setGroupCode] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [joinResult, setJoinResult] = useState<GroupMembership | null>(null)
  const [previewConfirmed, setPreviewConfirmed] = useState(false)

  // Bot-based auth state
  const [pollToken, setPollToken] = useState<string | null>(null)
  const [awaitingBot, setAwaitingBot] = useState(false)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const botAuthMutation = useTelegramBotAuth()
  const devLoginMutation = useDevLogin()
  const searchGroupsQuery = useSearchGroups(
    groupCode.length >= 2 ? { search: groupCode } : undefined
  )
  const joinGroupMutation = useJoinGroup()
  const effectiveGroupCode = selectedGroup || groupCode.trim()
  const scheduleQuery = useTodaySchedule(step === 'preview' ? effectiveGroupCode : undefined)

  // Redirect if already authenticated and has gone through onboarding
  useEffect(() => {
    if (isAuthenticated && step === 'welcome') {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, step, navigate])

  const displayedGroups = searchGroupsQuery.data?.map((g) => g.code) ?? []

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const telegramContainerRef = useRef<HTMLDivElement>(null)

  const handleDevLogin = async () => {
    setLoginError(null)
    try {
      await devLoginMutation.mutateAsync('12345')
      setStep('group')
    } catch {
      setLoginError('Dev-вход доступен только при APP_ENV=development на backend.')
    }
  }

  const handleBotAuth = async () => {
    setLoginError(null)
    try {
      const { token, botUrl } = await botAuthMutation.mutateAsync()
      setPollToken(token)
      setAwaitingBot(true)
      window.open(botUrl, '_blank', 'noopener,noreferrer')
    } catch {
      setLoginError(t('onb.authError'))
    }
  }

  const handlePollSuccess = () => {
    setPollToken(null)
    setAwaitingBot(false)
    goNext()
  }

  useTelegramBotPoll(pollToken, handlePollSuccess)

  const isValidGroup = /^\d{2,3}-\d{2,3}$/.test(effectiveGroupCode)

  const handleGroupInput = useCallback((value: string) => {
    setGroupCode(value)
    setSelectedGroup('')
  }, [])

  const selectGroup = (code: string) => {
    setSelectedGroup(code)
    setGroupCode(code)
  }

  const STEPS: Step[] = ['welcome', 'group', 'preview', 'done']

  const goNext = () => {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1])
  }

  const goBack = () => {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }

  const handleGroupContinue = async () => {
    if (!isValidGroup) return
    try {
      const result = await joinGroupMutation.mutateAsync(effectiveGroupCode)
      setJoinResult(result)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status !== 409) {
        console.warn('joinGroup error:', err)
      }
    }
    goNext()
  }

  const finish = () => {
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['welcome', 'group', 'preview', 'done'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={clsx(
                'h-2 rounded-full transition-all',
                s === step ? 'w-8 bg-primary-500' : 'w-2',
                i < (['welcome', 'group', 'preview', 'done'] as Step[]).indexOf(step)
                  ? 'bg-primary-300'
                  : s !== step
                    ? 'bg-surface-200 dark:bg-surface-700'
                    : ''
              )}
            />
          ))}
        </div>

        {/* Step: Welcome */}
        {step === 'welcome' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-surface-900 dark:text-surface-50 mb-3">
              {t('onb.welcome')}
            </h1>
            <p className="text-surface-500 dark:text-surface-400 mb-2 text-lg">
              {t('onb.tagline')}
            </p>
            <p className="text-surface-400 dark:text-surface-500 text-sm mb-8">
              {t('onb.loginHint')}
            </p>

            {!awaitingBot ? (
              <Button
                variant="primary"
                size="lg"
                className="w-full max-w-xs mx-auto mb-4"
                onClick={handleBotAuth}
                disabled={botAuthMutation.isPending}
              >
                {botAuthMutation.isPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    {t('onb.openingBot')}
                  </span>
                ) : (
                  t('onb.loginTelegram')
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-surface-500 dark:text-surface-400">
                  <svg className="w-5 h-5 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-sm font-medium">{t('onb.waitingBot')}</span>
                </div>

                <div className="bg-surface-100 dark:bg-surface-800 rounded-xl p-4 text-left space-y-2 text-sm text-surface-600 dark:text-surface-300">
                  <p className="font-medium text-surface-900 dark:text-surface-50 mb-1">{t('onb.steps')}</p>
                  <p>{t('onb.step1')}</p>
                  <p>{t('onb.step2a')} <span className="font-medium">{t('onb.step2b')}</span> {t('onb.step2c')}</p>
                  <p>{t('onb.step3')}</p>
                </div>

                <button
                  onClick={() => {
                    setPollToken(null)
                    setAwaitingBot(false)
                  }}
                  className="text-sm text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 underline"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}

            {/* Только в dev-сборке: в production код кнопки вырезается */}
            {import.meta.env.DEV && !awaitingBot && (
              <Button
                variant="secondary"
                className="w-full max-w-xs mx-auto mt-2"
                onClick={handleDevLogin}
                disabled={devLoginMutation.isPending}
              >
                {/* dev-only: без перевода, в production-сборку не попадает */}
                {devLoginMutation.isPending ? 'Входим...' : 'Войти как разработчик'}
              </Button>
            )}

            {loginError && (
              <p className="text-sm text-danger-500 mt-2">{loginError}</p>
            )}
          </div>
        )}

        {/* Step: Group selection */}
        {step === 'group' && (
          <div>
            <button
              onClick={goBack}
              className="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 text-sm mb-6 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {t('common.back')}
            </button>

            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 mb-2">
              {t('onb.groupTitle')}
            </h2>
            <p className="text-surface-500 dark:text-surface-400 mb-6">
              {t('onb.groupHint')}
            </p>

            <div className="relative">
              <Input
                value={groupCode}
                onChange={(e) => handleGroupInput(e.target.value)}
                placeholder={t('onb.groupPlaceholder')}
                className="text-lg"
              />

              {displayedGroups.length > 0 && !selectedGroup && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                  {displayedGroups.map((g) => (
                    <button
                      key={g}
                      onClick={() => selectGroup(g)}
                      className="w-full text-left px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-700 text-sm text-surface-900 dark:text-surface-50 transition-colors"
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="primary"
              size="lg"
              className="w-full mt-6"
              onClick={handleGroupContinue}
              disabled={!isValidGroup || joinGroupMutation.isPending}
            >
              {joinGroupMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  {t('common.loading')}
                </span>
              ) : (
                t('common.continue')
              )}
            </Button>
          </div>
        )}

        {/* Step: Schedule preview */}
        {step === 'preview' && (
          <div>
            <button
              onClick={goBack}
              className="text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 text-sm mb-6 flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              {t('common.back')}
            </button>

            {/* Join status banner */}
            {joinResult?.role === 'starosta' ? (
              <div className="mb-5 rounded-xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 px-4 py-3">
                <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
                  {t('onb.firstInGroup')}
                </p>
              </div>
            ) : joinResult && !joinResult.verified ? (
              <div className="mb-5 rounded-xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 px-4 py-3">
                <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  {t('onb.requestSent')}
                </p>
              </div>
            ) : null}

            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 mb-1">
              {t('onb.previewTitle')}
            </h2>
            <p className="text-surface-500 dark:text-surface-400 text-sm mb-5">
              {t('onb.previewGroup')} <span className="font-semibold text-surface-900 dark:text-surface-50">{effectiveGroupCode}</span> · {t('onb.previewToday')}
            </p>

            {scheduleQuery.isLoading && (
              <div className="flex items-center gap-2 text-surface-500 dark:text-surface-400 py-4">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-sm">{t('onb.loadingSchedule')}</span>
              </div>
            )}

            {scheduleQuery.isError && (
              <div className="rounded-xl bg-surface-100 dark:bg-surface-800 px-4 py-3 text-sm text-surface-500 dark:text-surface-400 mb-4">
                {t('onb.previewError')}
              </div>
            )}

            {scheduleQuery.data && (
              <div className="space-y-2 mb-5">
                {scheduleQuery.data.entries.length === 0 ? (
                  <div className="rounded-xl bg-surface-100 dark:bg-surface-800 px-4 py-4 text-sm text-surface-500 dark:text-surface-400 text-center">
                    {t('onb.noLessons')}
                  </div>
                ) : (
                  scheduleQuery.data.entries.map((entry) => (
                    <Card key={entry.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="text-xs font-medium text-surface-400 dark:text-surface-500 w-14 shrink-0 mt-0.5">
                          <div>{entry.start_time}</div>
                          <div>{entry.end_time}</div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-surface-900 dark:text-surface-50 truncate">
                            {entry.subject.name}
                          </p>
                          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                            {[entry.lesson_type, entry.room, entry.teacher]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            )}

            <label className="flex items-center gap-3 cursor-pointer mb-6 select-none">
              <input
                type="checkbox"
                checked={previewConfirmed}
                onChange={(e) => setPreviewConfirmed(e.target.checked)}
                className="w-4 h-4 rounded border-surface-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-surface-700 dark:text-surface-300">{t('onb.confirm')}</span>
            </label>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={goNext}
              disabled={!previewConfirmed && !scheduleQuery.isError}
            >
              {t('common.continue')}
            </Button>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-success-100 dark:bg-success-500/20 flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 mb-3">
              {t('onb.doneTitle')}
            </h2>
            {joinResult?.role === 'starosta' ? (
              <p className="text-surface-500 dark:text-surface-400 mb-2">
                {t('onb.inGroup')} <span className="font-semibold text-surface-900 dark:text-surface-50">{effectiveGroupCode}</span> {t('onb.as')} <span className="font-semibold text-warning-600 dark:text-warning-400">{t('roles.starosta')}</span>
              </p>
            ) : (
              <p className="text-surface-500 dark:text-surface-400 mb-2">
                {t('onb.inGroup')} <span className="font-semibold text-surface-900 dark:text-surface-50">{effectiveGroupCode}</span>
              </p>
            )}
            <p className="text-surface-400 dark:text-surface-500 text-sm mb-8">
              {t('onb.doneHint')}
            </p>

            <Button
              variant="primary"
              size="lg"
              className="w-full max-w-xs mx-auto"
              onClick={finish}
            >
              {t('onb.toDashboard')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
