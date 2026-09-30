import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import clsx from 'clsx';
function Select({ options, placeholder, value, onChange, label, error, className, id, ...props }) {
    const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    return (_jsxs("div", { className: "flex flex-col gap-1", children: [label && (_jsx("label", { htmlFor: selectId, className: "text-sm font-medium text-surface-700 dark:text-surface-300", children: label })), _jsxs("select", { id: selectId, value: value, onChange: (e) => onChange?.(e.target.value), className: clsx('input appearance-none cursor-pointer', 'bg-[length:16px_16px] bg-[right_0.75rem_center] bg-no-repeat', 'pr-10', error && 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500', className), style: {
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                }, ...props, children: [placeholder && (_jsx("option", { value: "", disabled: true, children: placeholder })), options.map((opt) => (_jsx("option", { value: opt.value, children: opt.label }, opt.value)))] }), error && _jsx("p", { className: "text-xs text-danger-500", children: error })] }));
}
export { Select };
