import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTelegramWebApp } from './telegram/useTelegramWebApp';
import { TabBar } from './components/TabBar';
import { HomePage } from './pages/HomePage';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { TasksPage } from './pages/TasksPage';
import { ProfilePage } from './pages/ProfilePage';
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60 * 5,
            retry: 1,
        },
    },
});
export function App() {
    const { webApp, isReady } = useTelegramWebApp();
    useEffect(() => {
        if (webApp && isReady) {
            webApp.ready();
            webApp.expand();
        }
    }, [webApp, isReady]);
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(BrowserRouter, { children: _jsxs("div", { className: "min-h-screen pb-20", children: [_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(HomePage, {}) }), _jsx(Route, { path: "/assignments", element: _jsx(AssignmentsPage, {}) }), _jsx(Route, { path: "/tasks", element: _jsx(TasksPage, {}) }), _jsx(Route, { path: "/profile", element: _jsx(ProfilePage, {}) })] }), _jsx(TabBar, {})] }) }) }));
}
