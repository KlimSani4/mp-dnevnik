import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from 'react';
import clsx from 'clsx';
const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    ghost: 'btn-ghost',
    danger: 'btn-danger',
    success: 'btn-success',
};
const sizeClasses = {
    sm: 'btn-sm',
    default: '',
    lg: 'btn-lg',
};
const Button = forwardRef(({ variant = 'primary', size = 'default', iconOnly = false, icon, children, className, ...props }, ref) => {
    return (_jsxs("button", { ref: ref, className: clsx('btn', variantClasses[variant], sizeClasses[size], iconOnly && 'btn-icon', className), ...props, children: [icon && _jsx("span", { className: "shrink-0", children: icon }), !iconOnly && children] }));
});
Button.displayName = 'Button';
export { Button };
