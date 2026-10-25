import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { Icon } from './Icon';
import { Popover } from './Popover';
import { useT } from '../../i18n';

interface DatePickerProps {
  /** Дата в формате yyyy-MM-dd — как у <input type="date"> */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  error?: string;
  /** Дни раньше этой даты нельзя выбрать */
  min?: Date;
  id?: string;
}

const ISO = 'yyyy-MM-dd';

function parse(value: string): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? startOfDay(d) : null;
}

/**
 * Календарь для выбора дедлайна вместо системного <input type="date"> (#102).
 * Быстрые кнопки «Сегодня / Завтра / Через неделю», клавиатура: стрелки — день и неделя,
 * PageUp/PageDown — месяц, Home/End — начало и конец недели, Enter — выбрать, Esc — закрыть.
 */
function DatePicker({ value, onChange, label, placeholder, error, min, id }: DatePickerProps) {
  const { t, tp, locale } = useT();
  const autoId = useId();
  const triggerId = id ?? `dp-${autoId}`;
  const gridId = `${triggerId}-grid`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const today = startOfDay(new Date());
  const minDay = min ? startOfDay(min) : null;
  const selected = parse(value);

  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState<Date>(selected ?? today);
  const [month, setMonth] = useState<Date>(startOfMonth(selected ?? today));

  const weekStartsOn = locale.options?.weekStartsOn ?? 1;

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn });
    const out: Date[] = [];
    for (let d = start; !isBefore(end, d); d = addDays(d, 1)) out.push(d);
    return out;
  }, [month, weekStartsOn]);

  const weekdays = useMemo(
    () => days.slice(0, 7).map((d) => format(d, 'EEEEEE', { locale })),
    [days, locale],
  );

  const isDisabled = useCallback((d: Date) => !!minDay && isBefore(d, minDay), [minDay]);

  const openPicker = () => {
    const start = selected ?? (minDay && isBefore(today, minDay) ? minDay : today);
    setFocused(start);
    setMonth(startOfMonth(start));
    setOpen(true);
  };

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus();
  }, []);

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(format(d, ISO));
    close();
  };

  const moveFocus = (d: Date) => {
    setFocused(d);
    if (!isSameMonth(d, month)) setMonth(startOfMonth(d));
  };

  useEffect(() => {
    if (open) gridRef.current?.focus();
  }, [open]);

  const onGridKeyDown = (e: KeyboardEvent) => {
    const map: Record<string, () => Date> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      PageUp: () => addMonths(focused, -1),
      PageDown: () => addMonths(focused, 1),
      Home: () => startOfWeek(focused, { weekStartsOn }),
      End: () => endOfWeek(focused, { weekStartsOn }),
    };
    if (map[e.key]) {
      e.preventDefault();
      moveFocus(startOfDay(map[e.key]()));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      pick(focused);
    } else if (e.key === 'Escape') {
      // Не даём модалке закрыться вместе с календарём
      e.preventDefault();
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
    }
  };

  const quick = [
    { label: t('date.today'), date: today },
    { label: t('date.tomorrow'), date: addDays(today, 1) },
    { label: t('date.inWeek'), date: addDays(today, 7) },
  ];

  const relative = (() => {
    if (!selected) return null;
    const diff = differenceInCalendarDays(selected, today);
    if (diff === 0) return { text: t('date.today'), tone: 'text-danger-500' };
    if (diff === 1) return { text: t('date.tomorrow'), tone: 'text-warning-600 dark:text-warning-500' };
    if (diff < 0) return { text: t('date.past'), tone: 'text-danger-500' };
    return {
      text: tp('date.inDays', diff),
      tone: diff <= 3 ? 'text-warning-600 dark:text-warning-500' : 'text-surface-400',
    };
  })();

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={triggerId} className="text-sm font-medium text-surface-700 dark:text-surface-300">
          {label}
        </label>
      )}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={!!error}
        onClick={() => (open ? close() : openPicker())}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') {
            e.preventDefault();
            openPicker();
          }
        }}
        className={clsx(
          'input flex items-center gap-2 text-left cursor-pointer',
          open && 'ring-2 ring-primary-500/20 border-primary-500',
          error && '!border-danger-500 focus:ring-danger-500/20',
        )}
      >
        <Icon name="calendar" size={16} className="text-primary-500" />
        <span className={clsx('flex-1 truncate', !selected && 'text-surface-400 dark:text-surface-500')}>
          {selected ? format(selected, 'EEEEEE, d MMMM yyyy', { locale }) : (placeholder ?? t('date.choose'))}
        </span>
        {relative && <span className={clsx('shrink-0 text-xs font-medium', relative.tone)}>{relative.text}</span>}
      </button>
      {error && <p className="text-xs text-danger-500">{error}</p>}

      <Popover open={open} anchorRef={triggerRef} onClose={() => close(false)} width={316} className="!p-3">
        <div role="dialog" aria-label={label ?? t('date.choose')}>
          <div className="mb-3 flex gap-1.5">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={isDisabled(q.date)}
                onClick={() => pick(q.date)}
                className={clsx(
                  'flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-medium transition-colors',
                  selected && isSameDay(selected, q.date)
                    ? 'bg-primary-500 text-white'
                    : 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                )}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label={t('date.prevMonth')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700"
            >
              <Icon name="chevron-left" size={16} />
            </button>
            <span className="text-sm font-semibold capitalize text-surface-900 dark:text-surface-50" aria-live="polite">
              {format(month, 'LLLL yyyy', { locale })}
            </span>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              aria-label={t('date.nextMonth')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700"
            >
              <Icon name="chevron-right" size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {weekdays.map((w, i) => (
              <span key={i} className="py-1 text-2xs font-medium uppercase text-surface-400">
                {w}
              </span>
            ))}
          </div>
          <div
            ref={gridRef}
            id={gridId}
            role="grid"
            tabIndex={0}
            aria-activedescendant={`${gridId}-${format(focused, ISO)}`}
            onKeyDown={onGridKeyDown}
            className="grid grid-cols-7 gap-0.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
          >
            {days.map((d) => {
              const key = format(d, ISO);
              const disabled = isDisabled(d);
              const isSel = !!selected && isSameDay(d, selected);
              const isToday = isSameDay(d, today);
              const isFocus = isSameDay(d, focused);
              const weekend = [0, 6].includes(d.getDay());
              return (
                <button
                  key={key}
                  id={`${gridId}-${key}`}
                  type="button"
                  role="gridcell"
                  tabIndex={-1}
                  aria-selected={isSel}
                  aria-disabled={disabled}
                  aria-label={format(d, 'd MMMM yyyy, EEEE', { locale })}
                  onClick={() => pick(d)}
                  onPointerEnter={() => !disabled && setFocused(d)}
                  className={clsx(
                    'relative h-9 rounded-lg text-sm transition-colors',
                    !isSameMonth(d, month) && 'text-surface-300 dark:text-surface-600',
                    isSameMonth(d, month) && !isSel && (weekend ? 'text-danger-500/80' : 'text-surface-800 dark:text-surface-100'),
                    disabled && 'cursor-not-allowed !text-surface-300 line-through dark:!text-surface-600',
                    !disabled && !isSel && isFocus && 'bg-surface-100 dark:bg-surface-700',
                    isSel && 'bg-primary-500 font-semibold text-white',
                    isToday && !isSel && 'font-semibold ring-1 ring-inset ring-primary-500',
                  )}
                >
                  {format(d, 'd')}
                </button>
              );
            })}
          </div>
        </div>
      </Popover>
    </div>
  );
}

export { DatePicker };
export type { DatePickerProps };
