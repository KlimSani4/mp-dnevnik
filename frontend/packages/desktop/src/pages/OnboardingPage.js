import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Button, Card, Input } from '../components/ui';
import { useSearchGroups, useJoinGroup, useAuthStore, useTelegramBotAuth, useTelegramBotPoll, useTodaySchedule } from '@nexora/shared';
const PAIR_TIMES = [
    { num: 1, start: '9:00', end: '10:30' },
    { num: 2, start: '10:40', end: '12:10' },
    { num: 3, start: '12:20', end: '13:50' },
    { num: 4, start: '14:30', end: '16:00' },
    { num: 5, start: '16:10', end: '17:40' },
];
export function OnboardingPage() {
    const navigate = useNavigate();
    const [step, setStep] = useState('welcome');
    const [groupCode, setGroupCode] = useState('');
    const [selectedGroup, setSelectedGroup] = useState('');
    const [loginError, setLoginError] = useState(null);
    const [joinResult, setJoinResult] = useState(null);
    const [previewConfirmed, setPreviewConfirmed] = useState(false);
    // Bot-based auth state
    const [pollToken, setPollToken] = useState(null);
    const [awaitingBot, setAwaitingBot] = useState(false);
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const botAuthMutation = useTelegramBotAuth();
    const searchGroupsQuery = useSearchGroups(groupCode.length >= 2 ? { search: groupCode } : undefined);
    const joinGroupMutation = useJoinGroup();
    const effectiveGroupCode = selectedGroup || groupCode.trim();
    const scheduleQuery = useTodaySchedule(step === 'preview' ? effectiveGroupCode : undefined);
    // Redirect if already authenticated and has gone through onboarding
    useEffect(() => {
        if (isAuthenticated && step === 'welcome') {
            navigate('/', { replace: true });
        }
    }, [isAuthenticated, step, navigate]);
    const displayedGroups = searchGroupsQuery.data?.map((g) => g.code) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const telegramContainerRef = useRef(null);
    const handleBotAuth = async () => {
        setLoginError(null);
        try {
            const { token, botUrl } = await botAuthMutation.mutateAsync();
            setPollToken(token);
            setAwaitingBot(true);
            window.open(botUrl, '_blank', 'noopener,noreferrer');
        }
        catch {
            setLoginError('Не удалось начать авторизацию. Попробуйте ещё раз.');
        }
    };
    const handlePollSuccess = () => {
        setPollToken(null);
        setAwaitingBot(false);
        goNext();
    };
    useTelegramBotPoll(pollToken, handlePollSuccess);
    const isValidGroup = /^\d{2,3}-\d{2,3}$/.test(effectiveGroupCode);
    const handleGroupInput = useCallback((value) => {
        setGroupCode(value);
        setSelectedGroup('');
    }, []);
    const selectGroup = (code) => {
        setSelectedGroup(code);
        setGroupCode(code);
    };
    const STEPS = ['welcome', 'group', 'preview', 'done'];
    const goNext = () => {
        const idx = STEPS.indexOf(step);
        if (idx < STEPS.length - 1)
            setStep(STEPS[idx + 1]);
    };
    const goBack = () => {
        const idx = STEPS.indexOf(step);
        if (idx > 0)
            setStep(STEPS[idx - 1]);
    };
    const handleGroupContinue = async () => {
        if (!isValidGroup)
            return;
        try {
            const result = await joinGroupMutation.mutateAsync(effectiveGroupCode);
            setJoinResult(result);
        }
        catch (err) {
            const status = err?.response?.status;
            if (status !== 409) {
                console.warn('joinGroup error:', err);
            }
        }
        goNext();
    };
    const finish = () => {
        navigate('/');
    };
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4", children: _jsxs("div", { className: "w-full max-w-lg", children: [_jsx("div", { className: "flex items-center justify-center gap-2 mb-8", children: ['welcome', 'group', 'preview', 'done'].map((s, i) => (_jsx("div", { className: clsx('h-2 rounded-full transition-all', s === step ? 'w-8 bg-primary-500' : 'w-2', i < ['welcome', 'group', 'preview', 'done'].indexOf(step)
                            ? 'bg-primary-300'
                            : s !== step
                                ? 'bg-surface-200 dark:bg-surface-700'
                                : '') }, s))) }), step === 'welcome' && (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center mx-auto mb-6", children: _jsx("svg", { className: "w-10 h-10 text-white", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", stroke: "currentColor", strokeWidth: "2", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), _jsx("h1", { className: "text-3xl font-bold text-surface-900 dark:text-surface-50 mb-3", children: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 Nexora" }), _jsx("p", { className: "text-surface-500 dark:text-surface-400 mb-2 text-lg", children: "\u0415\u0434\u0438\u043D\u043E\u0435 \u043C\u0435\u0441\u0442\u043E \u043F\u0440\u0430\u0432\u0434\u044B \u043E \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438 \u0438 \u0437\u0430\u0434\u0430\u043D\u0438\u044F\u0445" }), _jsx("p", { className: "text-surface-400 dark:text-surface-500 text-sm mb-8", children: "\u0414\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u043E\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 Telegram" }), !awaitingBot ? (_jsx(Button, { variant: "primary", size: "lg", className: "w-full max-w-xs mx-auto mb-4", onClick: handleBotAuth, disabled: botAuthMutation.isPending, children: botAuthMutation.isPending ? (_jsxs("span", { className: "flex items-center justify-center gap-2", children: [_jsxs("svg", { className: "w-4 h-4 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }), "\u041E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u043C \u0431\u043E\u0442..."] })) : ('Войти через Telegram') })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex items-center justify-center gap-2 text-surface-500 dark:text-surface-400", children: [_jsxs("svg", { className: "w-5 h-5 animate-spin text-primary-500", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }), _jsx("span", { className: "text-sm font-medium", children: "\u041E\u0436\u0438\u0434\u0430\u0435\u043C \u0430\u0432\u0442\u043E\u0440\u0438\u0437\u0430\u0446\u0438\u044E \u0432 \u0431\u043E\u0442\u0435..." })] }), _jsxs("div", { className: "bg-surface-100 dark:bg-surface-800 rounded-xl p-4 text-left space-y-2 text-sm text-surface-600 dark:text-surface-300", children: [_jsx("p", { className: "font-medium text-surface-900 dark:text-surface-50 mb-1", children: "\u0427\u0442\u043E \u0434\u0435\u043B\u0430\u0442\u044C:" }), _jsx("p", { children: "1. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 \u043A\u043D\u043E\u043F\u043A\u0443 \u0432\u044B\u0448\u0435 \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u044C \u0431\u043E\u0442\u0430" }), _jsxs("p", { children: ["2. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 ", _jsx("span", { className: "font-medium", children: "\u0421\u0442\u0430\u0440\u0442" }), " \u0432 \u0431\u043E\u0442\u0435"] }), _jsx("p", { children: "3. \u0412\u0435\u0440\u043D\u0438\u0442\u0435\u0441\u044C \u043D\u0430 \u044D\u0442\u0443 \u0441\u0442\u0440\u0430\u043D\u0438\u0446\u0443" })] }), _jsx("button", { onClick: () => {
                                        setPollToken(null);
                                        setAwaitingBot(false);
                                    }, className: "text-sm text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 underline", children: "\u041E\u0442\u043C\u0435\u043D\u0430" })] })), loginError && (_jsx("p", { className: "text-sm text-danger-500 mt-2", children: loginError }))] })), step === 'group' && (_jsxs("div", { children: [_jsxs("button", { onClick: goBack, className: "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 text-sm mb-6 flex items-center gap-1", children: [_jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 19l-7-7 7-7" }) }), "\u041D\u0430\u0437\u0430\u0434"] }), _jsx("h2", { className: "text-2xl font-bold text-surface-900 dark:text-surface-50 mb-2", children: "\u0412\u0432\u0435\u0434\u0438 \u043D\u043E\u043C\u0435\u0440 \u0441\u0432\u043E\u0435\u0439 \u0433\u0440\u0443\u043F\u043F\u044B" }), _jsx("p", { className: "text-surface-500 dark:text-surface-400 mb-6", children: "\u041C\u044B \u043D\u0430\u0439\u0434\u0451\u043C \u0442\u0432\u043E\u0451 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" }), _jsxs("div", { className: "relative", children: [_jsx(Input, { value: groupCode, onChange: (e) => handleGroupInput(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 241-237", className: "text-lg" }), displayedGroups.length > 0 && !selectedGroup && (_jsx("div", { className: "absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto", children: displayedGroups.map((g) => (_jsx("button", { onClick: () => selectGroup(g), className: "w-full text-left px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-700 text-sm text-surface-900 dark:text-surface-50 transition-colors", children: g }, g))) }))] }), _jsx(Button, { variant: "primary", size: "lg", className: "w-full mt-6", onClick: handleGroupContinue, disabled: !isValidGroup || joinGroupMutation.isPending, children: joinGroupMutation.isPending ? (_jsxs("span", { className: "flex items-center justify-center gap-2", children: [_jsxs("svg", { className: "w-4 h-4 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }), "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C..."] })) : ('Продолжить') })] })), step === 'preview' && (_jsxs("div", { children: [_jsxs("button", { onClick: goBack, className: "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 text-sm mb-6 flex items-center gap-1", children: [_jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 19l-7-7 7-7" }) }), "\u041D\u0430\u0437\u0430\u0434"] }), joinResult?.role === 'starosta' ? (_jsx("div", { className: "mb-5 rounded-xl bg-warning-50 dark:bg-warning-500/10 border border-warning-200 dark:border-warning-500/30 px-4 py-3", children: _jsx("p", { className: "text-sm font-medium text-warning-700 dark:text-warning-400", children: "\u0422\u044B \u043F\u0435\u0440\u0432\u044B\u0439 \u0432 \u0433\u0440\u0443\u043F\u043F\u0435! \u0422\u044B \u0441\u0442\u0430\u043B \u0441\u0442\u0430\u0440\u043E\u0441\u0442\u043E\u0439." }) })) : joinResult && !joinResult.verified ? (_jsx("div", { className: "mb-5 rounded-xl bg-surface-100 dark:bg-surface-800 border border-surface-200 dark:border-surface-700 px-4 py-3", children: _jsx("p", { className: "text-sm font-medium text-surface-700 dark:text-surface-300", children: "\u0417\u0430\u043F\u0440\u043E\u0441 \u043D\u0430 \u0432\u0441\u0442\u0443\u043F\u043B\u0435\u043D\u0438\u0435 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D. \u041E\u0436\u0438\u0434\u0430\u0439 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F \u0441\u0442\u0430\u0440\u043E\u0441\u0442\u044B." }) })) : null, _jsx("h2", { className: "text-2xl font-bold text-surface-900 dark:text-surface-50 mb-1", children: "\u0412\u043E\u0442 \u0442\u0432\u043E\u0451 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsxs("p", { className: "text-surface-500 dark:text-surface-400 text-sm mb-5", children: ["\u0413\u0440\u0443\u043F\u043F\u0430 ", _jsx("span", { className: "font-semibold text-surface-900 dark:text-surface-50", children: effectiveGroupCode }), " \u00B7 \u0441\u0435\u0433\u043E\u0434\u043D\u044F"] }), scheduleQuery.isLoading && (_jsxs("div", { className: "flex items-center gap-2 text-surface-500 dark:text-surface-400 py-4", children: [_jsxs("svg", { className: "w-4 h-4 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] }), _jsx("span", { className: "text-sm", children: "\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043C \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435..." })] })), scheduleQuery.isError && (_jsx("div", { className: "rounded-xl bg-surface-100 dark:bg-surface-800 px-4 py-3 text-sm text-surface-500 dark:text-surface-400 mb-4", children: "\u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044C \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435. \u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0430\u0439 \u2014 \u043E\u043D\u043E \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u043F\u043E\u0437\u0436\u0435." })), scheduleQuery.data && (_jsx("div", { className: "space-y-2 mb-5", children: scheduleQuery.data.entries.length === 0 ? (_jsx("div", { className: "rounded-xl bg-surface-100 dark:bg-surface-800 px-4 py-4 text-sm text-surface-500 dark:text-surface-400 text-center", children: "\u041F\u0430\u0440 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u043D\u0435\u0442" })) : (scheduleQuery.data.entries.map((entry) => (_jsx(Card, { className: "px-4 py-3", children: _jsxs("div", { className: "flex items-start gap-3", children: [_jsxs("div", { className: "text-xs font-medium text-surface-400 dark:text-surface-500 w-14 shrink-0 mt-0.5", children: [_jsx("div", { children: entry.start_time }), _jsx("div", { children: entry.end_time })] }), _jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "text-sm font-semibold text-surface-900 dark:text-surface-50 truncate", children: entry.subject.name }), _jsx("p", { className: "text-xs text-surface-500 dark:text-surface-400 mt-0.5", children: [entry.lesson_type, entry.room, entry.teacher]
                                                        .filter(Boolean)
                                                        .join(' · ') })] })] }) }, entry.id)))) })), _jsxs("label", { className: "flex items-center gap-3 cursor-pointer mb-6 select-none", children: [_jsx("input", { type: "checkbox", checked: previewConfirmed, onChange: (e) => setPreviewConfirmed(e.target.checked), className: "w-4 h-4 rounded border-surface-300 text-primary-500 focus:ring-primary-500" }), _jsx("span", { className: "text-sm text-surface-700 dark:text-surface-300", children: "\u0412\u0441\u0451 \u0432\u0435\u0440\u043D\u043E, \u043F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] }), _jsx(Button, { variant: "primary", size: "lg", className: "w-full", onClick: goNext, disabled: !previewConfirmed && !scheduleQuery.isError, children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] })), step === 'done' && (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "w-20 h-20 rounded-full bg-success-100 dark:bg-success-500/20 flex items-center justify-center mx-auto mb-6", children: _jsx("svg", { className: "w-10 h-10 text-success-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" }) }) }), _jsx("h2", { className: "text-2xl font-bold text-surface-900 dark:text-surface-50 mb-3", children: "\u0413\u043E\u0442\u043E\u0432\u043E!" }), joinResult?.role === 'starosta' ? (_jsxs("p", { className: "text-surface-500 dark:text-surface-400 mb-2", children: ["\u0422\u044B \u0432 \u0433\u0440\u0443\u043F\u043F\u0435 ", _jsx("span", { className: "font-semibold text-surface-900 dark:text-surface-50", children: effectiveGroupCode }), " \u043A\u0430\u043A ", _jsx("span", { className: "font-semibold text-warning-600 dark:text-warning-400", children: "\u0421\u0442\u0430\u0440\u043E\u0441\u0442\u0430" })] })) : (_jsxs("p", { className: "text-surface-500 dark:text-surface-400 mb-2", children: ["\u0422\u044B \u0432 \u0433\u0440\u0443\u043F\u043F\u0435 ", _jsx("span", { className: "font-semibold text-surface-900 dark:text-surface-50", children: effectiveGroupCode })] })), _jsx("p", { className: "text-surface-400 dark:text-surface-500 text-sm mb-8", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u0441\u044F \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" }), _jsx(Button, { variant: "primary", size: "lg", className: "w-full max-w-xs mx-auto", onClick: finish, children: "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0434\u0430\u0448\u0431\u043E\u0440\u0434\u0443" })] }))] }) }));
}
