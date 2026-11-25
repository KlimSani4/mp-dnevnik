/**
 * Ссылки на инструменты эксплуатации для модератора (#152).
 *
 * Пока часть из них — заглушки: Grafana, Prometheus, логи и т. д. ещё не подняты (#22).
 * Когда появятся, адрес задаётся при сборке переменной VITE_* (Dockerfile → ARG,
 * deploy.yml → build-args) или прямо здесь в `url`. Без адреса карточка показывается
 * неактивной с пометкой «Скоро».
 */
import type { MessageKey } from '../../i18n'

export interface ToolLink {
  id: string
  title: string
  description: MessageKey
  icon: string
  url: string | null
  /** Переменная окружения, из которой берётся адрес — показывается у заглушки */
  env?: string
}

const env = (key: string): string | null => {
  const v = (import.meta.env as Record<string, string | undefined>)[key]
  return v && /^https:\/\//.test(v) ? v : null
}

const REPO = 'https://github.com/KlimSani4/mp-dnevnik'

export const MONITORING: ToolLink[] = [
  { id: 'grafana', title: 'Grafana', description: 'mod.tools.grafana', icon: 'chart', url: env('VITE_GRAFANA_URL'), env: 'VITE_GRAFANA_URL' },
  { id: 'prometheus', title: 'Prometheus', description: 'mod.tools.prometheus', icon: 'activity', url: env('VITE_PROMETHEUS_URL'), env: 'VITE_PROMETHEUS_URL' },
  { id: 'logs', title: 'Loki', description: 'mod.tools.logs', icon: 'file', url: env('VITE_LOGS_URL'), env: 'VITE_LOGS_URL' },
  { id: 'alerts', title: 'Alertmanager', description: 'mod.tools.alerts', icon: 'bell', url: env('VITE_ALERTS_URL'), env: 'VITE_ALERTS_URL' },
  { id: 'errors', title: 'Sentry', description: 'mod.tools.errors', icon: 'alert-triangle', url: env('VITE_SENTRY_URL'), env: 'VITE_SENTRY_URL' },
  { id: 'uptime', title: 'Uptime', description: 'mod.tools.uptime', icon: 'check', url: env('VITE_UPTIME_URL'), env: 'VITE_UPTIME_URL' },
]

export const DELIVERY: ToolLink[] = [
  { id: 'actions', title: 'GitHub Actions', description: 'mod.tools.actions', icon: 'refresh', url: `${REPO}/actions` },
  { id: 'deploy', title: 'Deploy', description: 'mod.tools.deploy', icon: 'upload', url: `${REPO}/actions/workflows/deploy.yml` },
  { id: 'packages', title: 'GHCR', description: 'mod.tools.packages', icon: 'box', url: `https://github.com/KlimSani4?tab=packages&repo_name=mp-dnevnik` },
  { id: 'argocd', title: 'Argo CD', description: 'mod.tools.argocd', icon: 'git', url: env('VITE_ARGOCD_URL'), env: 'VITE_ARGOCD_URL' },
  { id: 'issues', title: 'Issues', description: 'mod.tools.issues', icon: 'clipboard', url: `${REPO}/issues` },
  { id: 'api', title: 'API Health', description: 'mod.tools.health', icon: 'heart', url: '/api/v1/health' },
]
