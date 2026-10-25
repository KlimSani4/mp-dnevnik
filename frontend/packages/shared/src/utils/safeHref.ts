/**
 * Ссылка, которую можно безопасно вставить в href или открыть через window.open.
 * Допускаются только http и https: javascript:, data: и другие схемы выполняют код при клике.
 */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : undefined
  } catch {
    return undefined
  }
}
