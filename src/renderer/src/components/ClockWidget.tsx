import { formatClock } from '@shared/format'

interface ClockWidgetProps {
  clock: number
  daytime: boolean
  paused: boolean
  live: boolean
}

export function ClockWidget({ clock, daytime, paused, live }: ClockWidgetProps) {
  return (
    <div className="card card--clock">
      <span className="clock__time">{live ? formatClock(clock) : '--:--'}</span>
      <span className="clock__meta">
        {paused ? 'paused' : live ? (daytime ? 'day' : 'night') : 'no match'}
      </span>
    </div>
  )
}
