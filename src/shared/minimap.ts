/**
 * Tracking enemy heroes from the GSI `minimap` block.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ WHY THIS IS NOT CHEATING                                             │
 * │                                                                      │
 * │ Valve filters the `minimap` block by YOUR vision before sending it.  │
 * │ Measured in a real match: my own team's 5 heroes showed up in 259 of │
 * │ 259 frames; the enemies, in 28 of 259 — only while they were visible │
 * │ on my minimap.                                                       │
 * │                                                                      │
 * │ In other words: the game never tells us where an enemy is inside the │
 * │ fog. What we do here is REMEMBER the last position you already saw,  │
 * │ like someone typing it in chat. No new information is revealed.      │
 * └──────────────────────────────────────────────────────────────────────┘
 */

export const RADIANT_TEAM = 2
export const DIRE_TEAM = 3

/** Half the width of the playable map, in world units. */
export const MAP_BOUND = 8288

/** Seconds until a ghost reaches minimum opacity. */
export const GHOST_FADE_SECONDS = 60

/** Past this, the position is too old to help, and it disappears. */
export const GHOST_MAX_AGE_SECONDS = 120

const HERO_PREFIX = 'npc_dota_hero_'

/** A hero entry from the minimap block, cleaned up. */
export interface MinimapHero {
  /** npc_dota_hero_skeleton_king */
  unitname: string
  x: number
  y: number
}

export interface TrackedHero {
  unitname: string
  /** Short tag to draw on the map: SK, WD, JUG. */
  short: string
  x: number
  y: number
  /** clock_time of the last sighting. */
  lastSeen: number
  /** Visible right NOW (not a ghost). */
  visible: boolean
}

/** Enemy team number, derived from `player.team_name`. */
export function enemyTeamOf(teamName: string | undefined | null): number | null {
  if (teamName === 'radiant') return DIRE_TEAM
  if (teamName === 'dire') return RADIANT_TEAM
  return null
}

/**
 * A hero's short tag: `skeleton_king` → `SK`, `juggernaut` → `JUG`.
 * It is how players refer to them in chat.
 */
export function heroShortName(unitname: string): string {
  const raw = unitname.startsWith(HERO_PREFIX) ? unitname.slice(HERO_PREFIX.length) : unitname
  const words = raw.split('_').filter(Boolean)
  if (words.length === 0) return '?'

  if (words.length === 1) return words[0].slice(0, 3).toUpperCase()
  return words
    .map((w) => w[0])
    .join('')
    .slice(0, 4)
    .toUpperCase()
}

/** Enemy heroes visible at this instant. */
export function extractEnemyHeroes(
  minimap: Record<string, unknown> | undefined,
  enemyTeam: number | null
): MinimapHero[] {
  if (!minimap || enemyTeam === null) return []

  const heroes: MinimapHero[] = []

  for (const element of Object.values(minimap)) {
    if (!element || typeof element !== 'object') continue
    const unit = element as Record<string, unknown>

    if (typeof unit.unitname !== 'string' || !unit.unitname.startsWith(HERO_PREFIX)) continue
    if (unit.team !== enemyTeam) continue
    if (typeof unit.xpos !== 'number' || typeof unit.ypos !== 'number') continue

    heroes.push({ unitname: unit.unitname, x: unit.xpos, y: unit.ypos })
  }

  return heroes
}

/**
 * Updates the ghosts. Whoever is visible gets a fresh position and timestamp;
 * whoever vanished keeps their last known position until it gets too old.
 *
 * Pure: `previous` goes in, a new list comes out.
 */
export function trackEnemies(
  previous: TrackedHero[],
  seen: MinimapHero[],
  clockTime: number
): TrackedHero[] {
  const byName = new Map(previous.map((hero) => [hero.unitname, hero]))

  for (const hero of seen) {
    byName.set(hero.unitname, {
      unitname: hero.unitname,
      short: heroShortName(hero.unitname),
      x: hero.x,
      y: hero.y,
      lastSeen: clockTime,
      visible: true
    })
  }

  const visibleNow = new Set(seen.map((h) => h.unitname))

  return [...byName.values()]
    .map((hero) => (visibleNow.has(hero.unitname) ? hero : { ...hero, visible: false }))
    // A clock running backwards means a new match: drop the leftovers.
    .filter((hero) => clockTime - hero.lastSeen >= 0)
    .filter((hero) => hero.visible || clockTime - hero.lastSeen <= GHOST_MAX_AGE_SECONDS)
}

/**
 * Converts world coordinates into a [0,1] fraction of the minimap.
 * The Y axis is flipped: in Dota +y is north; on screen +top goes down.
 */
export function toMapFraction(x: number, y: number): { left: number; top: number } {
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
  return {
    left: clamp01((x + MAP_BOUND) / (MAP_BOUND * 2)),
    top: clamp01(1 - (y + MAP_BOUND) / (MAP_BOUND * 2))
  }
}

/** Marker opacity: full for the living, fading for ghosts as they age. */
export function ghostOpacity(hero: TrackedHero, clockTime: number): number {
  if (hero.visible) return 1

  const age = Math.max(0, clockTime - hero.lastSeen)
  const faded = 1 - age / GHOST_FADE_SECONDS
  return Math.max(0.25, Math.min(1, faded))
}
