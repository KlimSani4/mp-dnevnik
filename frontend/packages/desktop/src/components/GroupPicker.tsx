/**
 * Вступить в группу или создать её (#146). Используется в Настройках и при первом входе.
 *
 * Два явных пути:
 * - «Вступить» — поиск среди групп Nexora, заявка уходит старосте;
 * - «Создать» — код проверяется по расписанию rasp.dmami.ru, создатель становится
 *   старостой, расписание подтягивается сразу.
 */
import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { ApiClientError, useCreateGroup, useJoinGroup, useMyGroups, useSearchGroups } from '@nexora/shared'
import { Button, Input, Modal } from './ui'
import { useT } from '../i18n'

type Mode = 'join' | 'create'

export interface GroupPickerResult {
  code: string
  created: boolean
}

interface GroupPickerProps {
  onDone?: (result: GroupPickerResult) => void
}

// Сравнение кодов как на бэкенде: регистр и латинские двойники кириллицы не важны
const LOOKALIKES: Record<string, string> = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' }
export function normalizeGroupCode(code: string): string {
  return code.replace(/\s+/g, '').toUpperCase().replace(/[ABCEHKMOPTXY]/g, (c) => LOOKALIKES[c]).replace(/[–—]/g, '-')
}

export function GroupPicker({ onDone }: GroupPickerProps) {
  const { t } = useT()
  const [mode, setMode] = useState<Mode>('join')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; offerJoin?: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const myGroups = useMyGroups().data ?? []
  const search = useSearchGroups(mode === 'join' && debounced.length >= 2 ? { search: debounced } : undefined)
  const join = useJoinGroup()
  const create = useCreateGroup()
  const busy = join.isPending || create.isPending
  // Человек состоит максимум в одной группе (#162): вступление в другую — это смена
  const [switching, setSwitching] = useState<{ kind: Mode; code: string } | null>(null)
  const currentCode = myGroups[0]?.group.code

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const onQuery = (value: string) => {
    setQuery(value)
    setMessage(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setDebounced(value.trim()), 350)
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setMessage(null)
  }

  const inOtherGroup = (e: unknown) => e instanceof ApiClientError && e.code === 'ALREADY_IN_GROUP'

  const doJoin = async (code: string, switchGroup = false) => {
    setMessage(null)
    try {
      await join.mutateAsync({ code, switchGroup })
      setSwitching(null)
      setMessage({ kind: 'ok', text: t(switchGroup ? 'groupPicker.switchedJoin' : 'groupPicker.joined', { code }) })
      onDone?.({ code, created: false })
    } catch (e) {
      if (inOtherGroup(e)) {
        setSwitching({ kind: 'join', code })
        return
      }
      setSwitching(null)
      const status = e instanceof ApiClientError ? e.status : 0
      setMessage({
        kind: 'error',
        text: status === 409 ? t('settings.alreadyMember') : status === 404 ? t('groupPicker.notInNexora', { code }) : t('settings.joinError'),
      })
    }
  }

  const doCreate = async (switchGroup = false) => {
    const code = query.trim()
    if (!code) return
    setMessage(null)
    try {
      const group = await create.mutateAsync({ code, switchGroup })
      setSwitching(null)
      setMessage({ kind: 'ok', text: t('groupPicker.created', { code: group.code }) })
      onDone?.({ code: group.code, created: true })
    } catch (e) {
      if (inOtherGroup(e)) {
        setSwitching({ kind: 'create', code })
        return
      }
      setSwitching(null)
      const status = e instanceof ApiClientError ? e.status : 0
      if (status === 409) {
        setMessage({ kind: 'error', text: t('groupPicker.exists', { code }), offerJoin: code })
      } else if (status === 404) {
        setMessage({ kind: 'error', text: t('groupPicker.notOnRasp', { code }) })
      } else if (status === 502 || status === 503) {
        setMessage({ kind: 'error', text: t('groupPicker.raspDown') })
      } else {
        setMessage({ kind: 'error', text: t('groupPicker.createError') })
      }
    }
  }

  const results = search.data ?? []
  const exact = results.some((g) => normalizeGroupCode(g.code) === normalizeGroupCode(debounced))

  return (
    <div>
      <Modal open={!!switching} onClose={() => setSwitching(null)} title={t('groupSwitch.title', { code: switching?.code ?? '' })}>
        <p className="text-sm text-surface-700 dark:text-surface-200">
          {t('groupSwitch.only', { current: currentCode ?? '' })}
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-surface-600 dark:text-surface-300">
          <li>• {t('groupSwitch.schedule', { code: switching?.code ?? '' })}</li>
          <li>• {t('groupSwitch.personal')}</li>
          <li>• {t('groupSwitch.lost', { current: currentCode ?? '' })}</li>
          {switching?.kind === 'join' && <li>• {t('groupSwitch.request')}</li>}
          {myGroups[0]?.role === 'starosta' && <li>• {t('groupSwitch.starosta')}</li>}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setSwitching(null)}>{t('groupLeave.cancel')}</Button>
          <Button
            disabled={busy}
            onClick={() => {
              if (!switching) return
              if (switching.kind === 'join') void doJoin(switching.code, true)
              else void doCreate(true)
            }}
          >
            {t('groupSwitch.confirm', { code: switching?.code ?? '' })}
          </Button>
        </div>
      </Modal>
      <div role="tablist" className="inline-flex w-full rounded-lg bg-surface-100 p-1 dark:bg-surface-700 sm:w-auto">
        {(['join', 'create'] as Mode[]).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            type="button"
            onClick={() => switchMode(m)}
            className={clsx(
              'flex-1 rounded-md px-4 py-1.5 text-sm font-medium transition-colors sm:flex-none',
              mode === m
                ? 'bg-white text-surface-900 shadow-sm dark:bg-surface-800 dark:text-surface-50'
                : 'text-surface-500 hover:text-surface-700 dark:text-surface-400',
            )}
          >
            {t(m === 'join' ? 'groupPicker.joinTab' : 'groupPicker.createTab')}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs text-surface-500 dark:text-surface-400">
        {t(mode === 'join' ? 'groupPicker.joinHint' : 'groupPicker.createHint')}
      </p>

      <div className="mt-3 flex gap-2">
        <div className="min-w-0 flex-1">
        <Input
          placeholder={t('settings.groupPlaceholder')}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && mode === 'create') void doCreate() }}
          aria-label={t('settings.groupPlaceholder')}
        />
        </div>
        {mode === 'create' && (
          <Button disabled={!query.trim() || busy} onClick={() => void doCreate()}>
            {t('groupPicker.create')}
          </Button>
        )}
      </div>

      {message && (
        <div
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={clsx(
            'mt-3 rounded-lg px-3 py-2 text-sm',
            message.kind === 'ok'
              ? 'bg-success-50 text-success-700 dark:bg-success-500/10 dark:text-success-500'
              : 'bg-danger-50 text-danger-700 dark:bg-danger-500/10 dark:text-danger-500',
          )}
        >
          {message.text}
          {message.offerJoin && (
            <button
              type="button"
              className="ml-2 font-medium underline"
              onClick={() => { switchMode('join'); onQuery(message.offerJoin!) }}
            >
              {t('groupPicker.goJoin')}
            </button>
          )}
        </div>
      )}

      {mode === 'join' && debounced.length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-lg border border-surface-200 dark:border-surface-700">
          {search.isLoading ? (
            <div className="px-4 py-3 text-sm text-surface-500 dark:text-surface-400">{t('settings.searching')}</div>
          ) : (
            <>
              {results.map((group) => {
                const member = myGroups.some((m) => m.group.code === group.code)
                return (
                  <div key={group.id} className="flex items-center justify-between border-b border-surface-100 px-4 py-3 last:border-0 dark:border-surface-700">
                    <div className="text-sm font-medium text-surface-900 dark:text-surface-50">{group.code}</div>
                    <Button variant="secondary" size="sm" disabled={member || busy} onClick={() => void doJoin(group.code)}>
                      {member ? t('settings.inGroup') : currentCode ? t('groupSwitch.button') : t('settings.join')}
                    </Button>
                  </div>
                )
              })}
              {!exact && (
                <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-50 px-4 py-3 dark:bg-surface-800/60">
                  <span className="text-sm text-surface-600 dark:text-surface-300">
                    {t('groupPicker.noSuchGroup', { code: debounced })}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => switchMode('create')}>
                    {t('groupPicker.createInstead')}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
