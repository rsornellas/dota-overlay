import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Set before each test; the electron mock points here. */
let dataDir = ''

vi.mock('electron', () => ({
  app: { getPath: () => dataDir }
}))

const BOUNDS = { width: 1920, height: 1080 }

/** The store caches settings in a module, so each test needs a fresh instance. */
async function freshStore() {
  vi.resetModules()
  return import('./store')
}

const configPath = () => join(dataDir, 'config.json')

const writeConfig = (text: string) => writeFileSync(configPath(), text, 'utf8')

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'dota-overlay-test-'))
})

describe('loadSettings', () => {
  it('generates a token and writes the file on first run', async () => {
    const { loadSettings } = await freshStore()
    const settings = loadSettings(BOUNDS)

    expect(settings.gsiToken).toMatch(/^[a-f0-9]{32}$/)
    expect(existsSync(configPath())).toBe(true)
  })

  it('writes new keys even when the file already existed', async () => {
    // Config from an old version, without voice or widgets.
    writeConfig(JSON.stringify({ gsiToken: 'abc', port: 53000 }))

    const { loadSettings } = await freshStore()
    loadSettings(BOUNDS)

    // Without this, the README would tell users to edit a key that is not in
    // the file.
    const saved = JSON.parse(readFileSync(configPath(), 'utf8'))
    expect(saved.voice.cues.stack.enabled).toBe(true)
    expect(saved.widgets.clock).toBeDefined()
    expect(saved.gsiToken).toBe('abc')
  })

  it('preserves customisations and fills in what is missing', async () => {
    const { CONFIG_VERSION } = await import('./store')
    writeConfig(
      JSON.stringify({
        configVersion: CONFIG_VERSION,
        gsiToken: 'abc',
        voice: { cues: { bounty: { enabled: false, phrase: 'my callout', lead: 42 } } }
      })
    )

    const { loadSettings } = await freshStore()
    const settings = loadSettings(BOUNDS)

    expect(settings.voice.cues.bounty).toEqual({
      enabled: false,
      phrase: 'my callout',
      lead: 42
    })
    // Cues the user never touched keep the default.
    expect(settings.voice.cues.stack.enabled).toBe(true)
    expect(settings.voice.enabled).toBe(true)
  })

  it('delivers new alert defaults to an existing config', async () => {
    // The real problem: the file stores EVERY cue, so a new default (enabling
    // lotus, say) would never land — the stored value would win.
    writeConfig(
      JSON.stringify({
        configVersion: 1,
        gsiToken: 'preserved',
        showJungle: true,
        widgets: { clock: { x: 42, y: 43, visible: false } },
        voice: { enabled: false, cues: { lotus: { enabled: false, phrase: 'old', lead: 1 } } }
      })
    )

    const { loadSettings } = await freshStore()
    const settings = loadSettings(BOUNDS)

    // Alerts reset to the new version's defaults...
    expect(settings.voice.cues.lotus.enabled).toBe(true)
    expect(settings.voice.cues.lotus.phrase).toBe('Lotus')

    // ...but nothing else is lost.
    expect(settings.gsiToken).toBe('preserved')
    expect(settings.showJungle).toBe(true)
    expect(settings.widgets.clock).toEqual({ x: 42, y: 43, visible: false })
    expect(settings.voice.enabled).toBe(false)
  })

  it('stamps the current version when saving', async () => {
    const { CONFIG_VERSION, loadSettings } = await freshStore()
    loadSettings(BOUNDS)

    const saved = JSON.parse(readFileSync(configPath(), 'utf8'))
    expect(saved.configVersion).toBe(CONFIG_VERSION)
  })

  it('reads a file saved with a BOM by Notepad', async () => {
    // The README invites hand-editing config.json, and Windows Notepad writes
    // a BOM. Without handling it, the user would lose everything on save.
    writeConfig(`﻿${JSON.stringify({ gsiToken: 'preserved', showJungle: true })}`)

    const { loadSettings, takeLoadError } = await freshStore()
    const settings = loadSettings(BOUNDS)

    expect(settings.gsiToken).toBe('preserved')
    expect(settings.showJungle).toBe(true)
    expect(takeLoadError()).toBeNull()
  })

  it('keeps the original and warns when the file is corrupt', async () => {
    writeConfig('{ this is not json')

    const { loadSettings, takeLoadError } = await freshStore()
    const settings = loadSettings(BOUNDS)

    // Nothing is discarded silently.
    expect(existsSync(`${configPath()}.broken`)).toBe(true)
    expect(takeLoadError()).toMatch(/unreadable/)
    // And the app stays usable, on defaults.
    expect(settings.gsiToken).toMatch(/^[a-f0-9]{32}$/)
  })

  it('reports the error only once', async () => {
    writeConfig('{{{')

    const { loadSettings, takeLoadError } = await freshStore()
    loadSettings(BOUNDS)

    expect(takeLoadError()).not.toBeNull()
    expect(takeLoadError()).toBeNull()
  })
})

describe('saveSettings', () => {
  it('merges partially and persists', async () => {
    const { loadSettings, saveSettings } = await freshStore()
    const initial = loadSettings(BOUNDS)

    const updated = saveSettings({ showJungle: true })

    expect(updated.showJungle).toBe(true)
    expect(updated.gsiToken).toBe(initial.gsiToken)

    const saved = JSON.parse(readFileSync(configPath(), 'utf8'))
    expect(saved.showJungle).toBe(true)
  })

  it('merges widgets without wiping the untouched ones', async () => {
    const { loadSettings, saveSettings } = await freshStore()
    const initial = loadSettings(BOUNDS)

    const updated = saveSettings({
      widgets: { ...initial.widgets, clock: { x: 10, y: 20, visible: true } }
    })

    expect(updated.widgets.clock).toEqual({ x: 10, y: 20, visible: true })
    expect(updated.widgets.timers).toEqual(initial.widgets.timers)
  })

  it('refuses to save before loading', async () => {
    const { saveSettings } = await freshStore()
    expect(() => saveSettings({ showJungle: true })).toThrow(/loadSettings/)
  })
})

describe('manual state', () => {
  it('returns defaults when no session was saved', async () => {
    const { loadManualState } = await freshStore()
    expect(loadManualState()).toEqual({
      matchId: null,
      roshanKilledAt: null,
      aegisPickedAt: null,
      tormentorKilledAt: null
    })
  })

  it('survives the app closing mid-match', async () => {
    const { saveManualState } = await freshStore()
    saveManualState({
      matchId: '123',
      roshanKilledAt: 600,
      aegisPickedAt: null,
      tormentorKilledAt: null
    })

    // Reopening the app means loading everything from scratch.
    const { loadManualState } = await freshStore()
    expect(loadManualState()).toMatchObject({ matchId: '123', roshanKilledAt: 600 })
  })
})
