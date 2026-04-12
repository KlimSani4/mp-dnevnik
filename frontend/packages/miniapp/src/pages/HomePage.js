import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useTelegramWebApp } from '../telegram/useTelegramWebApp';
export function HomePage() {
    const { webApp } = useTelegramWebApp();
    const userName = webApp?.initDataUnsafe.user?.first_name || 'Студент';
    const greeting = getGreeting();
    return (_jsxs("div", { className: "p-4", children: [_jsxs("h1", { className: "text-xl font-semibold mb-1", children: [greeting, ", ", userName, "!"] }), _jsx("p", { className: "text-tg-hint text-sm mb-6", children: "\u0421\u0435\u0433\u043E\u0434\u043D\u044F 4 \u043F\u0430\u0440\u044B" }), _jsxs("section", { className: "mb-6", children: [_jsx("h2", { className: "text-sm font-medium text-tg-hint mb-3", children: "\u0420\u0430\u0441\u043F\u0438\u0441\u0430\u043D\u0438\u0435" }), _jsxs("div", { className: "space-y-3", children: [_jsx(ScheduleCard, { time: "9:40 \u2013 11:10", subject: "\u0424\u0438\u0437\u0440\u0430", location: "\u0421\u043F\u043E\u0440\u0442 \u0437\u0430\u043B \u043D\u0430 \u042E\u0440\u0438\u043D\u043E" }), _jsx(ScheduleCard, { time: "11:20 \u2013 12:50", subject: "\u041C\u0430\u0442 \u043B\u043E\u0433\u0438\u043A\u0430", location: "\u041F\u0440\u044F\u043D\u0438\u0448\u043D\u0438\u043A\u043E\u0432\u0430 \u0410-123", isOnline: true })] })] }), _jsxs("section", { children: [_jsx("h2", { className: "text-sm font-medium text-tg-hint mb-3", children: "\u0413\u043E\u0440\u044F\u0449\u0438\u0435 \u0434\u0435\u0434\u043B\u0430\u0439\u043D\u044B" }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("span", { className: "font-medium", children: "\u041C\u0430\u0442 \u043B\u043E\u0433\u0438\u043A\u0430" }), _jsx("span", { className: "text-xs px-2 py-1 bg-red-100 text-red-600 rounded", children: "urgent" })] }), _jsx("p", { className: "text-sm text-tg-hint mb-2", children: "\u0421\u0434\u0435\u043B\u0430\u0442\u044C \u041F\u0417 \u21164" }), _jsx("p", { className: "text-xs text-red-500", children: "\u0414\u043E 13 \u0434\u0435\u043A\u0430\u0431\u0440\u044F" })] })] })] }));
}
function getGreeting() {
    const hour = new Date().getHours();
    if (hour < 12)
        return 'Доброе утро';
    if (hour < 18)
        return 'Добрый день';
    return 'Добрый вечер';
}
function ScheduleCard({ time, subject, location, isOnline }) {
    return (_jsxs("div", { className: "card flex gap-3", children: [_jsx("div", { className: "w-10 h-10 rounded-lg bg-tg-bg flex items-center justify-center", children: isOnline ? (_jsx("span", { className: "text-green-500", children: "\u25B6" })) : (_jsx("span", { className: "text-tg-hint", children: "\u25CF" })) }), _jsxs("div", { className: "flex-1", children: [_jsx("div", { className: "font-medium", children: subject }), _jsx("div", { className: "text-sm text-tg-hint", children: time }), _jsx("div", { className: "text-sm text-tg-link mt-1", children: location })] })] }));
}
