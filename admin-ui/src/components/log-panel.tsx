import { useEffect, useRef, useState, useCallback } from 'react'
import { Trash2, ArrowDownToLine, Pause, Play } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import {
  getLogs,
  setLogCapture,
  clearLogs,
  type LogLine,
} from '@/lib/desktop'
import { extractErrorMessage } from '@/lib/utils'

const POLL_INTERVAL_MS = 1000
const MAX_RENDER_LINES = 2000

// Level → text color
function levelClass(level: string): string {
  switch (level) {
    case 'ERROR':
      return 'text-red-500'
    case 'WARN':
      return 'text-amber-500'
    case 'INFO':
      return 'text-emerald-500'
    case 'DEBUG':
      return 'text-sky-500'
    default:
      return 'text-muted-foreground'
  }
}

export function LogPanel() {
  const [lines, setLines] = useState<LogLine[]>([])
  const [capturing, setCapturing] = useState(true)
  const [autoScroll, setAutoScroll] = useState(true)
  const lastSeqRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(autoScroll)
  autoScrollRef.current = autoScroll

  // Poll for incremental log lines
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const pull = await getLogs(lastSeqRef.current)
        if (!cancelled && pull) {
          setCapturing(pull.enabled)
          if (pull.lines.length > 0) {
            lastSeqRef.current = pull.lines[pull.lines.length - 1].seq
            setLines((prev) => {
              const next = [...prev, ...pull.lines]
              return next.length > MAX_RENDER_LINES
                ? next.slice(next.length - MAX_RENDER_LINES)
                : next
            })
          }
        }
      } catch {
        // Silently ignore transient errors during polling; retry on the next tick
      }
      if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS)
    }

    poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  // Auto-scroll to the bottom when new logs arrive
  useEffect(() => {
    if (autoScrollRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines])

  const handleToggleCapture = useCallback(async (enabled: boolean) => {
    setCapturing(enabled)
    try {
      await setLogCapture(enabled)
    } catch (e) {
      toast.error(`Failed to toggle log capture: ${extractErrorMessage(e)}`)
    }
  }, [])

  const handleClear = useCallback(async () => {
    try {
      await clearLogs()
      setLines([])
      // Don't reset lastSeq: the backend sequence keeps increasing, which avoids pulling stale lines that were already cleared
    } catch (e) {
      toast.error(`Failed to clear logs: ${extractErrorMessage(e)}`)
    }
  }, [])

  return (
    <Card className="flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 12rem)' }}>
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          Runtime Logs
          <span className="text-xs font-normal text-muted-foreground">
            ({lines.length} lines, up to {MAX_RENDER_LINES} kept)
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {capturing ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            Capture
            <Switch checked={capturing} onCheckedChange={handleToggleCapture} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Auto-scroll
            <Switch checked={autoScroll} onCheckedChange={setAutoScroll} />
          </label>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            Clear
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            {capturing ? 'No logs yet, waiting for output…' : 'Log capture is off'}
          </div>
        ) : (
          lines.map((l) => (
            <div key={l.seq} className="flex gap-2 whitespace-pre-wrap break-all">
              <span className="shrink-0 text-muted-foreground">{l.ts}</span>
              <span className={`shrink-0 font-semibold ${levelClass(l.level)}`}>
                {l.level.padEnd(5)}
              </span>
              <span className="shrink-0 text-muted-foreground/70">{l.target}</span>
              <span className="flex-1">{l.message}</span>
            </div>
          ))
        )}
      </div>
    </Card>
  )
}
