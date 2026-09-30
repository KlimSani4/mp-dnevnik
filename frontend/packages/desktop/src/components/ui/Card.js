import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef } from 'react';
import clsx from 'clsx';
const variantClasses = {
    default: 'card',
    hover: 'card-hover',
    outlined: 'rounded-xl border border-surface-200 dark:border-surface-700 bg-transparent',
};
const paddingClasses = {
    none: 'p-0',
    sm: 'p-2',
    default: '', // handled by card base class (p-4)
    lg: 'p-6',
};
const Card = forwardRef(({ variant = 'default', padding = 'default', children, className, ...props }, ref) => {
    const needsPaddingOverride = padding !== 'default';
    return (_jsx("div", { ref: ref, className: clsx(variantClasses[variant], needsPaddingOverride && paddingClasses[padding], className), ...props, children: children }));
});
Card.displayName = 'Card';
export { Card };
