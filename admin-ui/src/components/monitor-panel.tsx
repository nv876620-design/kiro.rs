import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  CheckCircle2,
  XCircle,
  Timer,
  Unplug,
  RotateCw,
  FileWarning,
  Server,
  BarChart3,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { useMetrics } from '@/hooks/use-credentials'
import type { MetricsResponse, ModelStat } from '@/types/api'

// Compact token counts: 1234 → 1.2k, 1234567 → 1.23M
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

// Credits cost formatting: keep 2-3 decimals for small values, abbreviate large ones
function formatCredits(n: number): string {
  if (n === 0) return '0'
  if (n < 1) return n.toFixed(3)
  if (n < 1000) return n.toFixed(2)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

// Cumulative counter field names (used to compute per-poll deltas)
type CounterKey =
  | 'requestsSuccess'
  | 'requestsError'
  | 'upstreamRateLimited'
  | 'streamInterrupted'
  | 'streamRestarted'
  | 'streamDecodeFailures'

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

// Pure-SVG success rate ring
function SuccessRing({ rate, total }: { rate: number; total: number }) {
  const size = 92
  const stroke = 7
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Number.isFinite(rate) ? rate : 0
  const offset = c * (1 - pct / 100)
  const color =
    total === 0
      ? 'hsl(var(--muted-foreground))'
      : pct >= 95
        ? 'hsl(var(--success))'
        : pct >= 80
          ? 'hsl(var(--warning))'
          : 'hsl(var(--destructive))'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeOpacity={0.85}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold tabular-nums">
          {total === 0 ? '—' : `${pct.toFixed(0)}%`}
        </span>
        <span className="text-[10px] text-muted-foreground">Success rate</span>
      </div>
    </div>
  )
}

interface CounterCardProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  delta: number
  tone: 'success' | 'destructive' | 'warning' | 'info' | 'muted'
}

const toneClass: Record<CounterCardProps['tone'], string> = {
  success: 'text-success',
  destructive: 'text-destructive',
  warning: 'text-warning',
  info: 'text-info',
  muted: 'text-muted-foreground',
}

// Compact stat row: icon + label + value on one line; zero values are dimmed, only non-zero uses semantic colors
function CounterCard({ icon: Icon, label, value, delta, tone }: CounterCardProps) {
  const active = value > 0
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2">
      <Icon className={`h-4 w-4 shrink-0 ${active ? toneClass[tone] : 'text-muted-foreground/50'}`} />
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <span className="ml-auto flex items-baseline gap-1">
        <span className={`text-base font-semibold tabular-nums ${active ? '' : 'text-muted-foreground/60'}`}>
          {value.toLocaleString()}
        </span>
        {delta > 0 && (
          <span className={`text-[10px] font-medium ${toneClass[tone]}`}>+{delta}</span>
        )}
      </span>
    </div>
  )
}

export function MonitorPanel() {
  const { data, isLoading, error } = useMetrics()
  // Keep the previous snapshot to compute deltas between polls
  const prevRef = useRef<MetricsResponse | null>(null)
  const [deltas, setDeltas] = useState<Record<CounterKey, number>>({
    requestsSuccess: 0,
    requestsError: 0,
    upstreamRateLimited: 0,
    streamInterrupted: 0,
    streamRestarted: 0,
    streamDecodeFailures: 0,
  })

  useEffect(() => {
    if (!data) return
    const prev = prevRef.current
    if (prev) {
      const keys: CounterKey[] = [
        'requestsSuccess',
        'requestsError',
        'upstreamRateLimited',
        'streamInterrupted',
        'streamRestarted',
        'streamDecodeFailures',
      ]
      const next = {} as Record<CounterKey, number>
      for (const k of keys) {
        // A process restart resets the counters; clamp negative deltas to 0
        next[k] = Math.max(0, data[k] - prev[k])
      }
      setDeltas(next)
    }
    prevRef.current = data
  }, [data])

  if (error) {
    return (
      <Card className="p-4 text-sm text-destructive">
        Failed to load metrics: {(error as Error).message}
      </Card>
    )
  }

  const totalReq = data ? data.requestsSuccess + data.requestsError : 0
  const successRate = totalReq > 0 ? (data!.requestsSuccess / totalReq) * 100 : 0

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-info" />
        <h2 className="text-sm font-semibold">Realtime Monitoring</h2>
        {isLoading && !data && (
          <span className="text-xs text-muted-foreground">Loading...</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">Refreshes every 4s</span>
      </div>

      <div className="grid items-stretch gap-3 lg:grid-cols-[minmax(280px,340px)_1fr]">
        {/* Overview: success rate ring + key metrics */}
        <Card className="flex items-center gap-4 p-4">
          <SuccessRing rate={successRate} total={totalReq} />
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm">
              <Server className="h-3.5 w-3.5 text-info" />
              <span className="text-muted-foreground">Available credentials</span>
              <span className="ml-auto font-semibold tabular-nums">
                {data?.credentialsAvailable ?? '—'} / {data?.credentialsTotal ?? '—'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <span className="text-muted-foreground">Total successes</span>
              <span className="ml-auto font-semibold tabular-nums">
                {data?.requestsSuccess.toLocaleString() ?? '—'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Timer className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Uptime</span>
              <span className="ml-auto font-semibold tabular-nums">
                {data ? formatUptime(data.uptimeSeconds) : '—'}
              </span>
            </div>
          </div>
        </Card>

        {/* Breakdown counters (compact rows with per-poll deltas) */}
        <div className="grid grid-cols-1 content-center gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <CounterCard
            icon={XCircle}
            label="Failed requests"
            value={data?.requestsError ?? 0}
            delta={deltas.requestsError}
            tone="destructive"
          />
          <CounterCard
            icon={Timer}
            label="Upstream 429"
            value={data?.upstreamRateLimited ?? 0}
            delta={deltas.upstreamRateLimited}
            tone="warning"
          />
          <CounterCard
            icon={Unplug}
            label="Stream interrupts"
            value={data?.streamInterrupted ?? 0}
            delta={deltas.streamInterrupted}
            tone="destructive"
          />
          <CounterCard
            icon={RotateCw}
            label="Stream reconnects"
            value={data?.streamRestarted ?? 0}
            delta={deltas.streamRestarted}
            tone="info"
          />
          <CounterCard
            icon={FileWarning}
            label="Decode failures"
            value={data?.streamDecodeFailures ?? 0}
            delta={deltas.streamDecodeFailures}
            tone="muted"
          />
        </div>
      </div>

      {/* Per-model stats table */}
      <ModelStatsTable models={data?.models ?? []} />
    </section>
  )
}

// Cumulative requests + tokens + live RPM table per model
function ModelStatsTable({ models }: { models: ModelStat[] }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-info" />
        <h3 className="text-sm font-semibold">Model Stats</h3>
        <span className="ml-auto text-xs text-muted-foreground">Today / All-time · live RPM covers the last 60s</span>
      </div>
      {models.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground">No requests recorded yet</div>
      ) : (
        // Shows ~3 rows by default and scrolls vertically beyond that; the two-level header stays sticky
        <div className="max-h-[140px] overflow-y-auto overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            {/* Explicit column widths keep the two-level header aligned with the data columns */}
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              {/* Group header: Today | All-time | Live (sticky first row) */}
              <tr className="text-[11px] text-muted-foreground">
                <th className="sticky top-0 z-10 bg-card pb-1" />
                <th className="sticky top-0 z-10 border-l bg-card pb-1 px-3 text-center font-medium" colSpan={3}>
                  Today
                </th>
                <th className="sticky top-0 z-10 border-l bg-card pb-1 px-3 text-center font-medium" colSpan={3}>
                  All-time
                </th>
                <th className="sticky top-0 z-10 border-l bg-card pb-1 pl-3 text-center font-medium">Live</th>
              </tr>
              <tr className="text-xs text-muted-foreground">
                <th className="sticky top-[22px] z-10 border-b bg-card py-1 pr-3 text-left font-medium">Model</th>
                <th className="sticky top-[22px] z-10 border-b border-l bg-card py-1 px-3 text-right font-medium">Requests</th>
                <th className="sticky top-[22px] z-10 border-b bg-card py-1 px-3 text-right font-medium">token</th>
                <th className="sticky top-[22px] z-10 border-b bg-card py-1 px-3 text-right font-medium">Cost</th>
                <th className="sticky top-[22px] z-10 border-b border-l bg-card py-1 px-3 text-right font-medium">Requests</th>
                <th className="sticky top-[22px] z-10 border-b bg-card py-1 px-3 text-right font-medium">token</th>
                <th className="sticky top-[22px] z-10 border-b bg-card py-1 px-3 text-right font-medium">Cost</th>
                <th className="sticky top-[22px] z-10 border-b border-l bg-card py-1 pl-3 text-right font-medium">RPM</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="truncate py-1 pr-3 font-medium" title={m.model}>
                    {m.model}
                  </td>
                  {/* Today */}
                  <td className="border-l py-1 px-3 text-right tabular-nums">
                    {m.todayRequests > 0 ? (
                      m.todayRequests.toLocaleString()
                    ) : (
                      <span className="text-muted-foreground/50">0</span>
                    )}
                  </td>
                  <td
                    className="py-1 px-3 text-right tabular-nums"
                    title={m.todayTotalTokens.toLocaleString()}
                  >
                    {m.todayTotalTokens > 0 ? (
                      formatTokens(m.todayTotalTokens)
                    ) : (
                      <span className="text-muted-foreground/50">0</span>
                    )}
                  </td>
                  <td
                    className="py-1 px-3 text-right tabular-nums"
                    title={`${m.todayCredits} credits`}
                  >
                    {m.todayCredits > 0 ? (
                      <span className="font-medium text-[#a855f7]">
                        {formatCredits(m.todayCredits)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">0</span>
                    )}
                  </td>
                  {/* All-time */}
                  <td className="border-l py-1 px-3 text-right tabular-nums text-muted-foreground">
                    {m.requests.toLocaleString()}
                  </td>
                  <td
                    className="py-1 px-3 text-right tabular-nums text-muted-foreground"
                    title={m.totalTokens.toLocaleString()}
                  >
                    {formatTokens(m.totalTokens)}
                  </td>
                  <td
                    className="py-1 px-3 text-right tabular-nums text-muted-foreground"
                    title={`${m.credits} credits`}
                  >
                    {m.credits > 0 ? formatCredits(m.credits) : (
                      <span className="text-muted-foreground/50">0</span>
                    )}
                  </td>
                  {/* Live RPM */}
                  <td className="border-l py-1 pl-3 text-right tabular-nums">
                    {m.rpm > 0 ? (
                      <span className="font-medium text-success">{m.rpm}</span>
                    ) : (
                      <span className="text-muted-foreground/50">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
