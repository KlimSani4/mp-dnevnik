import clsx from 'clsx'
import { Dropdown, Icon } from './ui'
import { useT } from '../i18n'
import { PRIORITY_LABELS, PRIORITY_META, PRIORITY_ORDER, type Priority } from '../types/assignments'

/** Значок уровня приоритета в цветной плашке (#102) */
export function PriorityIcon({ priority, size = 'md' }: { priority: Priority; size?: 'sm' | 'md' }) {
  const meta = PRIORITY_META[priority]
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-md',
        size === 'sm' ? 'h-5 w-5' : 'h-7 w-7',
        meta.tile,
      )}
    >
      <Icon name={meta.icon} size={size === 'sm' ? 12 : 15} strokeWidth={2.4} />
    </span>
  )
}

interface PriorityDropdownProps {
  value: string
  onChange: (value: Priority) => void
  label?: string
}

/** Выбор приоритета: у каждого уровня свой цвет, значок и подсказка (#102) */
export function PriorityDropdown({ value, onChange, label }: PriorityDropdownProps) {
  const { t } = useT()
  return (
    <Dropdown
      label={label ?? t('assign.priority')}
      value={value}
      onChange={(v) => onChange(v as Priority)}
      searchable={false}
      options={PRIORITY_ORDER.map((p) => ({
        value: p,
        label: t(PRIORITY_LABELS[p]),
        hint: t(PRIORITY_META[p].hint),
        icon: <PriorityIcon priority={p} />,
        selectedIcon: <PriorityIcon priority={p} size="sm" />,
        activeClassName: PRIORITY_META[p].field,
      }))}
    />
  )
}
