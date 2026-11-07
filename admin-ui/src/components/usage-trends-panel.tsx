import { useMemo, useState } from 'react'
import {
  ComposedChart,
  Line,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts'
import { TrendingUp, PieChart as PieIcon, Server, Coins } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTimeseries, useCredentials } from '@/hooks/use-credentials'
import type { TimeBucket, DimBucket } from '@/types/api'

// Legend colors (recharts cannot resolve CSS variables for SVG strokes, so fixed hex values are used)
const COLORS = {
  input: '#3b82f6', // Blue: input
  output: '#10b981', // Green: output
  cacheWrite: '#f59e0b', // Orange: cache write
  cacheRead: '#06b6d4', // Cyan: cache read
  credits: '#a855f7', // Purple: cost (credits)
}

// Cycled palette for the model/credential distribution charts
const DIST_COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#a855f7',
  '#06b6d4',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
]

type RangePreset = '24h' | '7d' | '30d'

// Compact token counts
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

// Credits cost formatting: keep 2-3 decimals for small values and abbreviate large ones
function formatCredits(n: number): string {
  if (n === 0) return '0'
  if (n < 1) return n.toFixed(3)
  if (n < 1000) return n.toFixed(2)
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

// Unix seconds → local date input value (YYYY-MM-DD)
function toDateInput(unixSec: number): string {
  const d = new Date(unixSec * 1000)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// date input value → Unix seconds of that day at 00:00
function fromDateInput(value: string): number {
  return Math.floor(new Date(`${value}T00:00:00`).getTime() / 1000)
}

// Bucket timestamp → X axis label
function formatBucketLabel(unixSec: number, bucket: 'hour' | 'day'): string {
  const d = new Date(unixSec * 1000)
  if (bucket === 'day') {
    return `${d.getMonth() + 1}/${d.getDate()}`
  }
  return `${String(d.getHours()).padStart(2, '0')}:00`
}

export function UsageTrendsPanel() {
  const now = useMemo(() => Math.floor(Date.now() / 1000), [])
  const [preset, setPreset] = useState<RangePreset>('24h')
  const [bucket, setBucket] = useState<'hour' | 'day'>('hour')
  // Custom range (date input values); follows the 24h preset by default
  const [fromDate, setFromDate] = useState(toDateInput(now - 24 * 3600))
  const [toDate, setToDate] = useState(toDateInput(now))
  // Query range actually in effect (updated only when "Apply" is clicked)
  const [applied, setApplied] = useState<{ from: number; to: number; bucket: 'hour' | 'day' }>({
    from: now - 24 * 3600,
    to: now,
    bucket: 'hour',
  })

  const { data, isLoading, error } = useTimeseries(applied.from, applied.to, applied.bucket)
  const { data: credData } = useCredentials()

  // Credential id → readable label (email first, otherwise #id)
  const credLabel = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of credData?.credentials ?? []) {
      map.set(String(c.id), c.email || `#${c.id}`)
    }
    return map
  }, [credData])

  // Apply a preset: update the range and the default bucket size
  function applyPreset(p: RangePreset) {
    const nowSec = Math.floor(Date.now() / 1000)
    const spans: Record<RangePreset, number> = {
      '24h': 24 * 3600,
      '7d': 7 * 86400,
      '30d': 30 * 86400,
    }
    const from = nowSec - spans[p]
    const b: 'hour' | 'day' = p === '24h' ? 'hour' : 'day'
    setPreset(p)
    setBucket(b)
    setFromDate(toDateInput(from))
    setToDate(toDateInput(nowSec))
    setApplied({ from, to: nowSec, bucket: b })
  }

  // Apply the custom range
  function applyCustom() {
    const from = fromDateInput(fromDate)
    // to is 23:59:59 of that day so the day is included
    const to = fromDateInput(toDate) + 86399
    setApplied({ from, to, bucket })
  }

  const chartData = useMemo(
    () =>
      (data?.series ?? []).map((b: TimeBucket) => ({
        label: formatBucketLabel(b.bucket, applied.bucket),
        Input: b.inputTokens,
        Output: b.outputTokens,
        'Cache write': b.cacheWriteTokens,
        'Cache read': b.cacheReadTokens,
        Cost: Number(b.credits.toFixed(3)),
      })),
    [data, applied.bucket]
  )

  // Total credits consumed within the range
  const totalCredits = useMemo(
    () => (data?.series ?? []).reduce((sum, b) => sum + b.credits, 0),
    [data]
  )

  const rangeText = `${toDateInput(applied.from)} ~ ${toDateInput(applied.to)} · by ${
    applied.bucket === 'day' ? 'day' : 'hour'
  }`

  return (
    <section className="space-y-3">
      {/* Main trend chart */}
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <TrendingUp className="h-4 w-4 text-info" />
          <div>
            <h3 className="text-sm font-semibold">Token Usage Trends</h3>
            <p className="text-xs text-muted-foreground">
              Aggregated by {applied.bucket === 'day' ? 'day' : 'hour'} · input/output/cache read/write · cost
            </p>
          </div>
          {/* Total cost for the range */}
          <div
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1"
            style={{ borderColor: COLORS.credits }}
          >
            <Coins className="h-3.5 w-3.5" style={{ color: COLORS.credits }} />
            <span className="text-xs text-muted-foreground">Range Cost</span>
            <span className="text-sm font-semibold tabular-nums" style={{ color: COLORS.credits }}>
              {formatCredits(totalCredits)}
            </span>
          </div>

          {/* Time range controls */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border p-0.5">
              {(['24h', '7d', '30d'] as RangePreset[]).map((p) => (
                <button
                  key={p}
                  onClick={() => applyPreset(p)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    preset === p
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p === '24h' ? '24 hours' : p === '7d' ? '7 days' : '30 days'}
                </button>
              ))}
            </div>

            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value as 'hour' | 'day')}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              <option value="hour">Hourly</option>
              <option value="day">Daily</option>
            </select>

            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            />
            <Button size="sm" onClick={applyCustom} className="h-7 text-xs">
              Apply
            </Button>
          </div>
        </div>

        {error ? (
          <div className="py-16 text-center text-sm text-destructive">
            Failed to load trend data: {(error as Error).message}
          </div>
        ) : isLoading && !data ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading...</div>
        ) : chartData.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))' }}
              />
              <YAxis
                yAxisId="tokens"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatTokens}
              />
              <YAxis
                yAxisId="credits"
                orientation="right"
                tick={{ fontSize: 11, fill: COLORS.credits }}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatCredits}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value, name) => {
                  const v = Number(value)
                  if (name === 'Cost') return [`${formatCredits(v)} credits`, name as string]
                  return [formatTokens(v), name as string]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area
                yAxisId="tokens"
                type="monotone"
                dataKey="Input"
                stroke={COLORS.input}
                fill={COLORS.input}
                fillOpacity={0.12}
                strokeWidth={2}
              />
              <Line
                yAxisId="tokens"
                type="monotone"
                dataKey="Output"
                stroke={COLORS.output}
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="tokens"
                type="monotone"
                dataKey="Cache write"
                stroke={COLORS.cacheWrite}
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="tokens"
                type="monotone"
                dataKey="Cache read"
                stroke={COLORS.cacheRead}
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="credits"
                type="monotone"
                dataKey="Cost"
                stroke={COLORS.credits}
                strokeWidth={2.5}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Two distribution panels */}
      <div className="grid gap-3 lg:grid-cols-2">
        <DistributionCard
          title="Distribution by model"
          subtitle={rangeText}
          icon={PieIcon}
          items={data?.byModel ?? []}
          labelOf={(k) => k}
        />
        <DistributionCard
          title="Distribution by upstream credential"
          subtitle={`Top ${data?.byCredential.length ?? 0}`}
          icon={Server}
          items={data?.byCredential ?? []}
          labelOf={(k) => credLabel.get(k) ?? `#${k}`}
        />
      </div>
    </section>
  )
}

// Distribution bar chart card (sorted by total tokens)
function DistributionCard({
  title,
  subtitle,
  icon: Icon,
  items,
  labelOf,
}: {
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  items: DimBucket[]
  labelOf: (key: string) => string
}) {
  const rows = useMemo(
    () =>
      items
        .map((d) => ({
          label: labelOf(d.key),
          Cost: Number(d.credits.toFixed(3)),
          tokens: d.inputTokens + d.outputTokens + d.cacheReadTokens + d.cacheWriteTokens,
          requests: d.requests,
        }))
        // Sort by cost when available, otherwise fall back to tokens (the estimate path has no credits)
        .sort((a, b) => b.Cost - a.Cost || b.tokens - a.tokens)
        .slice(0, 8),
    [items, labelOf]
  )

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-info" />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">{subtitle}</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatCredits}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={140}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, _name, item) => {
                const p = item?.payload as { tokens: number; requests: number } | undefined
                return [
                  `${formatCredits(Number(value))} credits · ${formatTokens(p?.tokens ?? 0)} token · ${p?.requests ?? 0} requests`,
                  'Cost',
                ]
              }}
            />
            <Bar dataKey="Cost" radius={[0, 4, 4, 0]}>
              {rows.map((_, i) => (
                <Cell key={i} fill={DIST_COLORS[i % DIST_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}
