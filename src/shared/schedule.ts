/**
 * Pure scheduling logic: given the match clock, what comes next.
 * No Date.now(), no global state, no I/O — everything arrives as a parameter.
 * That is what makes this part testable without launching the game.
 */

import type { ManualState } from './gsi-types'
import {
  AEGIS_DURATION,
  DAY_NIGHT_CYCLE,
  RECURRING,
  ROSHAN_RESPAWN_MAX,
  ROSHAN_RESPAWN_MIN,
  type RecurringSpec,
  type TimerCategory
} from './timings'

export interface TimerEvent {
  id: string
  label: string
  category: TimerCategory | 'manual'
  /** Clock time it happens at. For windowed events, when the window opens. */
  at: number
  /** Seconds until it happens. Negative = already started / window open. */
  in: number
  /** End of the uncertainty window, when there is one (Roshan). */
  windowEnd?: number
  /** Seconds until the window closes. */
  windowIn?: number
  /** Timing not yet confirmed for the current patch. */
  unverified?: boolean
  /** Hidden by default; the user turns it on in settings. */
  optIn?: boolean
}

/**
 * Next occurrence of a recurring event, or null if there are no more.
 * Always strictly AFTER `clock` — an event happening right now has passed;
 * what matters is the one after it.
 */
export function nextOccurrence(clock: number, spec: RecurringSpec): number | null {
  if (spec.onlyAt) {
    return spec.onlyAt.find((t) => t > clock) ?? null
  }

  if (spec.every === undefined) {
    return clock < spec.first ? spec.first : null
  }

  const next =
    clock < spec.first
      ? spec.first
      : spec.first + Math.floor((clock - spec.first) / spec.every + 1) * spec.every

  if (spec.endsAfter !== undefined && next > spec.endsAfter) return null
  return next
}

/**
 * Next day/night flip.
 * The current state comes from GSI (`map.daytime`) instead of being computed,
 * because abilities like Night Stalker's change the cycle.
 */
export function nextDayNight(clock: number, daytime: boolean): TimerEvent {
  const at =
    clock < DAY_NIGHT_CYCLE
      ? DAY_NIGHT_CYCLE
      : Math.floor(clock / DAY_NIGHT_CYCLE + 1) * DAY_NIGHT_CYCLE

  return {
    id: 'daynight',
    label: daytime ? 'Night' : 'Day',
    category: 'cycle',
    at,
    in: at - clock
  }
}

function roshanEvent(clock: number, killedAt: number): TimerEvent | null {
  const windowStart = killedAt + ROSHAN_RESPAWN_MIN
  const windowEnd = killedAt + ROSHAN_RESPAWN_MAX

  // Past the whole window he is certainly alive: nothing left to count.
  if (clock >= windowEnd) return null

  return {
    id: 'roshan',
    label: 'Roshan',
    category: 'manual',
    at: windowStart,
    in: windowStart - clock,
    windowEnd,
    windowIn: windowEnd - clock
  }
}

function aegisEvent(clock: number, pickedAt: number): TimerEvent | null {
  const expiresAt = pickedAt + AEGIS_DURATION
  if (clock >= expiresAt) return null

  return {
    id: 'aegis',
    label: 'Aegis expires',
    category: 'manual',
    at: expiresAt,
    in: expiresAt - clock
  }
}

function tormentorEvent(clock: number, killedAt: number): TimerEvent | null {
  const spec = RECURRING.find((s) => s.id === 'tormentor')
  const respawnAt = killedAt + 600
  if (clock >= respawnAt) return null

  return {
    id: 'tormentor',
    label: 'Tormentor',
    category: 'manual',
    at: respawnAt,
    in: respawnAt - clock,
    unverified: spec?.unverified
  }
}

/**
 * Manual marks only apply to the match they were made in.
 * Once `matchid` changes they are garbage.
 */
export function manualForMatch(manual: ManualState, matchId: string | null): ManualState {
  if (manual.matchId !== null && manual.matchId === matchId) return manual
  return { matchId, roshanKilledAt: null, aegisPickedAt: null, tormentorKilledAt: null }
}

export interface ScheduleInput {
  /** `map.clock_time`. Negative during pre-game. */
  clockTime: number
  /** `map.daytime`. */
  daytime: boolean
  manual: ManualState
}

/**
 * Every upcoming event, ordered from most imminent to furthest away.
 * Events already in progress (Roshan window open, Aegis active) have a
 * negative or small `in` and naturally come first.
 */
export function nextEvents({ clockTime, daytime, manual }: ScheduleInput): TimerEvent[] {
  const events: TimerEvent[] = []

  for (const spec of RECURRING) {
    // Tormentor becomes a manual mark once it dies for the first time.
    if (spec.id === 'tormentor' && manual.tormentorKilledAt !== null) continue

    const at = nextOccurrence(clockTime, spec)
    if (at === null) continue

    events.push({
      id: spec.id,
      label: spec.label,
      category: spec.category,
      at,
      in: at - clockTime,
      unverified: spec.unverified,
      optIn: spec.optIn
    })
  }

  events.push(nextDayNight(clockTime, daytime))

  if (manual.roshanKilledAt !== null) {
    const ev = roshanEvent(clockTime, manual.roshanKilledAt)
    if (ev) events.push(ev)
  }
  if (manual.aegisPickedAt !== null) {
    const ev = aegisEvent(clockTime, manual.aegisPickedAt)
    if (ev) events.push(ev)
  }
  if (manual.tormentorKilledAt !== null) {
    const ev = tormentorEvent(clockTime, manual.tormentorKilledAt)
    if (ev) events.push(ev)
  }

  return events.sort((a, b) => a.in - b.in || a.id.localeCompare(b.id))
}
