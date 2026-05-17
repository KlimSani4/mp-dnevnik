import { useState, useEffect } from 'react';
const THEME_PARAM_TO_CSS_VAR = {
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
};
function applyTheme(tg) {
    const root = document.documentElement;
    const params = tg.themeParams;
    for (const [param, cssVar] of Object.entries(THEME_PARAM_TO_CSS_VAR)) {
        const value = params[param];
        if (value) {
            root.style.setProperty(cssVar, value);
        }
    }
    if (tg.colorScheme === 'dark') {
        root.classList.add('dark');
    }
    else {
        root.classList.remove('dark');
    }
}
export function useTelegramWebApp() {
    const [webApp, setWebApp] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [viewportHeight, setViewportHeight] = useState(null);
    useEffect(() => {
        const tgWebApp = window.Telegram?.WebApp;
        if (!tgWebApp)
            return;
        setWebApp(tgWebApp);
        setIsReady(true);
        // Apply initial theme
        applyTheme(tgWebApp);
        // Re-apply on theme changes (user switches dark/light in Telegram)
        const handleThemeChanged = () => applyTheme(tgWebApp);
        tgWebApp.onEvent('themeChanged', handleThemeChanged);
        // Track viewport height changes (keyboard show/hide, etc.)
        const handleViewportChanged = () => {
            setViewportHeight(tgWebApp.viewportStableHeight);
        };
        tgWebApp.onEvent('viewportChanged', handleViewportChanged);
        return () => {
            tgWebApp.offEvent('themeChanged', handleThemeChanged);
            tgWebApp.offEvent('viewportChanged', handleViewportChanged);
        };
    }, []);
    return { webApp, isReady, viewportHeight };
}
export function useHapticFeedback() {
    const { webApp } = useTelegramWebApp();
    return {
        impact: (style = 'light') => {
            webApp?.HapticFeedback.impactOccurred(style);
        },
        notification: (type) => {
            webApp?.HapticFeedback.notificationOccurred(type);
        },
        selection: () => {
            webApp?.HapticFeedback.selectionChanged();
        },
    };
}
