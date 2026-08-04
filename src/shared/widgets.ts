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

/**
 * Card width. Mirrored by `--widget-width` in `renderer/src/styles/tokens.css`
 * — the two are kept in step by `styles/tokens.test.ts`.
 */
export const WIDGET_WIDTH = 250

/** Breathing room between a widget and the edge of the screen. */
const MARGIN = 16

/**
 * Minimum slice of a widget that has to stay on screen, so it can always be
 * grabbed and dragged back after a resolution or monitor change.
 */
export const GRAB_MARGIN = 60

/**
 * The bottom edge is more forgiving than the sides: the drag handle sits at
 * the top of the widget, so less of it has to remain above the fold.
 */
const BOTTOM_GRAB_MARGIN = 40

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
  const maxX = Math.max(0, bounds.width - GRAB_MARGIN)
  const maxY = Math.max(0, bounds.height - BOTTOM_GRAB_MARGIN)

  return {
    ...state,
    x: Math.min(Math.max(0, Math.round(state.x)), maxX),
    y: Math.min(Math.max(0, Math.round(state.y)), maxY)
  }
}
