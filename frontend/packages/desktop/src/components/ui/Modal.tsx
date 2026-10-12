import { useEffect, useCallback, useRef, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  hideCloseButton?: boolean;
  scrollOnOverflow?: boolean;
}

function Modal({ open, onClose, title, children, className, hideCloseButton = false, scrollOnOverflow = false }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleKeyDown]);

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!open) return null;

  const modalPanel = (
    <div
      className={clsx(
        'w-full max-w-lg rounded-xl shadow-xl',
        'bg-white dark:bg-surface-800',
        'border border-surface-200 dark:border-surface-700',
        'animate-slide-up',
        className,
      )}
    >
      {/* Header */}
      {title && (
        <div className="flex items-center justify-between bg-white px-6 py-4 border-b border-surface-200 dark:border-surface-700 dark:bg-surface-800">
          <h2 className="text-lg font-semibold text-surface-900 dark:text-surface-50">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon -mr-2"
            aria-label="Close"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
      )}

      {/* Close button when no title */}
      {!title && !hideCloseButton && (
        <div className="flex justify-end px-4 pt-4">
          <button
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            aria-label="Close"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="px-6 py-4">{children}</div>
    </div>
  );

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={clsx(
        'fixed inset-0 z-50 p-4',
        scrollOnOverflow ? 'overflow-y-auto' : 'flex items-center justify-center',
        'bg-black/50 backdrop-blur-sm',
        'animate-fade-in',
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {scrollOnOverflow ? (
        <div
          onClick={handleOverlayClick}
          className="flex min-h-[calc(100dvh-2rem)] items-center justify-center"
        >
          {modalPanel}
        </div>
      ) : modalPanel}
    </div>,
    document.body,
  );
}

export { Modal };
export type { ModalProps };
