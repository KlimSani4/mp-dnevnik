import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from './Icon';
function Modal({ open, onClose, title, children, className }) {
    const overlayRef = useRef(null);
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Escape')
            onClose();
    }, [onClose]);
    useEffect(() => {
        if (!open)
            return;
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [open, handleKeyDown]);
    const handleOverlayClick = (e) => {
        if (e.target === overlayRef.current)
            onClose();
    };
    if (!open)
        return null;
    return createPortal(_jsx("div", { ref: overlayRef, onClick: handleOverlayClick, className: clsx('fixed inset-0 z-50 flex items-center justify-center p-4', 'bg-black/50 backdrop-blur-sm', 'animate-fade-in'), role: "dialog", "aria-modal": "true", "aria-label": title, children: _jsxs("div", { className: clsx('w-full max-w-lg rounded-xl shadow-xl', 'bg-white dark:bg-surface-800', 'border border-surface-200 dark:border-surface-700', 'animate-slide-up', className), children: [title && (_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-surface-200 dark:border-surface-700", children: [_jsx("h2", { className: "text-lg font-semibold text-surface-900 dark:text-surface-50", children: title }), _jsx("button", { onClick: onClose, className: "btn btn-ghost btn-icon -mr-2", "aria-label": "Close", children: _jsx(Icon, { name: "x", size: 20 }) })] })), !title && (_jsx("div", { className: "flex justify-end px-4 pt-4", children: _jsx("button", { onClick: onClose, className: "btn btn-ghost btn-icon", "aria-label": "Close", children: _jsx(Icon, { name: "x", size: 20 }) }) })), _jsx("div", { className: "px-6 py-4", children: children })] }) }), document.body);
}
export { Modal };
