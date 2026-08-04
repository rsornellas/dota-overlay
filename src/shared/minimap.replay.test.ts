/**
 * Replays the tracker against a REAL Dota recording.
 *
 * Tests with invented data prove the logic is coherent; this one proves the
 * assumptions about Valve's format are correct.
 *
 * Skips automatically when there is no recording (another machine, CI). To
 * make one: tray → "Record payloads (diagnostics)", play, then turn it off.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  enemyTeamOf,
  extractEnemyHeroes,
  MAP_BOUND,
  trackEnemies,
  type TrackedHero
} from './minimap'

// No APPDATA means no Windows, which means no recording. Resolving it to a
// relative path instead would make the miss look like a missing file in the
// repo — which is exactly how this used to fail on CI.
const RECORDING = process.env.APPDATA
  ? join(process.env.APPDATA, 'dota-overlay', 'recorded.jsonl')
  : null

interface Frame {
  map?: { clock_time?: number; matchid?: string }
  player?: { team_name?: string }
  minimap?: Record<string, unknown>
}

function loadFrames(path: string): Frame[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Frame]
      } catch {
        // Last line truncated when the recording was interrupted.
        return []
      }
    })
    .filter((frame) => frame.minimap && frame.player?.team_name)
}

/** Runs the whole recording through the tracker, as the server would. */
function replay(frames: Frame[]) {
  let tracked: TrackedHero[] = []
  const everSeen = new Set<string>()
  let ghostFrames = 0
  let visibleFrames = 0
  let maxSimultaneous = 0

  for (const frame of frames) {
    const clock = frame.map?.clock_time ?? 0
    const enemyTeam = enemyTeamOf(frame.player?.team_name)
    const seen = extractEnemyHeroes(frame.minimap, enemyTeam)

    tracked = trackEnemies(tracked, seen, clock)

    for (const hero of tracked) {
      everSeen.add(hero.unitname)
      if (hero.visible) visibleFrames++
      else ghostFrames++
    }
    maxSimultaneous = Math.max(maxSimultaneous, tracked.length)
  }

  return { tracked, everSeen, ghostFrames, visibleFrames, maxSimultaneous }
}

const maybe = RECORDING && existsSync(RECORDING) ? describe : describe.skip

maybe('replay against a real recording', () => {
  // `describe.skip` still runs this callback — that is how the suite gets
  // collected before being marked skipped. So the read has to be guarded here
  // too, not just by picking `describe.skip` above.
  const frames = RECORDING && existsSync(RECORDING) ? loadFrames(RECORDING) : []

  it('the recording has usable frames', () => {
    expect(frames.length).toBeGreaterThan(0)
  })

  it('finds actual enemy heroes', () => {
    const { everSeen } = replay(frames)

    expect(everSeen.size).toBeGreaterThan(0)
    for (const name of everSeen) expect(name).toMatch(/^npc_dota_hero_/)
  })

  it('never tracks more than five enemies', () => {
    // More than five would mean we are picking up allies or creeps by mistake.
    expect(replay(frames).maxSimultaneous).toBeLessThanOrEqual(5)
  })

  it('produces ghosts — enemies leave your vision constantly', () => {
    const { ghostFrames, visibleFrames } = replay(frames)

    expect(visibleFrames).toBeGreaterThan(0)
    // This is the behaviour that justifies the feature: Valve cuts by fog and
    // we remember the last position.
    expect(ghostFrames).toBeGreaterThan(0)
  })

  it('keeps every position inside the map', () => {
    for (const hero of replay(frames).tracked) {
      expect(Math.abs(hero.x)).toBeLessThanOrEqual(MAP_BOUND)
      expect(Math.abs(hero.y)).toBeLessThanOrEqual(MAP_BOUND)
    }
  })

  it('never includes a hero from your own team', () => {
    const myTeam = frames[0]?.player?.team_name
    const allies = new Set<string>()

    for (const frame of frames) {
      for (const element of Object.values(frame.minimap ?? {})) {
        const unit = element as Record<string, unknown>
        if (typeof unit?.unitname !== 'string') continue
        if (!unit.unitname.startsWith('npc_dota_hero_')) continue
        if (unit.team === (myTeam === 'radiant' ? 2 : 3)) allies.add(unit.unitname)
      }
    }

    const { everSeen } = replay(frames)
    for (const ally of allies) expect(everSeen.has(ally)).toBe(false)
  })
})
