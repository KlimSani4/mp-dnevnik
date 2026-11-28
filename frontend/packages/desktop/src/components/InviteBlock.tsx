/**
 * Пригласить в группу (#147, начато в #30): QR и ссылка со случайным токеном.
 *
 * Видят все подтверждённые участники — чтобы переслать в чат группы. Сбросить ссылку
 * может староста или заместитель: старый QR после этого не работает.
 * QR рисуется на клиенте библиотекой qrcode (грузится лениво, только здесь).
 */
import { useEffect, useState } from 'react'
import { useGroupInvite, useResetInvite } from '@nexora/shared'
import { Button, Modal, Skeleton } from './ui'
import { useT } from '../i18n'

const BOT = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) || 'nexora_mospolytech_bot'

export const inviteUrl = (token: string) => `${window.location.origin}/join/${token}`
export const inviteBotUrl = (token: string) => `https://t.me/${BOT}?start=join_${token}`

function useQr(text: string | null, width: number): string {
  const [qr, setQr] = useState('')
  useEffect(() => {
    if (!text) return
    let stale = false
    import('qrcode')
      .then((m) => m.toDataURL(text, { margin: 2, width, errorCorrectionLevel: 'M' }))
      .then((url) => !stale && setQr(url), () => !stale && setQr(''))
    return () => {
      stale = true
    }
  }, [text, width])
  return qr
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(id)
  }, [copied])
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})}
    >
      {copied ? t('invite.copied') : label}
    </Button>
  )
}

export function InviteBlock({ code }: { code: string }) {
  const { t } = useT()
  const invite = useGroupInvite(code)
  const reset = useResetInvite()
  const [fullscreen, setFullscreen] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const token = invite.data?.token ?? null
  const url = token ? inviteUrl(token) : null
  const qr = useQr(url, 224)
  const bigQr = useQr(fullscreen ? url : null, 640)

  if (invite.isError) return null

  return (
    <div className="pt-4 mb-6 border-t border-surface-200 dark:border-surface-700">
      <p className="text-sm font-medium text-surface-700 dark:text-surface-300">{t('invite.title', { code })}</p>
      <p className="text-xs text-surface-500 dark:text-surface-400 mt-1 mb-4">{t('invite.hint')}</p>

      {!token ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <button
            type="button"
            onClick={() => setFullscreen(true)}
            title={t('invite.fullscreen')}
            className="shrink-0 self-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-surface-200 transition hover:ring-primary-400 sm:self-start dark:ring-surface-700"
          >
            {qr ? (
              <img src={qr} alt={t('invite.qrAlt', { code })} width={176} height={176} className="block" />
            ) : (
              <div className="h-44 w-44" />
            )}
          </button>

          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">{t('invite.site')}</div>
              <code className="mt-1 block break-all text-sm text-surface-800 dark:text-surface-100">{url}</code>
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton text={url!} label={t('invite.copy')} />
                {qr && (
                  <a href={qr} download={`nexora-${code}-qr.png`}>
                    <Button variant="secondary" size="sm">{t('invite.download')}</Button>
                  </a>
                )}
                <Button variant="ghost" size="sm" onClick={() => setFullscreen(true)}>{t('invite.fullscreen')}</Button>
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-surface-500 dark:text-surface-400">{t('invite.bot')}</div>
              <code className="mt-1 block break-all text-sm text-surface-800 dark:text-surface-100">{inviteBotUrl(token)}</code>
              <div className="mt-2">
                <CopyButton text={inviteBotUrl(token)} label={t('invite.copy')} />
              </div>
            </div>
            {invite.data?.can_reset && (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="text-xs text-surface-500 underline-offset-2 hover:text-danger-600 hover:underline dark:text-surface-400"
              >
                {t('invite.reset')}
              </button>
            )}
          </div>
        </div>
      )}

      <Modal open={fullscreen} onClose={() => setFullscreen(false)} title={t('invite.title', { code })} className="max-w-2xl">
        <div className="flex flex-col items-center gap-3">
          {bigQr ? (
            <img src={bigQr} alt={t('invite.qrAlt', { code })} className="w-full max-w-[min(80vh,560px)] rounded-xl bg-white" />
          ) : (
            <Skeleton className="aspect-square w-full max-w-md rounded-xl" />
          )}
          <p className="text-center text-sm text-surface-600 dark:text-surface-300">{t('invite.scan')}</p>
        </div>
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title={t('invite.resetTitle')}>
        <p className="text-sm text-surface-600 dark:text-surface-300">{t('invite.resetBody')}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>{t('groupLeave.cancel')}</Button>
          <Button
            variant="danger"
            disabled={reset.isPending}
            onClick={() => reset.mutate(code, { onSuccess: () => setConfirmReset(false) })}
          >
            {t('invite.resetConfirm')}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
