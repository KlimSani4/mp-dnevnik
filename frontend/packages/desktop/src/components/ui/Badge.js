import { jsx as _jsx } from "react/jsx-runtime";
import clsx from 'clsx';
const variantClasses = {
    urgent: 'badge-urgent',
    high: 'badge-high',
    normal: 'badge-normal',
    success: 'badge-success',
    verified: 'badge-verified',
    default: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300',
};
const sizeClasses = {
    sm: 'text-2xs px-1.5 py-0',
    default: '',
};
function Badge({ variant = 'default', size = 'default', children, className, ...props }) {
    return (_jsx("span", { className: clsx('badge', variantClasses[variant], sizeClasses[size], className), ...props, children: children }));
}
export { Badge };
