import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

interface PopoverProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  /** Ширина: 'anchor' — как у поля, число — в пикселях */
  width?: 'anchor' | number;
}

// До расчёта позиции панель прозрачна, но остаётся фокусируемой (visibility: hidden не даст поставить фокус)
const HIDDEN: React.CSSProperties = { position: 'fixed', top: 0, left: 0, opacity: 0, pointerEvents: 'none' };
const GAP = 6;
const MARGIN = 8;

/**
 * Всплывающая панель под полем (#102).
 *
 * Рендерится в body с position: fixed, поэтому не обрезается модалкой с overflow,
 * и переворачивается вверх, если снизу не хватает места.
 */
function Popover({ open, anchorRef, onClose, children, className, width = 'anchor' }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>(HIDDEN);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const a = anchor.getBoundingClientRect();
    const w = width === 'anchor' ? a.width : Math.min(width, window.innerWidth - MARGIN * 2);
    const h = panel.offsetHeight;
    const below = window.innerHeight - a.bottom - GAP - MARGIN;
    const above = a.top - GAP - MARGIN;
    const flip = h > below && above > below;
    const left = Math.max(MARGIN, Math.min(a.left, window.innerWidth - w - MARGIN));
    setStyle({
      position: 'fixed',
      left,
      width: w,
      top: flip ? Math.max(MARGIN, a.top - GAP - h) : a.bottom + GAP,
      maxHeight: Math.max(160, flip ? above : below),
      transformOrigin: flip ? 'bottom' : 'top',
    });
  }, [anchorRef, width]);

  useLayoutEffect(() => {
    if (open) place();
    else setStyle(HIDDEN);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open, place, onClose, anchorRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={style}
      className={clsx(
        'z-[60] overflow-auto rounded-xl border border-surface-200 bg-white p-1.5 shadow-xl',
        'dark:border-surface-700 dark:bg-surface-800',
        'animate-fade-in',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export { Popover };
export type { PopoverProps };
