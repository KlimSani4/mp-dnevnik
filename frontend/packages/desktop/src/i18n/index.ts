/**
 * Переводы интерфейса (#52).
 *
 * Тексты лежат в `ru.ts` (источник и список ключей) и `en.ts`. TypeScript не даст
 * собрать проект, если в `en.ts` не хватает ключа из `ru.ts`.
 *
 * - В компонентах: `const { t, tp } = useT()`.
 * - Вне компонентов (хелперы, константы): `translate(key)`; компонент, который их
 *   вызывает, должен подписаться на язык через `useT()` или `useLang()`.
 * - Параметры: `t('subjects.count', { n: 5 })` для строки `«{n} предметов»`.
 * - Множественное число: `tp('plural.days', 3)` — формы через `|`:
 *   ru — «одна|несколько|много» (день|дня|дней), en — «one|other» (day|days).
 */
import { useCallback } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { enUS, ru as ruDateLocale } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { ru } from './ru'
import { en } from './en'

export type Lang = 'ru' | 'en'
export type MessageKey = keyof typeof ru
export type Messages = Record<MessageKey, string>
type Params = Record<string, string | number>

export const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
]

const dictionaries: Record<Lang, Messages> = { ru, en }
const dateLocales: Record<Lang, Locale> = { ru: ruDateLocale, en: enUS }

function detectLang(): Lang {
  if (typeof navigator === 'undefined') return 'ru'
  return navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLangStore = create<LangState>()(
  persist(
    (set) => ({
      lang: detectLang(),
      setLang: (lang) => set({ lang }),
    }),
    { name: 'nexora-lang' }
  )
)

// <html lang> — для скринридеров и переносов
function syncHtmlLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = lang
}
syncHtmlLang(useLangStore.getState().lang)
useLangStore.subscribe((s) => syncHtmlLang(s.lang))

function interpolate(text: string, params?: Params): string {
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m
  )
}

export function translate(key: MessageKey, params?: Params, lang = useLangStore.getState().lang): string {
  return interpolate(dictionaries[lang][key] ?? ru[key] ?? key, params)
}

/** Форма множественного числа: `{n}` в строке заменяется числом. */
export function translatePlural(
  key: MessageKey,
  n: number,
  params?: Params,
  lang = useLangStore.getState().lang
): string {
  const forms = (dictionaries[lang][key] ?? ru[key]).split('|')
  const category = new Intl.PluralRules(lang === 'ru' ? 'ru-RU' : 'en-US').select(Math.abs(n))
  const index =
    lang === 'ru'
      ? category === 'one' ? 0 : category === 'few' ? 1 : 2
      : category === 'one' ? 0 : 1
  const form = forms[Math.min(index, forms.length - 1)]
  return interpolate(form, { n, ...params })
}

export function dateLocale(lang = useLangStore.getState().lang): Locale {
  return dateLocales[lang]
}

export function useLang(): Lang {
  return useLangStore((s) => s.lang)
}

export function useT() {
  const lang = useLang()
  const t = useCallback((key: MessageKey, params?: Params) => translate(key, params, lang), [lang])
  const tp = useCallback(
    (key: MessageKey, n: number, params?: Params) => translatePlural(key, n, params, lang),
    [lang]
  )
  return { t, tp, lang, locale: dateLocales[lang] }
}
