/**
 * Графики страницы модерации (#152). Без библиотек: SVG и Tailwind.
 *
 * Правила (dataviz): один ряд — один цвет (primary) и без легенды, заголовок
 * называет ряд; линия 2px с заливкой ~10%; столбцы с 4px скруглением у вершины
 * и 2px зазором; сетка — тонкая и сплошная; у каждого графика есть подсказка при
 * наведении и с клавиатуры, а значения дублируются подписями или легендой.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { format } from 'date-fns'
import clsx from 'clsx'
import type { DayPoint } from '@nexora/shared'
import { Card } from '../ui'
import { useT } from '../../i18n'

/** primary-500: один и тот же в светлой и тёмной теме */
const PRIMARY = '#ee751b'

const nf = new Intl.NumberFormat('ru-RU')
export const fmt = (n: number) =>
  n >= 10_000 ? new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : nf.format(n)

/** Чистые деления оси: 0, шаг, 2·шаг… не больше 4 линий */
function niceMax(max: number): { top: number; ticks: number[] } {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] }
  const raw = max / 3
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v))
  return { top, ticks }
}

/** Ширина контейнера: SVG рисуется в реальных пикселях, чтобы текст осей был 10px, а не тянулся */
function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(200, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/* ─── Плитка с числом ─── */

interface StatTileProps {
  label: string
  value: number | string
  /** Изменение к прошлому периоду: число, подпись периода, хорошо ли рост */
  delta?: { value: number; period: string; upIsGood?: boolean } | null
  hint?: ReactNode
  spark?: number[]
  emphasis?: boolean
}

export function StatTile({ label, value, delta, hint, spark, emphasis }: StatTileProps) {
  const dir = delta ? Math.sign(delta.value) : 0
  const good = delta ? (delta.upIsGood ?? true) === dir > 0 : false
  return (
    <Card padding="default" className={clsx('flex flex-col gap-1', emphasis && 'ring-1 ring-primary-500/30')}>
      <span className="text-xs text-surface-500 dark:text-surface-400">{label}</span>
      <div className="flex items-end justify-between gap-2">
        <span className={clsx('font-semibold text-surface-900 dark:text-surface-50', emphasis ? 'text-3xl' : 'text-2xl')}>
          {typeof value === 'number' ? fmt(value) : value}
        </span>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      {delta && (
        <span
          className={clsx(
            'text-xs font-medium',
            dir === 0
              ? 'text-surface-400'
              : good
                ? 'text-success-700 dark:text-success-500'
                : 'text-danger-600 dark:text-danger-500',
          )}
        >
          {dir > 0 ? '▲ +' : dir < 0 ? '▼ −' : '■ '}
          {fmt(Math.abs(delta.value))} {delta.period}
        </span>
      )}
      {hint && <span className="text-xs text-surface-400 dark:text-surface-500">{hint}</span>}
    </Card>
  )
}

function Sparkline({ values }: { values: number[] }) {
  const w = 64
  const h = 22
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 4) + 2, h - 2 - (v / max) * (h - 4)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('')
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg width={w} height={h} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="stroke-surface-300 dark:stroke-surface-600" />
      <circle cx={lx} cy={ly} r={2.5} className="fill-primary-500" />
    </svg>
  )
}

/* ─── Ряд по дням: линия с заливкой или столбцы ─── */

interface DaySeriesProps {
  title: string
  subtitle?: string
  points: DayPoint[]
  kind: 'area' | 'columns'
  valueLabel: string
}

export function DaySeriesChart({ title, subtitle, points, kind, valueLabel }: DaySeriesProps) {
  const { locale } = useT()
  const uid = useId()
  const [hover, setHover] = useState<number | null>(null)

  const [box, W] = useWidth<HTMLDivElement>()
  const H = kind === 'area' ? 200 : 160
  const pad = { l: 30, r: 6, t: 8, b: 20 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const max = Math.max(0, ...points.map((p) => p.value))
  const { top, ticks } = niceMax(max)
  const n = points.length
  const y = (v: number) => pad.t + ih - (v / top) * ih
  const slot = iw / Math.max(1, n)
  const x = (i: number) => (kind === 'area' ? pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw) : pad.l + slot * i + slot / 2)

  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('')
  const total = points.reduce((s, p) => s + p.value, 0)
  const last = points[n - 1]
  const day = (d: string, f = 'd MMM') => format(new Date(d), f, { locale })

  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(n - 1, (h ?? -1) + 1))
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? n) - 1))
    else if (e.key === 'Escape') setHover(null)
    else return
    e.preventDefault()
  }

  const hp = hover !== null ? points[hover] : null
  const barW = Math.min(24, Math.max(2, slot - 2))

  return (
    <Card padding="lg">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">{title}</h3>
          {subtitle && <p className="text-xs text-surface-400 dark:text-surface-500">{subtitle}</p>}
        </div>
        {/* Значение в фокусе или итог периода: значение ведёт, подпись — следом */}
        <div className="text-right" aria-live="polite">
          <div className="text-lg font-semibold text-surface-900 dark:text-surface-50">
            {fmt(hp ? hp.value : kind === 'area' ? last?.value ?? 0 : total)}
          </div>
          <div className="text-2xs text-surface-400">
            {hp ? day(hp.day, 'EEEEEE, d MMMM') : kind === 'area' ? `${valueLabel}, ${last ? day(last.day) : ''}` : valueLabel}
          </div>
        </div>
      </div>
      <div ref={box} className="w-full min-w-0">
      {/* width=100%: контейнер не растягивается под SVG, а SVG после замера рисуется 1:1 */}
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 rounded-lg"
        role="img"
        aria-label={`${title}: ${points.map((p) => `${day(p.day)} — ${p.value}`).join('; ')}`}
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
        onPointerLeave={() => setHover(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - r.left) / r.width) * W
          const i = kind === 'area' ? Math.round(((px - pad.l) / iw) * (n - 1)) : Math.floor((px - pad.l) / slot)
          setHover(Math.max(0, Math.min(n - 1, i)))
        }}
      >
        {/* сетка и ось Y */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} strokeWidth={1} className="stroke-surface-100 dark:stroke-surface-700" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="fill-surface-400 text-[10px] tabular-nums">
              {fmt(t)}
            </text>
          </g>
        ))}

        {kind === 'area' ? (
          <>
            <defs>
              <linearGradient id={`${uid}-g`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.14} />
                <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <path d={`${linePath}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${uid}-g)`} />
            <path d={linePath} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-primary-500" />
            {last && hover === null && (
              <circle cx={x(n - 1)} cy={y(last.value)} r={4} strokeWidth={2} className="fill-primary-500 stroke-white dark:stroke-surface-800" />
            )}
          </>
        ) : (
          points.map((p, i) => {
            const h = Math.max(p.value > 0 ? 2 : 0, y(0) - y(p.value))
            const bx = x(i) - barW / 2
            const by = y(0) - h
            const r = Math.min(4, barW / 2, h)
            return (
              <path
                key={p.day}
                d={`M${bx},${y(0)}V${by + r}Q${bx},${by} ${bx + r},${by}H${bx + barW - r}Q${bx + barW},${by} ${bx + barW},${by + r}V${y(0)}Z`}
                className={clsx(
                  'transition-colors',
                  hover === null || hover === i ? 'fill-primary-500' : 'fill-primary-500/35',
                )}
              />
            )
          })
        )}

        {/* перекрестье и точка в фокусе */}
        {hp && (
          <g pointerEvents="none">
            <line x1={x(hover!)} x2={x(hover!)} y1={pad.t} y2={y(0)} strokeWidth={1} className="stroke-surface-300 dark:stroke-surface-500" />
            {kind === 'area' && (
              <circle cx={x(hover!)} cy={y(hp.value)} r={4.5} strokeWidth={2} className="fill-primary-500 stroke-white dark:stroke-surface-800" />
            )}
          </g>
        )}

        {/* подписи оси X: первая, середина, последняя */}
        {[0, Math.floor((n - 1) / 2), n - 1]
          .filter((v, i, a) => n > 0 && a.indexOf(v) === i)
          .map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
              className="fill-surface-400 text-[10px]"
            >
              {day(points[i].day)}
            </text>
          ))}
      </svg>
      </div>
    </Card>
  )
}

/* ─── Целое, разбитое на части ─── */

export interface Segment {
  key: string
  label: string
  value: number
  /** Классы цвета: светлая и тёмная тема (проверено validate_palette.js) */
  color: string
  /** Цвет текста внутри блока по светлоте заливки: на жёлтом — тёмный */
  ink?: 'light' | 'dark'
}

/** Высокая полоса-целое с легендой: доля в блоке, имя и число — в легенде */
export function SegmentedBar({ segments, emptyText }: { segments: Segment[]; emptyText: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const [hover, setHover] = useState<string | null>(null)
  if (total === 0) return <p className="py-3 text-sm text-surface-400">{emptyText}</p>
  return (
    <div>
      <div
        className="flex h-7 w-full gap-[2px] overflow-hidden rounded"
        role="img"
        aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}
      >
        {segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const share = Math.round((s.value / total) * 100)
            return (
              <div
                key={s.key}
                className={clsx('flex items-center rounded px-2 transition-opacity', s.color, hover && hover !== s.key && 'opacity-40')}
                style={{ width: `${(s.value / total) * 100}%` }}
                title={`${s.label}: ${fmt(s.value)} (${share}%)`}
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
              >
                {share >= 12 && (
                  <span className={clsx('text-xs font-semibold', s.ink === 'dark' ? 'text-surface-900' : 'text-white')}>
                    {share}%
                  </span>
                )}
              </div>
            )
          })}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <li
            key={s.key}
            className="flex items-center gap-1.5 text-xs"
            onPointerEnter={() => setHover(s.key)}
            onPointerLeave={() => setHover(null)}
          >
            <span className={clsx('h-2.5 w-2.5 rounded-sm', s.color)} aria-hidden />
            <span className="text-surface-500 dark:text-surface-400">{s.label}</span>
            <span className="font-semibold tabular-nums text-surface-800 dark:text-surface-100">{fmt(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ─── Воронка ─── */

export interface FunnelStep {
  label: string
  value: number
}

/** Горизонтальные полосы одного цвета: значение у конца, доля от первого шага */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const first = Math.max(1, steps[0]?.value ?? 1)
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const share = Math.round((s.value / first) * 100)
        return (
          <li key={s.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="text-surface-600 dark:text-surface-300">{s.label}</span>
              <span>
                <span className="font-semibold tabular-nums text-surface-900 dark:text-surface-50">{fmt(s.value)}</span>
                {i > 0 && <span className="ml-1.5 tabular-nums text-surface-400">{share}%</span>}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-100 dark:bg-surface-700">
              <div className="h-2 rounded-full bg-primary-500" style={{ width: `${Math.max(share, s.value > 0 ? 2 : 0)}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}
