/**
 * Map timing table — the ONLY place in this project with hardcoded numbers.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ REFERENCE PATCH: 7.41d                                               │
 * │ Local build checked on: 2026-07-28 (steam.inf VersionDate)           │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Map timings change with every gameplay patch. After updating Dota, revalidate
 * this table using the "Validating the timings" checklist in README.md.
 *
 * Entries flagged `unverified: true` come from secondary sources that
 * contradicted each other and have NOT been confirmed in game yet. The overlay
 * shows a discreet `?` next to them. Confirm in a bot match and drop the flag.
 *
 * All values are in SECONDS of `map.clock_time` (the HUD clock).
 */

export const PATCH = '7.41d'

export type TimerCategory = 'rune' | 'objective' | 'jungle' | 'cycle'

interface BaseSpec {
  id: string
  label: string
  category: TimerCategory
  /** Timing not yet confirmed for the current patch. */
  unverified?: boolean
  /** Hidden by default; the user turns it on in settings. */
  optIn?: boolean
}

/**
 * An event either has a closed list of times, or a start plus an interval.
 * Mixing the two never makes sense, so the type forbids it.
 */
export type RecurringSpec =
  | (BaseSpec & {
      /** Explicit, exhaustive list of occurrences. */
      onlyAt: number[]
      first?: never
      every?: never
      endsAfter?: never
    })
  | (BaseSpec & {
      /** First occurrence, in clock seconds. */
      first: number
      /** Interval between occurrences. Omitted when the event happens once. */
      every?: number
      /** After this clock time the event stops happening. */
      endsAfter?: number
      onlyAt?: never
    })

export const RECURRING: RecurringSpec[] = [
  // ── Runes ────────────────────────────────────────────────────────────
  {
    id: 'bounty',
    label: 'Bounty rune',
    category: 'rune',
    first: 0,
    every: 240
  },
  {
    id: 'water',
    label: 'Water rune',
    category: 'rune',
    // Only two exist in the entire match.
    onlyAt: [120, 240]
  },
  {
    id: 'power',
    label: 'Power rune',
    category: 'rune',
    first: 360,
    every: 120
  },
  {
    id: 'lotus',
    label: 'Lotus',
    category: 'rune',
    // The pool gains ONE lotus every 3 min, capped at 6 — so 18 minutes to
    // fill up (Liquipedia "Replenish Interval: 180", confirmed unchanged in
    // 7.41).
    first: 180,
    every: 180,
    // Once full, new lotuses only grow when someone harvests, and GSI does not
    // report how many are in the pool. Past this point any alert would be a
    // guess, so we stay quiet.
    endsAfter: 1080
  },
  {
    id: 'wisdom',
    label: 'Wisdom shrine',
    category: 'rune',
    first: 420,
    every: 420,
    unverified: true
  },

  // ── Objectives ───────────────────────────────────────────────────────
  {
    id: 'tormentor',
    label: 'Tormentor',
    category: 'objective',
    first: 900,
    // Respawn is 10 min AFTER death, not on a fixed interval — hence no
    // `every`. After the first one it becomes a manual mark (see schedule.ts).
    unverified: true
  },
  {
    id: 'neutral-items',
    label: 'Neutral items',
    category: 'objective',
    onlyAt: [300, 900, 1500, 2100, 3600],
    unverified: true
  },

  // ── Jungle ───────────────────────────────────────────────────────────
  {
    id: 'stack',
    label: 'Stack camp',
    category: 'jungle',
    first: 53,
    every: 60,
    optIn: true
  },
  {
    id: 'pull',
    label: 'Pull creeps',
    category: 'jungle',
    first: 15,
    every: 30,
    // Twice a minute for a whole match would be noise — and pulling only
    // matters while there is a laning phase.
    endsAfter: 600,
    optIn: true
  }
]

/** Day/night cycle: flips every 5 minutes, starting in daylight at 0:00. */
export const DAY_NIGHT_CYCLE = 300

/** Roshan respawns inside a WINDOW, never at an exact moment. */
export const ROSHAN_RESPAWN_MIN = 8 * 60
export const ROSHAN_RESPAWN_MAX = 11 * 60

/** Aegis expires 5 minutes after being picked up. */
export const AEGIS_DURATION = 5 * 60
