import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button, Card, Input } from '../components/ui'
import { useSearchGroups, useJoinGroup, useAuthStore, useTelegramBotAuth, useTelegramBotPoll } from '@nexora/shared'

type Step = 'welcome' | 'group' | 'done'

const PAIR_TIMES = [
  { num: 1, start: '9:00', end: '10:30' },
  { num: 2, start: '10:40', end: '12:10' },
  { num: 3, start: '12:20', end: '13:50' },
  { num: 4, start: '14:30', end: '16:00' },
  { num: 5, start: '16:10', end: '17:40' },
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [groupCode, setGroupCode] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)

  // Bot-based auth state
  const [pollToken, setPollToken] = useState<string | null>(null)
  const [awaitingBot, setAwaitingBot] = useState(false)

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const botAuthMutation = useTelegramBotAuth()
  const searchGroupsQuery = useSearchGroups(
    groupCode.length >= 2 ? { search: groupCode } : undefined
  )
  const joinGroupMutation = useJoinGroup()

  // Redirect if already authenticated and has gone through onboarding
  useEffect(() => {
    if (isAuthenticated && step === 'welcome') {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, step, navigate])

  const displayedGroups = searchGroupsQuery.data?.map((g) => g.code) ?? []

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const telegramContainerRef = useRef<HTMLDivElement>(null)

  const handleBotAuth = async () => {
    setLoginError(null)
    try {
      const { token, botUrl } = await botAuthMutation.mutateAsync()
      setPollToken(token)
      setAwaitingBot(true)
      window.open(botUrl, '_blank', 'noopener,noreferrer')
    } catch {
      setLoginError('Не удалось начать авторизацию. Попробуйте ещё раз.')
    }
  }

  const handlePollSuccess = () => {
    setPollToken(null)
    setAwaitingBot(false)
    goNext()
  }

  useTelegramBotPoll(pollToken, handlePollSuccess)

  const effectiveGroup = selectedGroup || groupCode.trim()
  const isValidGroup = /^\d{2,3}-\d{2,3}$/.test(effectiveGroup)

  const handleGroupInput = useCallback((value: string) => {
    setGroupCode(value)
    setSelectedGroup('')
  }, [])

  const selectGroup = (code: string) => {
    setSelectedGroup(code)
    setGroupCode(code)
  }

  const goNext = () => {
    const steps: Step[] = ['welcome', 'group', 'done']
    const idx = steps.indexOf(step)
    if (idx < steps.length - 1) setStep(steps[idx + 1])
  }

  const goBack = () => {
    const steps: Step[] = ['welcome', 'group', 'done']
    const idx = steps.indexOf(step)
    if (idx > 0) setStep(steps[idx - 1])
  }

  const finish = async () => {
    if (effectiveGroup) {
      try {
        await joinGroupMutation.mutateAsync(effectiveGroup)
      } catch (err: unknown) {
        const status = (err as { response?: { status?: number } })?.response?.status
        if (status !== 409) {
          // 409 = already a member, that's fine. Other errors — still proceed.
          console.warn('joinGroup error:', err)
        }
      }
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['welcome', 'group', 'done'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={clsx(
                'h-2 rounded-full transition-all',
                s === step ? 'w-8 bg-primary-500' : 'w-2',
                i < (['welcome', 'group', 'done'] as Step[]).indexOf(step)
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
              Добро пожаловать в Nexora
            </h1>
            <p className="text-surface-500 dark:text-surface-400 mb-2 text-lg">
              Единое место правды о расписании и заданиях
            </p>
            <p className="text-surface-400 dark:text-surface-500 text-sm mb-8">
              Для начала войди через Telegram
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
                    Открываем бот...
                  </span>
                ) : (
                  'Войти через Telegram'
                )}
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-2 text-surface-500 dark:text-surface-400">
                  <svg className="w-5 h-5 animate-spin text-primary-500" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span className="text-sm font-medium">Ожидаем авторизацию в боте...</span>
                </div>

                <div className="bg-surface-100 dark:bg-surface-800 rounded-xl p-4 text-left space-y-2 text-sm text-surface-600 dark:text-surface-300">
                  <p className="font-medium text-surface-900 dark:text-surface-50 mb-1">Что делать:</p>
                  <p>1. Нажмите кнопку выше чтобы открыть бота</p>
                  <p>2. Нажмите <span className="font-medium">Старт</span> в боте</p>
                  <p>3. Вернитесь на эту страницу</p>
                </div>

                <button
                  onClick={() => {
                    setPollToken(null)
                    setAwaitingBot(false)
                  }}
                  className="text-sm text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 underline"
                >
                  Отмена
                </button>
              </div>
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
              Назад
            </button>

            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 mb-2">
              Введи номер своей группы
            </h2>
            <p className="text-surface-500 dark:text-surface-400 mb-6">
              Мы найдём твоё расписание автоматически
            </p>

            <div className="relative">
              <Input
                value={groupCode}
                onChange={(e) => handleGroupInput(e.target.value)}
                placeholder="Например, 241-237"
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
              onClick={goNext}
              disabled={!isValidGroup}
            >
              Продолжить
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
              Готово!
            </h2>
            <p className="text-surface-500 dark:text-surface-400 mb-2">
              Ты в группе <span className="font-semibold text-surface-900 dark:text-surface-50">{effectiveGroup}</span>
            </p>
            <p className="text-surface-400 dark:text-surface-500 text-sm mb-8">
              Расписание загрузится автоматически
            </p>

            <Button
              variant="primary"
              size="lg"
              className="w-full max-w-xs mx-auto"
              onClick={finish}
              disabled={joinGroupMutation.isPending}
            >
              Перейти к дашборду
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
