/**
 * Alert engine: given what is coming up, decide what should fire right now.
 *
 * It is the same problem for speech and for on-screen alerts — only the
 * presentation differs. So the decision lives here, once, as a pure function.
 */

import type { TimerEvent } from './schedule'

export interface CueConfig {
  enabled: boolean
  /** Alert text. Empty = fall back to the timer label. */
  phrase: string
  /** Lead time in seconds: room to react before the event. */
  lead: number
}

/** Anything that can fire alerts (speech, visual, ...). */
export interface CueSource {
  enabled: boolean
  cues: Record<string, CueConfig>
}

export interface Cue {
  /** Identifies the occurrence, not the timer: keeps alerts from repeating. */
  key: string
  text: string
}

/**
 * If the clock jumps (lag, alt-tab, overlay reopened mid-match), there is no
 * point announcing something that expired long ago. This is the tolerance.
 */
const MAX_LATE_SECONDS = 2

/** Key for one specific occurrence of an event. */
export function cueKey(event: TimerEvent): string {
  return `${event.id}:${event.at}`
}

/**
 * Which alerts should fire now, given what already fired.
 * Pure: `fired` goes in, nothing is mutated here.
 */
export function dueCues(
  events: TimerEvent[],
  source: CueSource,
  fired: ReadonlySet<string>
): Cue[] {
  if (!source.enabled) return []

  const cues: Cue[] = []

  for (const event of events) {
    const config = source.cues[event.id]
    if (!config?.enabled) continue

    // Too early to announce.
    if (event.in > config.lead) continue
    // Too late: better silent than stale.
    if (event.in < -MAX_LATE_SECONDS) continue

    const key = cueKey(event)
    if (fired.has(key)) continue

    cues.push({ key, text: config.phrase.trim() || event.label })
  }

  return cues
}
