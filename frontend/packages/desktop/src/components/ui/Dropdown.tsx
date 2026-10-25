import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';
import { Popover } from './Popover';

interface DropdownOption {
  value: string;
  label: string;
  /** Значок слева: в списке и в самом поле, когда вариант выбран */
  icon?: ReactNode;
  /** Значок в самом поле, если нужен меньше, чем в списке */
  selectedIcon?: ReactNode;
  /** Подсказка мелким текстом под названием — только в списке */
  hint?: string;
  /** Классы для выбранного поля — например, цвет рамки по уровню приоритета */
  activeClassName?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  /** Поле поиска сверху списка; по умолчанию — если вариантов больше 7 */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  id?: string;
  className?: string;
}

/**
 * Выпадающий список в стиле приложения вместо системного <select> (#102).
 * Клавиатура: ↑/↓, Home/End, Enter/Space — выбрать, Esc — закрыть, буквы — поиск.
 */
function Dropdown({
  options,
  value,
  onChange,
  label,
  placeholder,
  error,
  searchable,
  searchPlaceholder,
  emptyText = '—',
  id,
  className,
}: DropdownProps) {
  const autoId = useId();
  const triggerId = id ?? `dd-${autoId}`;
  const listId = `${triggerId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const withSearch = searchable ?? options.length > 7;
  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const openList = useCallback(() => {
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }, [options, value]);

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const pick = useCallback(
    (opt: DropdownOption | undefined) => {
      if (!opt) return;
      onChange?.(opt.value);
      close();
    },
    [onChange, close],
  );

  useEffect(() => {
    if (open && withSearch) searchRef.current?.focus();
  }, [open, withSearch]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(visible.length - 1, i + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(visible.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        pick(visible[active]);
        break;
      case ' ':
        if (!withSearch) {
          e.preventDefault();
          pick(visible[active]);
        }
        break;
      case 'Escape':
        // Не даём модалке закрыться вместе со списком
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        close();
        break;
      case 'Tab':
        close(false);
        break;
      default:
        if (!withSearch && e.key.length === 1) {
          const i = visible.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
          if (i >= 0) setActive(i);
        }
    }
  };

  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && (
        <label htmlFor={triggerId} className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-invalid={!!error}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={clsx(
          'input flex items-center gap-2 text-left cursor-pointer',
          open && 'ring-2 ring-primary-500/20 border-primary-500',
          selected?.activeClassName,
          error && '!border-danger-500 focus:ring-danger-500/20',
        )}
      >
        {selected?.selectedIcon ?? selected?.icon}
        <span className={clsx('flex-1 truncate', !selected && 'text-surface-400 dark:text-surface-500')}>
          {selected?.label ?? placeholder ?? '—'}
        </span>
        <Icon
          name="chevron-down"
          size={16}
          className={clsx('text-surface-400 transition-transform', open && 'rotate-180')}
        />
      </button>
      {error && <p className="text-xs text-danger-500">{error}</p>}

      <Popover open={open} anchorRef={triggerRef} onClose={() => close(false)}>
        {withSearch && (
          <div className="p-1 pb-1.5">
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-controls={listId}
              aria-activedescendant={visible[active] ? `${listId}-${active}` : undefined}
              className="input py-1.5"
            />
          </div>
        )}
        <ul ref={listRef} id={listId} role="listbox" aria-labelledby={triggerId} className="space-y-0.5">
          {visible.length === 0 && (
            <li className="px-3 py-2 text-sm text-surface-400">{emptyText}</li>
          )}
          {visible.map((opt, i) => {
            const isSelected = opt.value === value;
            return (
              <li
                key={opt.value}
                id={`${listId}-${i}`}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(opt)}
                className={clsx(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                  'text-surface-800 dark:text-surface-100',
                  i === active && 'bg-surface-100 dark:bg-surface-700',
                  isSelected && 'font-medium',
                )}
              >
                {opt.icon}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="truncate text-xs font-normal text-surface-400 dark:text-surface-500">{opt.hint}</span>
                  )}
                </span>
                {isSelected && <Icon name="check" size={16} className="text-primary-500" />}
              </li>
            );
          })}
        </ul>
      </Popover>
    </div>
  );
}

export { Dropdown };
export type { DropdownProps, DropdownOption };
