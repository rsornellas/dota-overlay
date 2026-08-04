import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OverlayState } from '@shared/gsi-types'
import { GsiServer, toOverlayState } from './gsi-server'

const TOKEN = 'test-token'

const payload = (over: Record<string, unknown> = {}) => ({
  provider: { name: 'Dota 2', appid: 570, version: 47, timestamp: 1 },
  map: {
    name: 'start',
    matchid: '7471020497',
    game_time: 690,
    clock_time: 600,
    daytime: true,
    nightstalker_night: false,
    game_state: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
    paused: false,
    win_team: 'none',
    customgamename: ''
  },
  player: { name: 'player', team_name: 'radiant', steamid: '765611980000' },
  auth: { token: TOKEN },
  ...over
})

let server: GsiServer | null = null
let port = 0

/** Port 0: the OS picks a free one, so tests never collide with each other
 *  nor with a real app running on 53000. */
async function start(): Promise<{ states: OverlayState[] }> {
  const states: OverlayState[] = []
  server = new GsiServer({ port: 0, token: TOKEN })
  server.on('state', (s) => states.push(s))
  port = await server.start()
  return { states }
}

const post = (body: unknown) =>
  fetch(`http://127.0.0.1:${port}/gsi`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

afterEach(() => {
  server?.stop()
  server = null
})

describe('toOverlayState', () => {
  it('distils the payload down to what the overlay uses', () => {
    const state = toOverlayState(payload() as never, 1234)
    expect(state).toEqual({
      connected: true,
      inMatch: true,
      matchId: '7471020497',
      clockTime: 600,
      gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      daytime: true,
      paused: false,
      receivedAt: 1234,
      enemies: [],
      self: null
    })
  })

  it('tracks visible enemies and your own position', () => {
    const withMinimap = payload({
      hero: { xpos: 100, ypos: 200, name: 'npc_dota_hero_juggernaut' },
      minimap: {
        o0: { unitname: 'npc_dota_hero_skeleton_king', team: 3, xpos: -1100, ypos: 602 },
        o1: { unitname: 'npc_dota_hero_death_prophet', team: 2, xpos: 0, ypos: 0 }
      }
    })

    const state = toOverlayState(withMinimap as never, 0)

    // Only the enemy makes the list; the ally is always on the player's screen.
    expect(state.enemies).toHaveLength(1)
    expect(state.enemies[0]).toMatchObject({ short: 'SK', x: -1100, y: 602, visible: true })
    expect(state.self).toEqual({ x: 100, y: 200 })
  })

  it('turns an enemy who left the frame into a ghost', () => {
    const previous = [
      {
        unitname: 'npc_dota_hero_skeleton_king',
        short: 'SK',
        x: -1100,
        y: 602,
        lastSeen: 590,
        visible: true
      }
    ]

    const state = toOverlayState(payload() as never, 0, previous)

    expect(state.enemies[0]).toMatchObject({ visible: false, x: -1100, lastSeen: 590 })
  })

  it('treats pre-game as "in match" — the clock already matters', () => {
    const pre = payload({
      map: { ...payload().map, game_state: 'DOTA_GAMERULES_STATE_PRE_GAME', clock_time: -45 }
    })
    expect(toOverlayState(pre as never, 0)).toMatchObject({ inMatch: true, clockTime: -45 })
  })

  it('does not treat hero selection or post-game as a match', () => {
    for (const gameState of [
      'DOTA_GAMERULES_STATE_HERO_SELECTION',
      'DOTA_GAMERULES_STATE_POST_GAME'
    ]) {
      const p = payload({ map: { ...payload().map, game_state: gameState } })
      expect(toOverlayState(p as never, 0).inMatch).toBe(false)
    }
  })

  it('survives a payload with no map block', () => {
    expect(toOverlayState({} as never, 7)).toMatchObject({ connected: true, inMatch: false })
  })
})

describe('GsiServer (real HTTP)', () => {
  it('accepts a valid POST and emits the state', async () => {
    const { states } = await start()

    const res = await post(payload())
    expect(res.status).toBe(200)

    await sleep(50)
    expect(states).toHaveLength(1)
    expect(states[0]).toMatchObject({ connected: true, clockTime: 600, matchId: '7471020497' })
  })

  it('ignores a payload with the wrong token, but still answers 200', async () => {
    const { states } = await start()

    // Answer 200 anyway: if we stall or error, Dota gives up.
    const res = await post(payload({ auth: { token: 'wrong' } }))
    expect(res.status).toBe(200)

    await sleep(50)
    expect(states).toHaveLength(0)
  })

  it('ignores a payload with no token at all', async () => {
    const { states } = await start()
    await post(payload({ auth: {} }))
    await sleep(50)
    expect(states).toHaveLength(0)
  })

  it('does not break on malformed JSON', async () => {
    const { states } = await start()

    const res = await post('{ this is not json')
    expect(res.status).toBe(200)

    await sleep(50)
    expect(states).toHaveLength(0)

    // And it keeps working afterwards.
    await post(payload())
    await sleep(50)
    expect(states).toHaveLength(1)
  })

  it('returns 404 for anything that is not POST /gsi', async () => {
    await start()
    const get = await fetch(`http://127.0.0.1:${port}/gsi`)
    const wrongPath = await fetch(`http://127.0.0.1:${port}/other`, { method: 'POST' })

    expect(get.status).toBe(404)
    expect(wrongPath.status).toBe(404)
  })

  it('throttles bursts without losing the latest state', async () => {
    const { states } = await start()

    // Dota sends every ~100ms; the UI does not need all of it.
    for (const clock of [600, 601, 602, 603, 604]) {
      await post(payload({ map: { ...payload().map, clock_time: clock } }))
    }

    await sleep(400)

    expect(states.length).toBeLessThan(5)
    // What matters is that the final state is not lost.
    expect(states.at(-1)?.clockTime).toBe(604)
  })

  it('emits a disconnected state when Dota goes away', async () => {
    // Fake timers must exist BEFORE start(), otherwise the watchdog's
    // setInterval is born on real timers and advanceTimersByTime misses it.
    vi.useFakeTimers()
    try {
      const { states } = await start()

      await post(payload())
      await vi.advanceTimersByTimeAsync(300)
      expect(states.at(-1)).toMatchObject({ connected: true })

      // Dota closed: push past the heartbeat limit with no new payload.
      await vi.advanceTimersByTimeAsync(40_000)

      expect(states.at(-1)).toMatchObject({ connected: false, inMatch: false })
    } finally {
      vi.useRealTimers()
    }
  })
})
