import type { TimerEvent } from '@shared/schedule'
import { TimerRow } from './TimerRow'

/** How many events fit in the panel without becoming visual clutter. */
const MAX_ROWS = 8

export function TimersWidget({ events }: { events: TimerEvent[] }) {
  if (events.length === 0) return null

  return (
    <ul className="card rows">
      {events.slice(0, MAX_ROWS).map((event) => (
        <TimerRow key={event.id} event={event} />
      ))}
    </ul>
  )
}
