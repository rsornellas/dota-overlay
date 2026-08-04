import { formatCountdown } from '@shared/format'
import type { TimerEvent } from '@shared/schedule'

/** Final seconds before an event: time to react. */
const IMMINENT = 10

export function TimerRow({ event }: { event: TimerEvent }) {
  const imminent = event.in <= IMMINENT
  // Roshan's window is already open: he could be alive at any moment.
  const windowOpen = event.windowEnd !== undefined && event.in <= 0

  return (
    <li className={`row row--${event.category}${imminent ? ' row--imminent' : ''}`}>
      <span className="row__label">
        {event.label}
        {event.unverified && (
          <span className="row__flag" title="Timing not yet confirmed for the current patch">
            ?
          </span>
        )}
      </span>

      <span className="row__time">
        {windowOpen ? (
          <>
            <span className="row__now">may be up</span>
            <span className="row__window">until {formatCountdown(event.windowIn ?? 0)}</span>
          </>
        ) : (
          <>
            {formatCountdown(event.in)}
            {event.windowEnd !== undefined && (
              <span className="row__window">→ {formatCountdown(event.windowIn ?? 0)}</span>
            )}
          </>
        )}
      </span>
    </li>
  )
}
