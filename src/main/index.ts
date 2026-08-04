import { join } from 'node:path'
import { rmSync } from 'node:fs'
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray
} from 'electron'
import {
  EMPTY_MANUAL_STATE,
  EMPTY_OVERLAY_STATE,
  type ManualMark,
  type ManualState,
  type OverlayState
} from '@shared/gsi-types'
import { IPC } from '@shared/ipc'
import { manualForMatch } from '@shared/schedule'
import { clampWidget, WIDGET_IDS, WIDGET_LABELS, type WidgetId } from '@shared/widgets'
import { GsiServer } from './gsi-server'
import { setupGsi, type SetupStatus } from './gsi-config'
import { createOverlayWindow, moveToDisplay, setEditMode, targetDisplay } from './overlay-window'
import {
  loadManualState,
  loadSettings,
  recordingPath,
  saveManualState,
  saveSettings,
  takeLoadError,
  type Settings
} from './store'

// Escape hatch: on some machines hardware acceleration fights with
// click-through on transparent windows. See the README troubleshooting section.
if (process.env['DOTA_OVERLAY_NO_HWACCEL'] === '1') {
  app.disableHardwareAcceleration()
}

let overlay: BrowserWindow | null = null
let tray: Tray | null = null
let server: GsiServer | null = null

let settings: Settings
let setup: SetupStatus
let state: OverlayState = EMPTY_OVERLAY_STATE
let manual: ManualState = EMPTY_MANUAL_STATE
let editing = false
let hidden = false
let suspended = false

function send(channel: string, payload: unknown): void {
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(channel, payload)
}

function pushSettings(): void {
  send(IPC.settings, settings)
  refreshTrayMenu()
}

function setManual(next: ManualState): void {
  manual = next
  saveManualState(manual)
  send(IPC.manual, manual)
}

/** Marks an event at the current match clock. Outside a match, does nothing. */
function mark(kind: ManualMark): void {
  if (!state.connected || !state.inMatch) return

  const at = Math.round(state.clockTime)
  const base = manualForMatch(manual, state.matchId)

  setManual({
    ...base,
    ...(kind === 'roshan' ? { roshanKilledAt: at } : {}),
    ...(kind === 'aegis' ? { aegisPickedAt: at } : {}),
    ...(kind === 'tormentor' ? { tormentorKilledAt: at } : {})
  })
}

function toggleEdit(force?: boolean): void {
  if (!overlay) return
  editing = setEditMode(overlay, force ?? !editing)
  send(IPC.reposition, editing)
  refreshTrayMenu()
}

/**
 * Hides the PANELS, not the window.
 *
 * The window has to stay alive for visual alerts to show — that is their whole
 * point: play with a clean screen and still be reminded to pull the lane.
 * Since the transparent window is click-through, keeping it open costs
 * nothing. To make it vanish entirely, use the tray's "Quit".
 */
function toggleHidden(force?: boolean): void {
  if (!overlay) return
  hidden = force ?? !hidden

  if (hidden && editing) toggleEdit(false)

  // Reassert: another window may have stolen the top spot meanwhile.
  overlay.setAlwaysOnTop(true, 'screen-saver')

  send(IPC.hidden, hidden)
  refreshTrayMenu()
}

/**
 * Hides the entire WINDOW — the emergency exit.
 *
 * If click-through fails on this machine, a fullscreen window would swallow
 * every click and even the tray would be out of reach. Hence a global
 * shortcut, which works even with the screen blocked by us.
 */
function toggleSuspended(force?: boolean): void {
  if (!overlay) return
  suspended = force ?? !suspended

  if (suspended) {
    if (editing) toggleEdit(false)
    overlay.hide()
  } else {
    overlay.showInactive()
    overlay.setAlwaysOnTop(true, 'screen-saver')
  }
  refreshTrayMenu()
}

function toggleRecording(): void {
  const recording = !settings.recording

  // Start a fresh recording: mixing sessions only muddies the diagnosis. The
  // previous file has either been analysed or no longer matters.
  if (recording) {
    try {
      rmSync(recordingPath(), { force: true })
    } catch {
      // File in use or missing: carry on, the append handles the rest.
    }
  }

  settings = saveSettings({ recording })
  server?.setRecording(recording ? recordingPath() : null)
  pushSettings()
}

function setWidget(id: WidgetId, patch: Partial<{ x: number; y: number; visible: boolean }>): void {
  const bounds = overlay?.getBounds() ?? { width: 1920, height: 1080 }
  const next = clampWidget({ ...settings.widgets[id], ...patch }, bounds)
  settings = saveSettings({ widgets: { ...settings.widgets, [id]: next } })
  pushSettings()
}

function reinstallCfg(): void {
  setup = setupGsi(settings.port, settings.gsiToken, settings.dotaRootOverride)
  send(IPC.setup, setup)
  refreshTrayMenu()
}

function statusLine(): string {
  if (!setup.dotaRoot) return 'Dota 2 not found'
  if (setup.error) return 'Failed to write the cfg'
  if (!state.connected) return 'Waiting for Dota…'
  return state.inMatch ? 'In match' : 'Connected to Dota'
}

function displayMenuItems(): Electron.MenuItemConstructorOptions[] {
  const displays = screen.getAllDisplays()
  if (displays.length < 2) return []

  const current = overlay ? screen.getDisplayMatching(overlay.getBounds()).id : null

  return [
    {
      label: 'Display',
      submenu: displays.map((display, index) => ({
        label: `${index + 1}: ${display.size.width}×${display.size.height}`,
        type: 'radio' as const,
        checked: display.id === current,
        click: () => {
          settings = saveSettings({ displayId: display.id })
          if (overlay) moveToDisplay(overlay, display)
          pushSettings()
        }
      }))
    },
    { type: 'separator' as const }
  ]
}

function refreshTrayMenu(): void {
  if (!tray) return

  const status = statusLine()
  tray.setToolTip(`dota-overlay — ${status}`)

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: status, enabled: false },
      { type: 'separator' },
      {
        label: hidden ? 'Show panels' : 'Hide panels (alerts stay)',
        accelerator: 'Ctrl+Alt+H',
        enabled: !suspended,
        click: () => toggleHidden()
      },
      {
        label: suspended ? 'Resume overlay' : 'Suspend overlay (hide everything)',
        accelerator: 'Ctrl+Alt+Shift+H',
        click: () => toggleSuspended()
      },
      {
        label: editing ? 'Finish editing layout' : 'Edit layout (drag widgets)',
        accelerator: 'Ctrl+Alt+P',
        click: () => toggleEdit()
      },
      {
        label: 'Widgets',
        submenu: WIDGET_IDS.map((id) => ({
          label: WIDGET_LABELS[id],
          type: 'checkbox' as const,
          checked: settings.widgets[id].visible,
          click: (item: Electron.MenuItem) => setWidget(id, { visible: item.checked })
        }))
      },
      ...displayMenuItems(),
      {
        label: 'Voice alerts',
        type: 'checkbox',
        checked: settings.voice.enabled,
        click: (item) => {
          settings = saveSettings({ voice: { ...settings.voice, enabled: item.checked } })
          pushSettings()
        }
      },
      {
        label: 'Visual alerts (pull and runes)',
        type: 'checkbox',
        checked: settings.notify.enabled,
        click: (item) => {
          settings = saveSettings({ notify: { ...settings.notify, enabled: item.checked } })
          pushSettings()
        }
      },
      {
        label: 'Show jungle timers in the panel',
        type: 'checkbox',
        checked: settings.showJungle,
        click: (item) => {
          settings = saveSettings({ showJungle: item.checked })
          pushSettings()
        }
      },
      {
        label: 'Clear marks (Roshan/Aegis)',
        accelerator: 'Ctrl+Alt+X',
        click: () => setManual({ ...EMPTY_MANUAL_STATE, matchId: state.matchId })
      },
      { type: 'separator' },
      {
        label: settings.recording
          ? 'Recording payloads — click to stop'
          : 'Record payloads (diagnostics)',
        type: 'checkbox',
        checked: settings.recording,
        click: toggleRecording
      },
      { label: 'Reinstall the GSI cfg', click: reinstallCfg },
      { label: 'Open data folder', click: () => void shell.openPath(app.getPath('userData')) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
}

function registerShortcuts(): string[] {
  const bindings: Array<[string, () => void]> = [
    ['Ctrl+Alt+R', () => mark('roshan')],
    ['Ctrl+Alt+A', () => mark('aegis')],
    ['Ctrl+Alt+T', () => mark('tormentor')],
    ['Ctrl+Alt+X', () => setManual({ ...EMPTY_MANUAL_STATE, matchId: state.matchId })],
    ['Ctrl+Alt+P', () => toggleEdit()],
    ['Ctrl+Alt+H', () => toggleHidden()],
    ['Ctrl+Alt+Shift+H', () => toggleSuspended()]
  ]

  // A shortcut already taken by another app fails silently in Electron; we
  // return the ones that failed so the UI can warn about them.
  return bindings
    .filter(([accel, handler]) => !globalShortcut.register(accel, handler))
    .map(([accel]) => accel)
}

function startServer(): void {
  server = new GsiServer({
    port: settings.port,
    token: settings.gsiToken,
    recordTo: settings.recording ? recordingPath() : null
  })

  server.on('state', (next) => {
    // Different match? The previous marks are worthless now.
    const reconciled = manualForMatch(manual, next.matchId)
    if (reconciled !== manual) setManual(reconciled)

    const wasConnected = state.connected
    const wasInMatch = state.inMatch
    state = next
    send(IPC.state, state)

    if (wasConnected !== state.connected || wasInMatch !== state.inMatch) refreshTrayMenu()
  })

  server.on('error', (err) => {
    setup = { ...setup, error: `Could not open port ${settings.port}: ${err.message}` }
    send(IPC.setup, setup)
    refreshTrayMenu()
  })

  // The port is fixed (the cfg already points at it); if it is taken, the
  // 'error' event above tells the user.
  void server.start()
}

// A second instance would steal the port and the cfg would point at the wrong one.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => overlay?.showInactive())

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.rafael.dota-overlay')

    // Default widget positions depend on screen size, so the display has to be
    // picked before settings are loaded.
    const bootDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    settings = loadSettings(bootDisplay.bounds)

    manual = loadManualState()
    setup = setupGsi(settings.port, settings.gsiToken, settings.dotaRootOverride)

    startServer()
    overlay = createOverlayWindow(targetDisplay(settings.displayId))

    const warnings = [setup.error, takeLoadError()]

    const failedShortcuts = registerShortcuts()
    if (failedShortcuts.length > 0) {
      warnings.push(`Shortcuts already in use by another app: ${failedShortcuts.join(', ')}.`)
    }

    const combined = warnings.filter(Boolean).join(' ')
    if (combined) setup = { ...setup, error: combined }

    // When packaged the icon is an extraResource; in dev it sits in build/.
    // Reading from inside app.asar is unreliable, hence the distinction.
    const trayIcon = app.isPackaged
      ? join(process.resourcesPath, 'tray.png')
      : join(app.getAppPath(), 'build', 'tray.png')

    tray = new Tray(nativeImage.createFromPath(trayIcon))
    tray.on('double-click', () => toggleEdit())
    refreshTrayMenu()

    ipcMain.on(IPC.ready, () => {
      send(IPC.setup, setup)
      send(IPC.settings, settings)
      send(IPC.manual, manual)
      send(IPC.state, state)
      send(IPC.reposition, editing)
      send(IPC.hidden, hidden)
    })

    ipcMain.on(IPC.moveWidget, (_event, id: WidgetId, x: number, y: number) => {
      setWidget(id, { x, y })
    })

    // Emergency exit: in edit mode the window covers the whole screen and eats
    // clicks, so Esc has to work.
    ipcMain.on(IPC.exitEdit, () => toggleEdit(false))
  })
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  server?.stop()
})

// The overlay lives in the tray: closing windows does not quit the app.
app.on('window-all-closed', () => {})
