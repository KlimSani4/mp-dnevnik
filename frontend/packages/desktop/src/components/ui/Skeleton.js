import { jsx as _jsx } from "react/jsx-runtime";
import clsx from 'clsx';
const baseClasses = 'animate-pulse bg-surface-200 dark:bg-surface-700';
const variantDefaults = {
    text: 'h-4 w-full rounded',
    circle: 'rounded-full',
    card: 'w-full h-32 rounded-xl',
};
function Skeleton({ variant = 'text', width, height, className }) {
    const style = {};
    if (width !== undefined)
        style.width = typeof width === 'number' ? `${width}px` : width;
    if (height !== undefined)
        style.height = typeof height === 'number' ? `${height}px` : height;
    // For circle variant, if only one dimension is given use it for both
    if (variant === 'circle') {
        if (width !== undefined && height === undefined)
            style.height = style.width;
        if (height !== undefined && width === undefined)
            style.width = style.height;
        // Default circle size
        if (width === undefined && height === undefined) {
            style.width = '40px';
            style.height = '40px';
        }
    }
    return (_jsx("div", { className: clsx(baseClasses, variantDefaults[variant], className), style: style, "aria-hidden": "true" }));
}
export { Skeleton };
