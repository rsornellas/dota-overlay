import { describe, expect, it } from 'vitest'
import { clampWidget, defaultWidgets, WIDGET_IDS, WIDGET_LABELS } from './widgets'

const FHD = { width: 1920, height: 1080 }

describe('defaultWidgets', () => {
  it('covers every declared widget', () => {
    const widgets = defaultWidgets(FHD)
    expect(Object.keys(widgets).sort()).toEqual([...WIDGET_IDS].sort())
    expect(Object.keys(WIDGET_LABELS).sort()).toEqual([...WIDGET_IDS].sort())
  })

  it('starts everything visible and on screen', () => {
    const widgets = defaultWidgets(FHD)
    for (const widget of Object.values(widgets)) {
      expect(widget.x).toBeGreaterThanOrEqual(0)
      expect(widget.x).toBeLessThan(FHD.width)
      expect(widget.y).toBeLessThan(FHD.height)
      expect(widget.visible).toBe(true)
    }
  })

  it('keeps the timer column and the tracker on opposite sides', () => {
    const widgets = defaultWidgets(FHD)

    // Stacking the map on top of the timers would be unreadable.
    for (const id of ['clock', 'timers', 'roshan', 'status'] as const) {
      expect(widgets[id].x).toBeGreaterThan(FHD.width / 2)
    }
    expect(widgets.minimap.x).toBeLessThan(FHD.width / 2)
  })

  it('pushes nothing off screen on a narrow display', () => {
    const widgets = defaultWidgets({ width: 800, height: 600 })
    for (const widget of Object.values(widgets)) {
      expect(widget.x).toBeGreaterThanOrEqual(0)
      expect(widget.y).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('clampWidget', () => {
  const visible = { x: 100, y: 100, visible: true }

  it('leaves alone whatever is already on screen', () => {
    expect(clampWidget(visible, FHD)).toEqual(visible)
  })

  it('rescues anything stranded off screen', () => {
    // Happens when switching monitors or lowering the resolution.
    const rescued = clampWidget({ x: 5000, y: 5000, visible: true }, FHD)
    expect(rescued.x).toBeLessThanOrEqual(FHD.width)
    expect(rescued.y).toBeLessThanOrEqual(FHD.height)
  })

  it('refuses negative coordinates', () => {
    expect(clampWidget({ x: -200, y: -50, visible: true }, FHD)).toMatchObject({ x: 0, y: 0 })
  })

  it('preserves visibility and rounds the position', () => {
    const result = clampWidget({ x: 10.7, y: 20.2, visible: false }, FHD)
    expect(result).toEqual({ x: 11, y: 20, visible: false })
  })
})
