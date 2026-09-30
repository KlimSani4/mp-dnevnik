import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button, Card, Input } from '../components/ui'
import { useSearchGroups, useJoinGroup, useAuthStore, useTelegramBotAuth, useTelegramBotPoll, useTodaySchedule } from '@nexora/shared'
import type { GroupMembership } from '@nexora/shared'

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
              onClick={handleGroupContinue}
              disabled={!isValidGroup || joinGroupMutation.isPending}
            >
              {joinGroupMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Загружаем...
                </span>
              ) : (
                'Продолжить'
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
              Назад
            </button>

            {/* Join status banner */}
            {joinResult?.role === 'starosta' ? (
              <div className="mb-5 rounded-xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 px-4 py-3">
                <p className="text-sm font-medium text-warning-700 dark:text-warning-400">
                  Ты первый в группе! Ты стал старостой.
                </p>
              </div>
            ) : joinResult && !joinResult.verified ? (
              <div className="mb-5 rounded-xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 px-4 py-3">
                <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
                  Запрос на вступление отправлен. Ожидай подтверждения старосты.
                </p>
              </div>
            ) : null}

            <h2 className="text-2xl font-bold text-surface-900 dark:text-surface-50 mb-1">
              Вот твоё расписание
            </h2>
            <p className="text-surface-500 dark:text-surface-400 text-sm mb-5">
              Группа <span className="font-semibold text-surface-900 dark:text-surface-50">{effectiveGroupCode}</span> · сегодня
            </p>

            {scheduleQuery.isLoading && (
              <div className="flex items-center gap-2 text-surface-500 dark:text-surface-400 py-4">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-sm">Загружаем расписание...</span>
              </div>
            )}

            {scheduleQuery.isError && (
              <div className="rounded-xl bg-surface-100 dark:bg-surface-800 px-4 py-3 text-sm text-surface-500 dark:text-surface-400 mb-4">
                Не удалось загрузить расписание. Продолжай — оно появится позже.
              </div>
            )}

            {scheduleQuery.data && (
              <div className="space-y-2 mb-5">
                {scheduleQuery.data.entries.length === 0 ? (
                  <div className="rounded-xl bg-surface-100 dark:bg-surface-800 px-4 py-4 text-sm text-surface-500 dark:text-surface-400 text-center">
                    Пар сегодня нет
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
              <span className="text-sm text-surface-700 dark:text-surface-300">Всё верно, продолжить</span>
            </label>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={goNext}
              disabled={!previewConfirmed && !scheduleQuery.isError}
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
            {joinResult?.role === 'starosta' ? (
              <p className="text-surface-500 dark:text-surface-400 mb-2">
                Ты в группе <span className="font-semibold text-surface-900 dark:text-surface-50">{effectiveGroupCode}</span> как <span className="font-semibold text-warning-600 dark:text-warning-400">Староста</span>
              </p>
            ) : (
              <p className="text-surface-500 dark:text-surface-400 mb-2">
                Ты в группе <span className="font-semibold text-surface-900 dark:text-surface-50">{effectiveGroupCode}</span>
              </p>
            )}
            <p className="text-surface-400 dark:text-surface-500 text-sm mb-8">
              Расписание загрузится автоматически
            </p>

            <Button
              variant="primary"
              size="lg"
              className="w-full max-w-xs mx-auto"
              onClick={finish}
            >
              Перейти к дашборду
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
