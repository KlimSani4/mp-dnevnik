import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTelegramWebApp } from './telegram/useTelegramWebApp';
import { TabBar } from './components/TabBar';
import { HomePage } from './pages/HomePage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { TasksPage } from './pages/TasksPage';
import { ProfilePage } from './pages/ProfilePage';
import { useLoginWithTelegram } from '@nexora/shared';
import { useAuthStore } from '@nexora/shared';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            retry: 1,
        },
    },
});
function AuthGate({ children }) {
    const { webApp, isReady } = useTelegramWebApp();
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const loginWithTelegram = useLoginWithTelegram();
    const [authAttempted, setAuthAttempted] = useState(false);
    useEffect(() => {
        if (!isReady || isAuthenticated || authAttempted)
            return;
        const initData = webApp?.initData;
        if (initData) {
            setAuthAttempted(true);
            loginWithTelegram.mutate({ init_data: initData });
        }
        else {
            // No initData (running outside Telegram) — mark as attempted so we don't loop
            setAuthAttempted(true);
        }
    }, [isReady, isAuthenticated, authAttempted, webApp, loginWithTelegram]);
    const isLoading = loginWithTelegram.isPending || (!authAttempted && isReady && !isAuthenticated);
    if (isLoading) {
        return (_jsxs("div", { style: {
                minHeight: '100vh',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--tg-theme-bg-color)',
                gap: 16,
            }, children: [_jsx("div", { style: {
                        width: 36,
                        height: 36,
                        border: '3px solid var(--tg-theme-hint-color)',
                        borderTopColor: 'var(--tg-theme-button-color)',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                    } }), _jsx("style", { children: `@keyframes spin { to { transform: rotate(360deg); } }` }), _jsx("span", { style: { color: 'var(--tg-theme-hint-color)', fontSize: 14 }, children: "\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430..." })] }));
    }
    return _jsx(_Fragment, { children: children });
}
function AppInner() {
    const { webApp, isReady } = useTelegramWebApp();
    useEffect(() => {
        if (!webApp || !isReady)
            return;
        webApp.ready();
        webApp.expand();
        // Wire up back button — theme sync happens inside useTelegramWebApp
        const handleBack = () => window.history.back();
        webApp.BackButton.onClick(handleBack);
        return () => {
            webApp.BackButton.offClick(handleBack);
        };
    }, [webApp, isReady]);
    return (_jsx(AuthGate, { children: _jsx(BrowserRouter, { children: _jsxs("div", { className: "min-h-screen pb-20", children: [_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(HomePage, {}) }), _jsx(Route, { path: "/assignments", element: _jsx(AssignmentsPage, {}) }), _jsx(Route, { path: "/tasks", element: _jsx(TasksPage, {}) }), _jsx(Route, { path: "/profile", element: _jsx(ProfilePage, {}) })] }), _jsx(TabBar, {})] }) }) }));
}
export function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(AppInner, {}) }));
}
