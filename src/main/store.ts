/**
 * Persisting settings and the match's manual state.
 *
 * Lives in `%APPDATA%\dota-overlay\`, outside the install folder — which is why
 * your settings survive reinstalling or updating the app.
 *
 * Manual state is stored separately from settings because it has a different
 * lifecycle: if the overlay dies mid-match, we want the Roshan timer back when
 * it reopens.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { EMPTY_MANUAL_STATE, type ManualState } from '@shared/gsi-types'
import { DEFAULT_VOICE, type VoiceSettings } from '@shared/voice'
import { DEFAULT_NOTIFY, type NotifySettings } from '@shared/notify'
import { defaultWidgets, type WidgetId, type WidgetState } from '@shared/widgets'

/**
 * Bump this whenever the alert defaults change (enabling a new cue, fixing a
 * phrase). Without it, anyone with a saved config would never get the change:
 * the file stores every cue, and a stored value beats a default.
 *
 * On a bump, voice and visual cues reset to defaults. Widget positions, token,
 * opacity and display are preserved.
 */
export const CONFIG_VERSION = 3

export interface Settings {
  configVersion: number
  /** Token Dota echoes back in every POST. Generated on first run. */
  gsiToken: string
  port: number
  dotaRootOverride: string | null
  /** Which monitor the overlay covers. null = wherever the cursor was at boot. */
  displayId: number | null
  overlay: { opacity: number }
  /** Jungle timers (stack/pull) clutter the panel; hidden by default. */
  showJungle: boolean
  /** Records raw payloads for diagnostics (npm run inspect). */
  recording: boolean
  widgets: Record<WidgetId, WidgetState>
  voice: VoiceSettings
  notify: NotifySettings
}

function defaults(bounds: { width: number; height: number }): Omit<Settings, 'gsiToken'> {
  return {
    configVersion: CONFIG_VERSION,
    port: 53000,
    dotaRootOverride: null,
    displayId: null,
    overlay: { opacity: 0.9 },
    showJungle: false,
    recording: false,
    widgets: defaultWidgets(bounds),
    voice: DEFAULT_VOICE,
    notify: DEFAULT_NOTIFY
  }
}

function dataDir(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** Set when a config file could not be read. */
let loadError: string | null = null

export function takeLoadError(): string | null {
  const error = loadError
  loadError = null
  return error
}

function readJson<T>(file: string): Partial<T> | null {
  if (!existsSync(file)) return null

  try {
    // Windows Notepad saves a BOM, and JSON.parse chokes on it. Since the
    // README invites hand-editing this file, that is not hypothetical.
    const text = readFileSync(file, 'utf8').replace(/^﻿/, '')
    return JSON.parse(text) as Partial<T>
  } catch (err) {
    // Never discard silently: losing widget positions and the token without a
    // word is worse than any typo. We keep the original and explain.
    const backup = `${file}.broken`
    try {
      renameSync(file, backup)
    } catch {
      // If even renaming fails, carry on with defaults — the app must not die.
    }

    loadError = `${file.split('\\').pop()} was unreadable (${
      err instanceof Error ? err.message.slice(0, 60) : 'error'
    }). The original became ${backup.split('\\').pop()} and defaults were restored.`

    return null
  }
}

function writeJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}

let cached: Settings | null = null

export function loadSettings(bounds: { width: number; height: number }): Settings {
  if (cached) return cached

  const file = join(dataDir(), 'config.json')
  const stored = readJson<Settings>(file)
  const base = defaults(bounds)

  // Config from an older version: alerts reset to defaults so default changes
  // actually land. Every other preference is preserved.
  const outdated = (stored?.configVersion ?? 0) < CONFIG_VERSION

  cached = {
    ...base,
    ...stored,
    configVersion: CONFIG_VERSION,
    overlay: { ...base.overlay, ...stored?.overlay },
    widgets: { ...base.widgets, ...stored?.widgets },
    voice: {
      ...base.voice,
      ...stored?.voice,
      cues: outdated ? base.voice.cues : { ...base.voice.cues, ...stored?.voice?.cues }
    },
    notify: {
      ...base.notify,
      ...stored?.notify,
      cues: outdated ? base.notify.cues : { ...base.notify.cues, ...stored?.notify?.cues }
    },
    gsiToken: stored?.gsiToken ?? randomBytes(16).toString('hex')
  }

  // Always write, not just on first run: this way each version's new keys show
  // up in the file and the user can edit them by hand.
  writeJson(file, cached)
  return cached
}

export function saveSettings(patch: Partial<Settings>): Settings {
  if (!cached) throw new Error('loadSettings() must run before saveSettings()')

  cached = {
    ...cached,
    ...patch,
    overlay: { ...cached.overlay, ...patch.overlay },
    widgets: { ...cached.widgets, ...patch.widgets },
    voice: patch.voice
      ? { ...cached.voice, ...patch.voice, cues: { ...cached.voice.cues, ...patch.voice.cues } }
      : cached.voice,
    notify: patch.notify
      ? { ...cached.notify, ...patch.notify, cues: { ...cached.notify.cues, ...patch.notify.cues } }
      : cached.notify
  }

  writeJson(join(dataDir(), 'config.json'), cached)
  return cached
}

export function loadManualState(): ManualState {
  const stored = readJson<ManualState>(join(dataDir(), 'session.json'))
  return { ...EMPTY_MANUAL_STATE, ...stored }
}

export function saveManualState(state: ManualState): void {
  writeJson(join(dataDir(), 'session.json'), state)
}

export function recordingPath(): string {
  return join(dataDir(), 'recorded.jsonl')
}
