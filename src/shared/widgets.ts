/** The blocks the user can position freely on screen. */

export const WIDGET_IDS = ['clock', 'timers', 'roshan', 'minimap', 'alerts', 'status'] as const

export type WidgetId = (typeof WIDGET_IDS)[number]

export interface WidgetState {
  x: number
  y: number
  visible: boolean
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
  clock: 'Clock',
  timers: 'Timers',
  roshan: 'Roshan & Aegis',
  minimap: 'Enemy tracker',
  alerts: 'Visual alerts',
  status: 'Status'
}

const WIDGET_WIDTH = 250
const MARGIN = 16

/**
 * Starting position: a column in the top-right corner, away from the HUD and
 * the minimap. `status` and `timers` never show together (one means "no
 * match", the other "in match"), so they share a spot.
 */
export function defaultWidgets(bounds: {
  width: number
  height: number
}): Record<WidgetId, WidgetState> {
  const right = Math.max(MARGIN, bounds.width - WIDGET_WIDTH - MARGIN)

  return {
    clock: { x: right, y: MARGIN, visible: true },
    timers: { x: right, y: MARGIN + 60, visible: true },
    status: { x: right, y: MARGIN + 60, visible: true },
    roshan: { x: right, y: Math.round(bounds.height * 0.55), visible: true },
    // Left-hand side, away from the timer column: it is a large square.
    minimap: { x: MARGIN, y: MARGIN, visible: true },
    // Top center: where the eye passes without hunting, and where the Dota HUD
    // has nothing.
    alerts: {
      x: Math.round((bounds.width - WIDGET_WIDTH) / 2),
      y: Math.round(bounds.height * 0.14),
      visible: true
    }
  }
}

/**
 * Keeps a widget reachable. Without this, switching monitors or lowering the
 * resolution would strand a widget off-screen with no way to drag it back.
 */
export function clampWidget(
  state: WidgetState,
  bounds: { width: number; height: number }
): WidgetState {
  // A generous margin: enough to grab the widget and drag it.
  const maxX = Math.max(0, bounds.width - 60)
  const maxY = Math.max(0, bounds.height - 40)

  return {
    ...state,
    x: Math.min(Math.max(0, Math.round(state.x)), maxX),
    y: Math.min(Math.max(0, Math.round(state.y)), maxY)
  }
}
