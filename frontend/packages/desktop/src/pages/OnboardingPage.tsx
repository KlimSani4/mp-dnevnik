import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button, Card, Input } from '../components/ui'
import { useSearchGroups, useJoinGroup, useAuthStore, useTelegramBotAuth, useTelegramBotPoll } from '@nexora/shared'

type Step = 'welcome' | 'group' | 'subgroup' | 'schedule' | 'done'

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
  const [subgroup, setSubgroup] = useState<1 | 2 | null>(null)
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  // Bot-based auth state
  const [pollToken, setPollToken] = useState<string | null>(null)
  const [awaitingBot, setAwaitingBot] = useState(false)

  const botAuthMutation = useTelegramBotAuth()
  const searchGroupsQuery = useSearchGroups(
    groupCode.length >= 2 ? { search: groupCode } : undefined
  )
  const joinGroupMutation = useJoinGroup()
  const setSelectedGroupStore = useAuthStore((s) => s.setSelectedGroup)

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
    const steps: Step[] = ['welcome', 'group', 'subgroup', 'schedule', 'done']
    const idx = steps.indexOf(step)
    if (idx < steps.length - 1) setStep(steps[idx + 1])
  }

  const goBack = () => {
    const steps: Step[] = ['welcome', 'group', 'subgroup', 'schedule', 'done']
    const idx = steps.indexOf(step)
    if (idx > 0) setStep(steps[idx - 1])
  }

  const finish = async () => {
    if (effectiveGroup) {
      try {
        const membership = await joinGroupMutation.mutateAsync(effectiveGroup)
        setSelectedGroupStore(membership.group.id, membership.group.code)
      } catch {
        // group might already be joined, proceed anyway
      }
    }
    navigate('/')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4">
      <div className="w-full max-w-lg">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {(['welcome', 'group', 'subgroup', 'schedule', 'done'] as Step[]).map((s, i) => (
            <div
              key={s}
              className={clsx(
                'h-2 rounded-full transition-all',
                s === step ? 'w-8 bg-primary-500' : 'w-2',
                i < ['welcome', 'group', 'subgroup', 'schedule', 'done'].indexOf(step)
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

        {/* Step: Subgroup */}
        {step === 'subgroup' && (
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
              Выбери подгруппу
            </h2>
            <p className="text-surface-500 dark:text-surface-400 mb-6">
              Группа {effectiveGroup} — выбери свою подгруппу для лабораторных
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              {([1, 2] as const).map((num) => (
                <button
                  key={num}
                  onClick={() => setSubgroup(num)}
                  className={clsx(
                    'p-6 rounded-xl border-2 text-center transition-all',
                    subgroup === num
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                      : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'
                  )}
                >
                  <div className={clsx(
                    'text-2xl font-bold mb-1',
                    subgroup === num ? 'text-primary-500' : 'text-surface-900 dark:text-surface-50'
                  )}>
                    {num}
                  </div>
                  <div className="text-sm text-surface-500">Подгруппа</div>
                </button>
              ))}
            </div>

            <Button
              variant="secondary"
              className="w-full mb-3"
              onClick={() => { setSubgroup(null); goNext() }}
            >
              У меня нет подгрупп
            </Button>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={goNext}
              disabled={subgroup === null}
            >
              Продолжить
            </Button>
          </div>
        )}

        {/* Step: Schedule preview */}
        {step === 'schedule' && (
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
              Группа выбрана
            </h2>
            <p className="text-surface-500 dark:text-surface-400 mb-6">
              Группа {effectiveGroup}{subgroup ? `, подгруппа ${subgroup}` : ''} — расписание будет загружено после входа
            </p>

            <div className="space-y-3 mb-6">
              <Card padding="sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-surface-900 dark:text-surface-50">
                      Расписание с rasp.dmami.ru
                    </div>
                    <div className="text-sm text-surface-500 dark:text-surface-400">
                      Актуальное расписание для группы {effectiveGroup}
                    </div>
                  </div>
                </div>
              </Card>
              <Card padding="sm">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-success-50 dark:bg-success-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-success-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-medium text-surface-900 dark:text-surface-50">
                      Задания от группы
                    </div>
                    <div className="text-sm text-surface-500 dark:text-surface-400">
                      Совместное ведение дедлайнов с голосованием
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            <label className="flex items-center gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleConfirmed}
                onChange={(e) => setScheduleConfirmed(e.target.checked)}
                className="w-5 h-5 rounded border-surface-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-surface-700 dark:text-surface-300">
                Всё верно, это моя группа
              </span>
            </label>

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              onClick={goNext}
              disabled={!scheduleConfirmed}
            >
              Подтвердить
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
              Расписание импортировано, можно начинать
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
