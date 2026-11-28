import { Link } from 'react-router-dom'
import { Button, Icon } from './ui'
import { useT, type MessageKey } from '../i18n'

/** Одинаковая заглушка без группы на Главной, в Расписании и в Заданиях (#146). */
export function NoGroupState({ title, text }: { title: MessageKey; text: MessageKey }) {
  const { t } = useT()
  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col items-center rounded-2xl border border-surface-200 bg-white px-6 py-10 text-center dark:border-surface-700 dark:bg-surface-800">
      <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-500 dark:bg-primary-500/10">
        <Icon name="users" size={22} />
      </span>
      <h2 className="mb-2 text-base font-semibold text-surface-900 dark:text-surface-50">{t(title)}</h2>
      <p className="mb-6 text-sm text-surface-500 dark:text-surface-400">{t(text)}</p>
      <Link to="/settings?section=group">
        <Button variant="primary">{t('assign.noGroup.action')}</Button>
      </Link>
    </div>
  )
}
