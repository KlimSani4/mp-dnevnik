import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Button, Card, Input } from '../components/ui';
import { useLoginWithTelegram, useSearchGroups, useJoinGroup, useAuthStore } from '@nexora/shared';
const BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? 'nexora_mospolytech_bot';
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
    const [subgroup, setSubgroup] = useState(null);
    const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
    const [loginError, setLoginError] = useState(null);
    const loginMutation = useLoginWithTelegram();
    const searchGroupsQuery = useSearchGroups(groupCode.length >= 2 ? { search: groupCode } : undefined);
    const joinGroupMutation = useJoinGroup();
    const setSelectedGroupStore = useAuthStore((s) => s.setSelectedGroup);
    const displayedGroups = searchGroupsQuery.data?.map((g) => g.code) ?? [];
    const telegramContainerRef = useRef(null);
    useEffect(() => {
        if (step !== 'welcome')
            return;
        const container = telegramContainerRef.current;
        if (!container)
            return;
        // Clean up any existing widget
        container.innerHTML = '';
        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-login', BOT_USERNAME);
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-request-access', 'write');
        script.setAttribute('data-onauth', 'onTelegramAuth(user)');
        script.async = true;
        container.appendChild(script);
        window.onTelegramAuth = async (user) => {
            setLoginError(null);
            try {
                await loginMutation.mutateAsync({ widget_data: user });
                goNext();
            }
            catch {
                setLoginError('Не удалось войти через Telegram. Попробуйте ещё раз.');
            }
        };
        return () => {
            delete window.onTelegramAuth;
            if (container)
                container.innerHTML = '';
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step]);
    const effectiveGroup = selectedGroup || groupCode.trim();
    const isValidGroup = /^\d{2,3}-\d{2,3}$/.test(effectiveGroup);
    const handleGroupInput = useCallback((value) => {
        setGroupCode(value);
        setSelectedGroup('');
    }, []);
    const selectGroup = (code) => {
        setSelectedGroup(code);
        setGroupCode(code);
    };
    const goNext = () => {
        const steps = ['welcome', 'group', 'subgroup', 'schedule', 'done'];
        const idx = steps.indexOf(step);
        if (idx < steps.length - 1)
            setStep(steps[idx + 1]);
    };
    const goBack = () => {
        const steps = ['welcome', 'group', 'subgroup', 'schedule', 'done'];
        const idx = steps.indexOf(step);
        if (idx > 0)
            setStep(steps[idx - 1]);
    };
    const finish = async () => {
        if (effectiveGroup) {
            try {
                const membership = await joinGroupMutation.mutateAsync(effectiveGroup);
                setSelectedGroupStore(membership.group.id, membership.group.code);
            }
            catch {
                // group might already be joined, proceed anyway
            }
        }
        navigate('/');
    };
    return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-surface-50 dark:bg-surface-900 p-4", children: _jsxs("div", { className: "w-full max-w-lg", children: [_jsx("div", { className: "flex items-center justify-center gap-2 mb-8", children: ['welcome', 'group', 'subgroup', 'schedule', 'done'].map((s, i) => (_jsx("div", { className: clsx('h-2 rounded-full transition-all', s === step ? 'w-8 bg-primary-500' : 'w-2', i < ['welcome', 'group', 'subgroup', 'schedule', 'done'].indexOf(step)
                            ? 'bg-primary-300'
                            : s !== step
                                ? 'bg-surface-200 dark:bg-surface-700'
                                : '') }, s))) }), step === 'welcome' && (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "w-20 h-20 rounded-full bg-primary-500 flex items-center justify-center mx-auto mb-6", children: _jsx("svg", { className: "w-10 h-10 text-white", viewBox: "0 0 24 24", fill: "currentColor", children: _jsx("path", { d: "M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5", stroke: "currentColor", strokeWidth: "2", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }) }) }), _jsx("h1", { className: "text-3xl font-bold text-surface-900 dark:text-surface-50 mb-3", children: "\u0414\u043E\u0431\u0440\u043E \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C \u0432 Nexora" }), _jsx("p", { className: "text-surface-500 dark:text-surface-400 mb-2 text-lg", children: "\u0415\u0434\u0438\u043D\u043E\u0435 \u043C\u0435\u0441\u0442\u043E \u043F\u0440\u0430\u0432\u0434\u044B \u043E \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0438 \u0438 \u0437\u0430\u0434\u0430\u043D\u0438\u044F\u0445" }), _jsx("p", { className: "text-surface-400 dark:text-surface-500 text-sm mb-8", children: "\u0414\u043B\u044F \u043D\u0430\u0447\u0430\u043B\u0430 \u0432\u043E\u0439\u0434\u0438 \u0447\u0435\u0440\u0435\u0437 Telegram" }), _jsx("div", { className: "flex justify-center mb-4", children: _jsx("div", { ref: telegramContainerRef, id: "telegram-login-container" }) }), loginMutation.isPending && (_jsx("p", { className: "text-sm text-surface-500 dark:text-surface-400 mt-2", children: "\u0412\u0445\u043E\u0434..." })), loginError && (_jsx("p", { className: "text-sm text-danger-500 mt-2", children: loginError }))] })), step === 'group' && (_jsxs("div", { children: [_jsxs("button", { onClick: goBack, className: "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 text-sm mb-6 flex items-center gap-1", children: [_jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 19l-7-7 7-7" }) }), "\u041D\u0430\u0437\u0430\u0434"] }), _jsx("h2", { className: "text-2xl font-bold text-surface-900 dark:text-surface-50 mb-2", children: "\u0412\u0432\u0435\u0434\u0438 \u043D\u043E\u043C\u0435\u0440 \u0441\u0432\u043E\u0435\u0439 \u0433\u0440\u0443\u043F\u043F\u044B" }), _jsx("p", { className: "text-surface-500 dark:text-surface-400 mb-6", children: "\u041C\u044B \u043D\u0430\u0439\u0434\u0451\u043C \u0442\u0432\u043E\u0451 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438" }), _jsxs("div", { className: "relative", children: [_jsx(Input, { value: groupCode, onChange: (e) => handleGroupInput(e.target.value), placeholder: "\u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, 241-237", className: "text-lg" }), displayedGroups.length > 0 && !selectedGroup && (_jsx("div", { className: "absolute top-full left-0 right-0 mt-1 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto", children: displayedGroups.map((g) => (_jsx("button", { onClick: () => selectGroup(g), className: "w-full text-left px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-700 text-sm text-surface-900 dark:text-surface-50 transition-colors", children: g }, g))) }))] }), _jsx(Button, { variant: "primary", size: "lg", className: "w-full mt-6", onClick: goNext, disabled: !isValidGroup, children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] })), step === 'subgroup' && (_jsxs("div", { children: [_jsxs("button", { onClick: goBack, className: "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 text-sm mb-6 flex items-center gap-1", children: [_jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 19l-7-7 7-7" }) }), "\u041D\u0430\u0437\u0430\u0434"] }), _jsx("h2", { className: "text-2xl font-bold text-surface-900 dark:text-surface-50 mb-2", children: "\u0412\u044B\u0431\u0435\u0440\u0438 \u043F\u043E\u0434\u0433\u0440\u0443\u043F\u043F\u0443" }), _jsxs("p", { className: "text-surface-500 dark:text-surface-400 mb-6", children: ["\u0413\u0440\u0443\u043F\u043F\u0430 ", effectiveGroup, " \u2014 \u0432\u044B\u0431\u0435\u0440\u0438 \u0441\u0432\u043E\u044E \u043F\u043E\u0434\u0433\u0440\u0443\u043F\u043F\u0443 \u0434\u043B\u044F \u043B\u0430\u0431\u043E\u0440\u0430\u0442\u043E\u0440\u043D\u044B\u0445"] }), _jsx("div", { className: "grid grid-cols-2 gap-4 mb-6", children: [1, 2].map((num) => (_jsxs("button", { onClick: () => setSubgroup(num), className: clsx('p-6 rounded-xl border-2 text-center transition-all', subgroup === num
                                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-500/10'
                                    : 'border-surface-200 dark:border-surface-700 hover:border-surface-300 dark:hover:border-surface-600'), children: [_jsx("div", { className: clsx('text-2xl font-bold mb-1', subgroup === num ? 'text-primary-500' : 'text-surface-900 dark:text-surface-50'), children: num }), _jsx("div", { className: "text-sm text-surface-500", children: "\u041F\u043E\u0434\u0433\u0440\u0443\u043F\u043F\u0430" })] }, num))) }), _jsx(Button, { variant: "secondary", className: "w-full mb-3", onClick: () => { setSubgroup(null); goNext(); }, children: "\u0423 \u043C\u0435\u043D\u044F \u043D\u0435\u0442 \u043F\u043E\u0434\u0433\u0440\u0443\u043F\u043F" }), _jsx(Button, { variant: "primary", size: "lg", className: "w-full", onClick: goNext, disabled: subgroup === null, children: "\u041F\u0440\u043E\u0434\u043E\u043B\u0436\u0438\u0442\u044C" })] })), step === 'schedule' && (_jsxs("div", { children: [_jsxs("button", { onClick: goBack, className: "text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 text-sm mb-6 flex items-center gap-1", children: [_jsx("svg", { className: "w-4 h-4", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15 19l-7-7 7-7" }) }), "\u041D\u0430\u0437\u0430\u0434"] }), _jsx("h2", { className: "text-2xl font-bold text-surface-900 dark:text-surface-50 mb-2", children: "\u0413\u0440\u0443\u043F\u043F\u0430 \u0432\u044B\u0431\u0440\u0430\u043D\u0430" }), _jsxs("p", { className: "text-surface-500 dark:text-surface-400 mb-6", children: ["\u0413\u0440\u0443\u043F\u043F\u0430 ", effectiveGroup, subgroup ? `, подгруппа ${subgroup}` : '', " \u2014 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0431\u0443\u0434\u0435\u0442 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043D\u043E \u043F\u043E\u0441\u043B\u0435 \u0432\u0445\u043E\u0434\u0430"] }), _jsxs("div", { className: "space-y-3 mb-6", children: [_jsx(Card, { padding: "sm", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-500/10 flex items-center justify-center", children: _jsx("svg", { className: "w-5 h-5 text-primary-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" }) }) }), _jsxs("div", { children: [_jsx("div", { className: "font-medium text-surface-900 dark:text-surface-50", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0441 rasp.dmami.ru" }), _jsxs("div", { className: "text-sm text-surface-500 dark:text-surface-400", children: ["\u0410\u043A\u0442\u0443\u0430\u043B\u044C\u043D\u043E\u0435 \u0440\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0434\u043B\u044F \u0433\u0440\u0443\u043F\u043F\u044B ", effectiveGroup] })] })] }) }), _jsx(Card, { padding: "sm", children: _jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-lg bg-success-50 dark:bg-success-500/10 flex items-center justify-center", children: _jsx("svg", { className: "w-5 h-5 text-success-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" }) }) }), _jsxs("div", { children: [_jsx("div", { className: "font-medium text-surface-900 dark:text-surface-50", children: "\u0417\u0430\u0434\u0430\u043D\u0438\u044F \u043E\u0442 \u0433\u0440\u0443\u043F\u043F\u044B" }), _jsx("div", { className: "text-sm text-surface-500 dark:text-surface-400", children: "\u0421\u043E\u0432\u043C\u0435\u0441\u0442\u043D\u043E\u0435 \u0432\u0435\u0434\u0435\u043D\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u043E\u0432 \u0441 \u0433\u043E\u043B\u043E\u0441\u043E\u0432\u0430\u043D\u0438\u0435\u043C" })] })] }) })] }), _jsxs("label", { className: "flex items-center gap-3 mb-6 cursor-pointer", children: [_jsx("input", { type: "checkbox", checked: scheduleConfirmed, onChange: (e) => setScheduleConfirmed(e.target.checked), className: "w-5 h-5 rounded border-surface-300 text-primary-500 focus:ring-primary-500" }), _jsx("span", { className: "text-sm text-surface-700 dark:text-surface-300", children: "\u0412\u0441\u0451 \u0432\u0435\u0440\u043D\u043E, \u044D\u0442\u043E \u043C\u043E\u044F \u0433\u0440\u0443\u043F\u043F\u0430" })] }), _jsx(Button, { variant: "primary", size: "lg", className: "w-full", onClick: goNext, disabled: !scheduleConfirmed, children: "\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044C" })] })), step === 'done' && (_jsxs("div", { className: "text-center", children: [_jsx("div", { className: "w-20 h-20 rounded-full bg-success-100 dark:bg-success-500/20 flex items-center justify-center mx-auto mb-6", children: _jsx("svg", { className: "w-10 h-10 text-success-500", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 2, children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M5 13l4 4L19 7" }) }) }), _jsx("h2", { className: "text-2xl font-bold text-surface-900 dark:text-surface-50 mb-3", children: "\u0413\u043E\u0442\u043E\u0432\u043E!" }), _jsxs("p", { className: "text-surface-500 dark:text-surface-400 mb-2", children: ["\u0422\u044B \u0432 \u0433\u0440\u0443\u043F\u043F\u0435 ", _jsx("span", { className: "font-semibold text-surface-900 dark:text-surface-50", children: effectiveGroup })] }), _jsx("p", { className: "text-surface-400 dark:text-surface-500 text-sm mb-8", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435 \u0438\u043C\u043F\u043E\u0440\u0442\u0438\u0440\u043E\u0432\u0430\u043D\u043E, \u043C\u043E\u0436\u043D\u043E \u043D\u0430\u0447\u0438\u043D\u0430\u0442\u044C" }), _jsx(Button, { variant: "primary", size: "lg", className: "w-full max-w-xs mx-auto", onClick: finish, disabled: joinGroupMutation.isPending, children: "\u041F\u0435\u0440\u0435\u0439\u0442\u0438 \u043A \u0434\u0430\u0448\u0431\u043E\u0440\u0434\u0443" })] }))] }) }));
}
