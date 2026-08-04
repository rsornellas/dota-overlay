/**
 * Locating the Dota 2 installation.
 *
 * No hardcoded paths: Steam can live anywhere and the game can sit in any
 * library, including one on another drive.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseVdf, type VdfNode } from './vdf'

export interface DotaPaths {
  /** .../steamapps/common/dota 2 beta */
  root: string
  /** .../game/dota/cfg */
  cfgDir: string
  /** .../game/dota/cfg/gamestate_integration */
  gsiDir: string
}

const FALLBACK_STEAM_DIRS = [
  'C:\\Program Files (x86)\\Steam',
  'C:\\Program Files\\Steam',
  'C:\\Steam'
]

/** Reads SteamPath from the user's registry hive. */
function steamPathFromRegistry(): string | null {
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { encoding: 'utf8', windowsHide: true }
    )
    // Shape: "    SteamPath    REG_SZ    c:/program files (x86)/steam"
    const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/i)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

export function findSteamRoot(): string | null {
  const fromRegistry = steamPathFromRegistry()
  if (fromRegistry && existsSync(fromRegistry)) return fromRegistry

  return FALLBACK_STEAM_DIRS.find((dir) => existsSync(dir)) ?? null
}

/** Every Steam library, including those on other drives. */
export function findSteamLibraries(steamRoot: string): string[] {
  const libraries = new Set<string>([steamRoot])
  const manifest = join(steamRoot, 'steamapps', 'libraryfolders.vdf')

  if (!existsSync(manifest)) return [...libraries]

  try {
    const parsed = parseVdf(readFileSync(manifest, 'utf8'))
    const root = (parsed['libraryfolders'] ?? parsed['LibraryFolders']) as VdfNode | undefined
    if (!root) return [...libraries]

    for (const entry of Object.values(root)) {
      if (typeof entry === 'string') {
        // Legacy shape: "1" "D:\\SteamLibrary"
        libraries.add(entry)
      } else if (typeof entry['path'] === 'string') {
        libraries.add(entry['path'])
      }
    }
  } catch {
    // A corrupt manifest must not take the app down; carry on with what we have.
  }

  return [...libraries]
}

function pathsFromRoot(root: string): DotaPaths {
  const cfgDir = join(root, 'game', 'dota', 'cfg')
  return { root, cfgDir, gsiDir: join(cfgDir, 'gamestate_integration') }
}

/**
 * Locates Dota 2. `override` comes from settings, for installations in
 * unconventional places.
 */
export function findDota(override?: string | null): DotaPaths | null {
  if (override) {
    const paths = pathsFromRoot(override)
    return existsSync(paths.cfgDir) ? paths : null
  }

  const steamRoot = findSteamRoot()
  if (!steamRoot) return null

  for (const library of findSteamLibraries(steamRoot)) {
    const paths = pathsFromRoot(join(library, 'steamapps', 'common', 'dota 2 beta'))
    if (existsSync(paths.cfgDir)) return paths
  }

  return null
}
