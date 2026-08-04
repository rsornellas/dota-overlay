import type { TimerEvent } from '@shared/schedule'
import { TimerRow } from './TimerRow'

/**
 * Manual marks (Roshan, Aegis, Tormentor) get their own panel: this is the
 * information people most want large and pinned to a fixed corner.
 */
export function RoshanWidget({ events, editing }: { events: TimerEvent[]; editing: boolean }) {
  if (events.length === 0) {
    // Outside edit mode it vanishes entirely; during editing it needs a body
    // so the user can position it before marking anything.
    if (!editing) return null

    return (
      <div className="card card--hint">
        Roshan and Aegis show up here
        <span className="hint__keys">Ctrl+Alt+R · Ctrl+Alt+A</span>
      </div>
    )
  }

  return (
    <ul className="card rows">
      {events.map((event) => (
        <TimerRow key={event.id} event={event} />
      ))}
    </ul>
  )
}
