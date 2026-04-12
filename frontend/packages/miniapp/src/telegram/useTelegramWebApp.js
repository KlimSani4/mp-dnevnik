import { useState, useEffect } from 'react';
export function useTelegramWebApp() {
    const [webApp, setWebApp] = useState(null);
    const [isReady, setIsReady] = useState(false);
    useEffect(() => {
        const tgWebApp = window.Telegram?.WebApp;
        if (tgWebApp) {
            setWebApp(tgWebApp);
            setIsReady(true);
        }
    }, []);
    return { webApp, isReady };
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
