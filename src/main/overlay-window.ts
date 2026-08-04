/**
 * The overlay window: covers a whole monitor, transparent, always on top and
 * click-through.
 *
 * It spans the entire screen because widgets are positioned freely inside it —
 * that way you drag the clock to one corner and the timers to another, without
 * needing one window per widget.
 *
 * NOTE: for the overlay to show, Dota must run in "Fullscreen Windowed"
 * (borderless). In exclusive fullscreen Windows hands the whole screen to the
 * game and no overlay can draw over it without injecting — and injecting is
 * exactly what we refuse to do.
 */

import { join } from 'node:path'
import { BrowserWindow, screen, shell, type Display } from 'electron'

/** The display chosen in settings, or the one the cursor is on. */
export function targetDisplay(displayId: number | null): Display {
  if (displayId !== null) {
    const saved = screen.getAllDisplays().find((d) => d.id === displayId)
    if (saved) return saved
  }
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

export function createOverlayWindow(display: Display): BrowserWindow {
  const { x, y, width, height } = display.bounds

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    // Never steal focus from the game, under any circumstance.
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    // `fullscreen: true` would enter the OS fullscreen mode and steal focus
    // from the game. We only size the window to cover the monitor.
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Without this the transparent background flashes white on open.
      backgroundThrottling: false
    }
  })

  // 'screen-saver' is the highest level available; without it the overlay
  // drops behind the game as soon as it takes focus.
  win.setAlwaysOnTop(true, 'screen-saver')
  win.setIgnoreMouseEvents(true, { forward: true })
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  // External links never open inside the overlay.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.once('ready-to-show', () => win.showInactive())

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

/** Repositions the window to cover a different monitor. */
export function moveToDisplay(win: BrowserWindow, display: Display): void {
  const { x, y, width, height } = display.bounds
  win.setBounds({ x, y, width, height })
}

/**
 * Toggles between click-through (playing) and interactive (dragging widgets).
 * Returns the new state.
 */
export function setEditMode(win: BrowserWindow, on: boolean): boolean {
  win.setIgnoreMouseEvents(!on, { forward: !on })
  win.setFocusable(on)
  if (on) win.focus()
  return on
}
