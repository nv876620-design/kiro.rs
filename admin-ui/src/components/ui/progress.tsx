import * as React from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
  /// Custom progress bar color class (auto-colored by usage ratio when omitted: high usage trends red)
  indicatorClassName?: string
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, indicatorClassName, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

    const autoColor =
      percentage > 80 ? 'bg-destructive' : percentage > 60 ? 'bg-warning' : 'bg-success'

    return (
      <div
        ref={ref}
        className={cn(
          'relative h-2.5 w-full overflow-hidden rounded-full bg-secondary',
          className
        )}
        {...props}
      >
        <div
          className={cn('h-full rounded-full transition-all', indicatorClassName ?? autoColor)}
          style={{ width: `${percentage}%` }}
        />
      </div>
    )
  }
)
Progress.displayName = 'Progress'

export { Progress }
