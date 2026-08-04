/**
 * Server that receives Dota 2's POSTs.
 *
 * The game sends a payload roughly every 100ms. The UI does not need all of
 * that, so we throttle before crossing IPC.
 */

import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'
import { EventEmitter } from 'node:events'
import { appendFileSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import type { DotaGameState, GsiPayload, OverlayState } from '@shared/gsi-types'
import { EMPTY_OVERLAY_STATE } from '@shared/gsi-types'
import { enemyTeamOf, extractEnemyHeroes, trackEnemies, type TrackedHero } from '@shared/minimap'

/** Dota sends far faster than the UI needs to repaint. */
const EMIT_INTERVAL_MS = 250

/** No payload for longer than this and we consider the game disconnected. */
const DISCONNECT_AFTER_MS = 35_000

const IN_MATCH_STATES: ReadonlySet<DotaGameState> = new Set<DotaGameState>([
  'DOTA_GAMERULES_STATE_PRE_GAME',
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
])

function tokensMatch(received: string | undefined, expected: string): boolean {
  if (!received) return false
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function toOverlayState(
  payload: GsiPayload,
  receivedAt: number,
  previousEnemies: TrackedHero[] = []
): OverlayState {
  const map = payload.map
  const clockTime = map?.clock_time ?? 0

  const enemyTeam = enemyTeamOf(payload.player?.team_name)
  const seen = extractEnemyHeroes(payload.minimap, enemyTeam)

  const hero = payload.hero

  return {
    connected: true,
    inMatch: map ? IN_MATCH_STATES.has(map.game_state) : false,
    matchId: map?.matchid ?? null,
    clockTime,
    gameState: map?.game_state ?? null,
    daytime: map?.daytime ?? true,
    paused: map?.paused ?? false,
    receivedAt,
    enemies: trackEnemies(previousEnemies, seen, clockTime),
    self:
      hero && typeof hero.xpos === 'number' && typeof hero.ypos === 'number'
        ? { x: hero.xpos, y: hero.ypos }
        : null
  }
}

export interface GsiServerOptions {
  /** Fixed port, or 0 to let the OS pick one (used by the tests). */
  port: number
  token: string
  /** Path to a .jsonl for recording raw payloads (diagnostics). */
  recordTo?: string | null
}

export declare interface GsiServer {
  on(event: 'state', listener: (state: OverlayState) => void): this
  on(event: 'error', listener: (error: Error) => void): this
}

export class GsiServer extends EventEmitter {
  private server: Server | null = null
  /** Open connections, so stop() can actually shut things down. */
  private sockets = new Set<Socket>()
  private lastEmit = 0
  private pending: OverlayState | null = null
  private flushTimer: NodeJS.Timeout | null = null
  private watchdog: NodeJS.Timeout | null = null
  private lastPayloadAt = 0
  private connected = false
  private recordTo: string | null
  /** Enemy ghosts, accumulated across payloads. */
  private enemies: TrackedHero[] = []
  private matchId: string | null = null

  constructor(private readonly options: GsiServerOptions) {
    super()
    this.recordTo = options.recordTo ?? null
  }

  /** Turns raw payload recording on/off without restarting the server. */
  setRecording(path: string | null): void {
    this.recordTo = path
  }

  /** Resolves with the port it ended up listening on. */
  start(): Promise<number> {
    this.server = createServer((req, res) => {
      if (req.method !== 'POST' || !req.url?.startsWith('/gsi')) {
        res.writeHead(404).end()
        return
      }

      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => {
        body += chunk
        // A GSI payload never comes close to this; cuts off abuse attempts.
        if (body.length > 2_000_000) req.destroy()
      })

      req.on('end', () => {
        // Answer immediately: Dota has a short timeout and gives up if we stall.
        res.writeHead(200).end()

        let payload: GsiPayload
        try {
          payload = JSON.parse(body) as GsiPayload
        } catch {
          return
        }

        if (!tokensMatch(payload.auth?.token, this.options.token)) return

        if (this.recordTo) {
          try {
            appendFileSync(this.recordTo, `${JSON.stringify(payload)}\n`)
          } catch {
            // Recording is a development convenience, never critical.
          }
        }

        this.lastPayloadAt = Date.now()
        this.connected = true

        const matchId = payload.map?.matchid ?? null
        if (matchId !== this.matchId) {
          this.matchId = matchId
          this.enemies = []
        }

        // Tracking runs on EVERY payload, before the throttle: an enemy who
        // flashes into vision for an instant must not be lost to a dropped frame.
        const state = toOverlayState(payload, this.lastPayloadAt, this.enemies)
        this.enemies = state.enemies

        this.push(state)
      })
    })

    this.server.on('error', (err) => this.emit('error', err))

    this.server.on('connection', (socket) => {
      this.sockets.add(socket)
      socket.on('close', () => this.sockets.delete(socket))
    })

    this.watchdog = setInterval(() => {
      if (!this.connected) return
      if (Date.now() - this.lastPayloadAt > DISCONNECT_AFTER_MS) {
        this.connected = false
        this.enemies = []
        this.matchId = null
        this.emit('state', { ...EMPTY_OVERLAY_STATE })
      }
    }, 5_000)

    return new Promise((resolve) => {
      // Loopback only. Never 0.0.0.0 — this must not leave the machine.
      this.server!.listen(this.options.port, '127.0.0.1', () => {
        const address = this.server!.address()
        resolve(typeof address === 'object' && address ? address.port : this.options.port)
      })
    })
  }

  /** Emits at most every EMIT_INTERVAL_MS, without losing the latest state. */
  private push(state: OverlayState): void {
    const now = Date.now()
    const elapsed = now - this.lastEmit

    if (elapsed >= EMIT_INTERVAL_MS) {
      this.lastEmit = now
      this.pending = null
      this.emit('state', state)
      return
    }

    this.pending = state
    if (this.flushTimer) return

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      if (!this.pending) return
      this.lastEmit = Date.now()
      const next = this.pending
      this.pending = null
      this.emit('state', next)
    }, EMIT_INTERVAL_MS - elapsed)
  }

  stop(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer)
    if (this.watchdog) clearInterval(this.watchdog)

    this.server?.close()
    // close() only stops accepting new connections; without this, Dota's
    // keep-alive sockets hold the process open and the app never quits.
    for (const socket of this.sockets) socket.destroy()
    this.sockets.clear()

    this.server = null
  }
}
