/**
 * Types for the payload Dota 2 sends through Game State Integration.
 *
 * IMPORTANT: while you are PLAYING, Dota only sends your own hero's data and
 * what your vision already covers. Blocks with every player's data exist only
 * in spectator/observer mode. That is a deliberate Valve restriction — and it
 * is what makes this approach legitimate.
 */

import type { TrackedHero } from './minimap'

export type DotaGameState =
  | 'DOTA_GAMERULES_STATE_INIT'
  | 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD'
  | 'DOTA_GAMERULES_STATE_HERO_SELECTION'
  | 'DOTA_GAMERULES_STATE_STRATEGY_TIME'
  | 'DOTA_GAMERULES_STATE_TEAM_SHOWCASE'
  | 'DOTA_GAMERULES_STATE_WAIT_FOR_MAP_TO_LOAD'
  | 'DOTA_GAMERULES_STATE_PRE_GAME'
  | 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS'
  | 'DOTA_GAMERULES_STATE_POST_GAME'
  | 'DOTA_GAMERULES_STATE_DISCONNECT'

export interface GsiProvider {
  name: string
  appid: number
  version: number
  timestamp: number
}

export interface GsiMap {
  name: string
  matchid: string
  /** Time since the map loaded, includes pre-game. */
  game_time: number
  /** The clock shown on the HUD. Negative during pre-game. This is what we use. */
  clock_time: number
  daytime: boolean
  nightstalker_night: boolean
  game_state: DotaGameState
  paused: boolean
  win_team: string
  customgamename: string
  radiant_score?: number
  dire_score?: number
  ward_purchase_cooldown?: number
}

export interface GsiPlayer {
  steamid: string
  name: string
  activity: string
  kills: number
  deaths: number
  assists: number
  last_hits: number
  denies: number
  kill_streak: number
  team_name: string
  gold: number
  gold_reliable: number
  gold_unreliable: number
  gpm: number
  xpm: number
}

export interface GsiHero {
  xpos: number
  ypos: number
  id: number
  name: string
  level: number
  alive: boolean
  respawn_seconds: number
  buyback_cost: number
  buyback_cooldown: number
  health: number
  max_health: number
  health_percent: number
  mana: number
  max_mana: number
  mana_percent: number
  silenced: boolean
  stunned: boolean
  disarmed: boolean
  magicimmune: boolean
  hexed: boolean
  muted: boolean
  break: boolean
  smoked?: boolean
  has_debuff?: boolean
  aghanims_scepter?: boolean
  aghanims_shard?: boolean
}

/** Raw payload. Every block is optional: it depends on the cfg and the state. */
export interface GsiPayload {
  provider?: GsiProvider
  map?: GsiMap
  player?: GsiPlayer
  hero?: GsiHero
  abilities?: Record<string, unknown>
  items?: Record<string, unknown>
  buildings?: Record<string, unknown>
  draft?: Record<string, unknown>
  /**
   * Units on the minimap — ALREADY filtered by your vision by Valve itself.
   * See the explanation in shared/minimap.ts.
   */
  minimap?: Record<string, unknown>
  auth?: { token?: string }
}

/**
 * Distilled state that the main process sends to the renderer.
 * Only what the overlay needs — the raw payload never crosses IPC.
 */
export interface OverlayState {
  /** Have we received a POST from Dota recently? */
  connected: boolean
  /** Are we in a match with the clock running (or in pre-game)? */
  inMatch: boolean
  matchId: string | null
  /** map.clock_time. Negative during pre-game. */
  clockTime: number
  gameState: DotaGameState | null
  daytime: boolean
  paused: boolean
  /** Epoch ms of the last payload, used to interpolate the clock in the UI. */
  receivedAt: number
  /** Enemy heroes spotted, with their last known position. */
  enemies: TrackedHero[]
  /** Your own position, to orient reading the minimap. */
  self: { x: number; y: number } | null
}

export const EMPTY_OVERLAY_STATE: OverlayState = {
  connected: false,
  inMatch: false,
  matchId: null,
  clockTime: 0,
  gameState: null,
  daytime: true,
  paused: false,
  receivedAt: 0,
  enemies: [],
  self: null
}

/**
 * Marks the player makes with a keyboard shortcut.
 * GSI in player mode does NOT report Roshan's state, so this is manual —
 * exactly like a player noting it in team chat.
 */
export interface ManualState {
  /** The matchid these marks belong to; discarded when the match changes. */
  matchId: string | null
  /** clock_time when Roshan was killed. */
  roshanKilledAt: number | null
  /** clock_time when the Aegis was picked up. */
  aegisPickedAt: number | null
  /** clock_time when the Tormentor was killed. */
  tormentorKilledAt: number | null
}

export type ManualMark = 'roshan' | 'aegis' | 'tormentor'

export const EMPTY_MANUAL_STATE: ManualState = {
  matchId: null,
  roshanKilledAt: null,
  aegisPickedAt: null,
  tormentorKilledAt: null
}
