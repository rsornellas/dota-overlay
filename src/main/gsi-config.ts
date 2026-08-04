/**
 * Installing the Game State Integration config file.
 *
 * This is what makes Dota start POSTing to our local server. An official Valve
 * feature: nothing is injected into the game.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findDota, type DotaPaths } from './dota-path'

const CFG_FILENAME = 'gamestate_integration_overlay.cfg'

/**
 * We request EVERY block, including ones that probably only exist for
 * spectators (`events`, `couriers`, `roshan`). Blocks Valve does not expose to
 * a player simply never arrive — asking costs nothing and grants nothing.
 *
 * This is how we answered, empirically, a question the docs do not: does
 * `minimap` arrive during a normal match? (It does, filtered by your vision.)
 * Turn on recording from the tray menu and run `npm run inspect` to check.
 */
export function buildCfg(port: number, token: string): string {
  return `"dota-overlay"
{
    "uri"        "http://localhost:${port}/gsi"
    "timeout"    "5.0"
    "buffer"     "0.1"
    "throttle"   "0.1"
    "heartbeat"  "30.0"
    "data"
    {
        "provider"      "1"
        "map"           "1"
        "player"        "1"
        "hero"          "1"
        "abilities"     "1"
        "items"         "1"
        "buildings"     "1"
        "draft"         "1"
        "wearables"     "1"
        "minimap"       "1"
        "events"        "1"
        "couriers"      "1"
        "neutralitems"  "1"
        "roshan"        "1"
    }
    "auth"
    {
        "token"  "${token}"
    }
}
`
}

export type CfgResult =
  | { status: 'created' | 'updated' | 'unchanged'; path: string; contents: string }
  | { status: 'no-dota'; contents: string }
  | { status: 'error'; path: string; contents: string; error: string }

export interface SetupStatus {
  dotaRoot: string | null
  cfgStatus: CfgResult['status']
  cfgPath: string | null
  /** The cfg contents, so the user can paste it by hand if writing fails. */
  cfgContents: string
  error: string | null
  port: number
}

/**
 * Writes the cfg. Idempotent: if the contents are already correct, the disk is
 * left alone.
 *
 * If writing fails on permissions we do NOT try to elevate — we hand back the
 * contents for the user to paste manually.
 */
export function installCfg(paths: DotaPaths, port: number, token: string): CfgResult {
  const contents = buildCfg(port, token)
  const target = join(paths.gsiDir, CFG_FILENAME)

  try {
    if (existsSync(target) && readFileSync(target, 'utf8') === contents) {
      return { status: 'unchanged', path: target, contents }
    }

    const existed = existsSync(target)
    mkdirSync(paths.gsiDir, { recursive: true })
    writeFileSync(target, contents, 'utf8')

    return { status: existed ? 'updated' : 'created', path: target, contents }
  } catch (err) {
    return {
      status: 'error',
      path: target,
      contents,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export function setupGsi(port: number, token: string, override: string | null): SetupStatus {
  const paths = findDota(override)

  if (!paths) {
    return {
      dotaRoot: null,
      cfgStatus: 'no-dota',
      cfgPath: null,
      cfgContents: buildCfg(port, token),
      error: 'Dota 2 installation not found.',
      port
    }
  }

  const result = installCfg(paths, port, token)

  return {
    dotaRoot: paths.root,
    cfgStatus: result.status,
    cfgPath: 'path' in result ? result.path : null,
    cfgContents: result.contents,
    error: result.status === 'error' ? result.error : null,
    port
  }
}
