import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';
const Input = forwardRef(({ label, error, iconLeft, className, id, ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
    return (_jsxs("div", { className: "flex flex-col gap-1", children: [label && (_jsx("label", { htmlFor: inputId, className: "text-sm font-medium text-surface-700 dark:text-surface-300", children: label })), _jsxs("div", { className: "relative", children: [iconLeft && (_jsx("span", { className: "absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 dark:text-surface-500 pointer-events-none", children: iconLeft })), _jsx("input", { ref: ref, id: inputId, className: clsx('input', iconLeft && 'pl-9', error && 'border-danger-500 focus:ring-danger-500/20 focus:border-danger-500', className), ...props })] }), error && _jsx("p", { className: "text-xs text-danger-500", children: error })] }));
});
Input.displayName = 'Input';
const SearchInput = forwardRef(({ placeholder = 'Search...', ...props }, ref) => {
    return (_jsx(Input, { ref: ref, iconLeft: _jsx(Icon, { name: "search", size: 16 }), placeholder: placeholder, type: "search", ...props }));
});
SearchInput.displayName = 'SearchInput';
export { Input, SearchInput };
