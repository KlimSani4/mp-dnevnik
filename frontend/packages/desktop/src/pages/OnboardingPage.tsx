import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Button, Card, Input } from '../components/ui'
import { useLoginWithTelegram, useSearchGroups, useJoinGroup, useAuthStore, useApi } from '@nexora/shared'

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

type Step = 'welcome' | 'group' | 'subgroup' | 'schedule' | 'done'

const PAIR_TIMES = [
  { num: 1, start: '9:00', end: '10:30' },
  { num: 2, start: '10:40', end: '12:10' },
  { num: 3, start: '12:20', end: '13:50' },
  { num: 4, start: '14:30', end: '16:00' },
  { num: 5, start: '16:10', end: '17:40' },
]

// Mock schedule for preview
const MOCK_PREVIEW = [
  { pair: 1, subject: 'Математический анализ', teacher: 'Иванов А.П.', room: 'Н-406', type: 'лекция' },
  { pair: 2, subject: 'Линейная алгебра', teacher: 'Петрова М.С.', room: 'Н-312', type: 'практика' },
  { pair: 4, subject: 'Программирование', teacher: 'Сидоров К.В.', room: 'Пр-120', type: 'лаб' },
]

// Mock group suggestions
const GROUP_SUGGESTIONS = [
  '241-231', '241-232', '241-233', '241-234', '241-235', '241-236', '241-237', '241-238',
]

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('welcome')
  const [groupCode, setGroupCode] = useState('')
  const [filteredGroups, setFilteredGroups] = useState<string[]>([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [subgroup, setSubgroup] = useState<1 | 2 | null>(null)
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false)

  // API hooks (only active when SKIP_AUTH=false)
  const api = useApi()
  const setTokens = useAuthStore((s) => s.setTokens)
  const loginMutation = useLoginWithTelegram()
  const searchGroupsQuery = useSearchGroups(
    !SKIP_AUTH && groupCode.length >= 2 ? { search: groupCode } : undefined
  )
  const joinGroupMutation = useJoinGroup()
  const setSelectedGroupStore = useAuthStore((s) => s.setSelectedGroup)

  // Computed group list: mock filtering vs API results
  const displayedGroups = SKIP_AUTH
    ? filteredGroups
    : (searchGroupsQuery.data?.map((g) => g.code) ?? [])

  const [devLoginPending, setDevLoginPending] = useState(false)
  const handleDevLogin = async () => {
    setDevLoginPending(true)
    try {
      const tokens = await api.auth.devLogin({ telegram_id: '12345' })
      setTokens(tokens)
      goNext()
    } catch (err) {
      console.error('Dev login failed:', err)
    } finally {
      setDevLoginPending(false)
    }
  }

  // Effective group: either selected from dropdown or typed manually
  const effectiveGroup = selectedGroup || groupCode.trim()
  const isValidGroup = /^\d{2,3}-\d{2,3}$/.test(effectiveGroup)

  const handleGroupInput = useCallback((value: string) => {
    setGroupCode(value)
    setSelectedGroup('') // reset dropdown selection on manual edit
    if (value.length >= 2) {
      setFilteredGroups(
        GROUP_SUGGESTIONS.filter((g) => g.toLowerCase().includes(value.toLowerCase()))
      )
    } else {
      setFilteredGroups([])
    }
  }, [])

  const selectGroup = (code: string) => {
    setSelectedGroup(code)
    setGroupCode(code)
    setFilteredGroups([])
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
    if (!SKIP_AUTH && effectiveGroup) {
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

            {/* Telegram Login Widget placeholder */}
            <Button
              variant="primary"
              size="lg"
              className="w-full max-w-xs mx-auto"
              onClick={SKIP_AUTH ? goNext : handleDevLogin}
              disabled={!SKIP_AUTH && devLoginPending}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              Войти через Telegram
            </Button>
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
              Вот твоё расписание
            </h2>
            <p className="text-surface-500 dark:text-surface-400 mb-6">
              Группа {effectiveGroup}{subgroup ? `, подгруппа ${subgroup}` : ''} — понедельник
            </p>

            <div className="space-y-3 mb-6">
              {MOCK_PREVIEW.map((item) => {
                const time = PAIR_TIMES.find((t) => t.num === item.pair)
                return (
                  <Card key={item.pair} padding="sm">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-surface-100 dark:bg-surface-700 flex items-center justify-center text-sm font-bold text-surface-500">
                        {item.pair}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-surface-900 dark:text-surface-50">
                          {item.subject}
                        </div>
                        <div className="text-sm text-surface-500 dark:text-surface-400">
                          {time?.start} — {time?.end} · {item.room}
                        </div>
                        <div className="text-sm text-surface-400 dark:text-surface-500 mt-0.5">
                          {item.teacher} · {item.type}
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>

            <label className="flex items-center gap-3 mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleConfirmed}
                onChange={(e) => setScheduleConfirmed(e.target.checked)}
                className="w-5 h-5 rounded border-surface-300 text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-surface-700 dark:text-surface-300">
                Всё верно, это моё расписание
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
