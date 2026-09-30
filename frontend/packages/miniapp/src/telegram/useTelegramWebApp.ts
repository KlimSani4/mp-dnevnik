import { useState, useEffect } from 'react'

interface TelegramWebApp {
  ready: () => void
  expand: () => void
  close: () => void
  initData: string
  initDataUnsafe: {
    user?: {
      id: number
      first_name: string
      last_name?: string
      username?: string
    }
  }
  colorScheme: 'light' | 'dark'
  themeParams: {
    bg_color?: string
    text_color?: string
    hint_color?: string
    link_color?: string
    button_color?: string
    button_text_color?: string
    secondary_bg_color?: string
    header_bg_color?: string
    accent_text_color?: string
    section_bg_color?: string
    section_header_text_color?: string
    subtitle_text_color?: string
    destructive_text_color?: string
    [key: string]: string | undefined
  }
  viewportHeight: number
  viewportStableHeight: number
  isExpanded: boolean
  onEvent: (eventType: string, callback: () => void) => void
  offEvent: (eventType: string, callback: () => void) => void
  MainButton: {
    text: string
    color: string
    textColor: string
    isVisible: boolean
    isActive: boolean
    show: () => void
    hide: () => void
    enable: () => void
    disable: () => void
    setText: (text: string) => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
  }
  BackButton: {
    isVisible: boolean
    show: () => void
    hide: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
  }
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void
    selectionChanged: () => void
  }
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp
    }
  }
}

const THEME_PARAM_TO_CSS_VAR: Record<string, string> = {
  bg_color: '--tg-theme-bg-color',
  text_color: '--tg-theme-text-color',
  hint_color: '--tg-theme-hint-color',
  link_color: '--tg-theme-link-color',
  button_color: '--tg-theme-button-color',
  button_text_color: '--tg-theme-button-text-color',
  secondary_bg_color: '--tg-theme-secondary-bg-color',
  header_bg_color: '--tg-theme-header-bg-color',
  accent_text_color: '--tg-theme-accent-text-color',
  section_bg_color: '--tg-theme-section-bg-color',
  section_header_text_color: '--tg-theme-section-header-text-color',
  subtitle_text_color: '--tg-theme-subtitle-text-color',
  destructive_text_color: '--tg-theme-destructive-text-color',
}

function applyTheme(tg: TelegramWebApp) {
  const root = document.documentElement
  const params = tg.themeParams

  for (const [param, cssVar] of Object.entries(THEME_PARAM_TO_CSS_VAR)) {
    const value = params[param]
    if (value) {
      root.style.setProperty(cssVar, value)
    }
  }

  if (tg.colorScheme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

export function useTelegramWebApp() {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

  useEffect(() => {
    const tgWebApp = window.Telegram?.WebApp
    if (!tgWebApp) return

    setWebApp(tgWebApp)
    setIsReady(true)

    // Apply initial theme
    applyTheme(tgWebApp)

    // Re-apply on theme changes (user switches dark/light in Telegram)
    const handleThemeChanged = () => applyTheme(tgWebApp)
    tgWebApp.onEvent('themeChanged', handleThemeChanged)

    // Track viewport height changes (keyboard show/hide, etc.)
    const handleViewportChanged = () => {
      setViewportHeight(tgWebApp.viewportStableHeight)
    }
    tgWebApp.onEvent('viewportChanged', handleViewportChanged)

    return () => {
      tgWebApp.offEvent('themeChanged', handleThemeChanged)
      tgWebApp.offEvent('viewportChanged', handleViewportChanged)
    }
  }, [])

  return { webApp, isReady, viewportHeight }
}

export function useHapticFeedback() {
  const { webApp } = useTelegramWebApp()

  return {
    impact: (style: 'light' | 'medium' | 'heavy' = 'light') => {
      webApp?.HapticFeedback.impactOccurred(style)
    },
    notification: (type: 'success' | 'error' | 'warning') => {
      webApp?.HapticFeedback.notificationOccurred(type)
    },
    selection: () => {
      webApp?.HapticFeedback.selectionChanged()
    },
  }
}
