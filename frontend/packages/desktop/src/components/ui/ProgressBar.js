import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import clsx from 'clsx';
const colorClasses = {
    primary: 'bg-primary-500',
    success: 'bg-success-500',
    danger: 'bg-danger-500',
    warning: 'bg-warning-500',
};
function ProgressBar({ value, color = 'primary', showLabel = false, trend, className, }) {
    const clamped = Math.min(100, Math.max(0, value));
    return (_jsxs("div", { className: clsx('flex flex-col gap-1', className), children: [(showLabel || trend) && (_jsxs("div", { className: "flex items-center justify-between text-xs", children: [showLabel && (_jsxs("span", { className: "text-surface-600 dark:text-surface-400", children: [Math.round(clamped), "%"] })), trend && (_jsx("span", { className: "text-surface-500 dark:text-surface-400", children: trend }))] })), _jsx("div", { className: "progress-bar", children: _jsx("div", { className: clsx('progress-fill', colorClasses[color]), style: { width: `${clamped}%` }, role: "progressbar", "aria-valuenow": clamped, "aria-valuemin": 0, "aria-valuemax": 100 }) })] }));
}
export { ProgressBar };
