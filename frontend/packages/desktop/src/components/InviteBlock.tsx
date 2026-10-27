import { useEffect, useState } from 'react'
import { Button } from './ui'
import { useT } from '../i18n'

export const inviteUrl = (code: string) => `${window.location.origin}/join/${encodeURIComponent(code)}`

export function InviteBlock({ code }: { code: string }) {
  const { t } = useT()
  const url = inviteUrl(code)
  const [qr, setQr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let stale = false
    import('qrcode')
      .then((m) => m.toDataURL(url, { margin: 1, width: 192 }))
      .then((dataUrl) => !stale && setQr(dataUrl), () => !stale && setQr(''))
    return () => {
      stale = true
    }
  }, [url])

  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])

  const copy = () => navigator.clipboard?.writeText(url).then(() => setCopied(true), () => {})

  return (
    <div className="pt-4 mb-6 border-t border-surface-200 dark:border-surface-700">
      <p className="text-sm font-medium text-surface-700 dark:text-surface-300">
        {t('settings.inviteTitle')} · {code}
      </p>
      <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 mb-3">{t('settings.inviteHint')}</p>
      <div className="flex flex-wrap items-center gap-4">
        {qr && <img src={qr} alt={url} width={192} height={192} className="rounded-lg bg-white" />}
        <div className="flex-1 min-w-[12rem] space-y-2">
          <code className="block text-xs break-all text-surface-600 dark:text-surface-300">{url}</code>
          <Button variant="secondary" size="sm" onClick={copy}>
            {copied ? t('settings.inviteCopied') : t('settings.inviteCopy')}
          </Button>
        </div>
      </div>
    </div>
  )
}
