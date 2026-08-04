// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_MANUAL_STATE,
  EMPTY_OVERLAY_STATE,
  type ManualState,
  type OverlayState
} from '@shared/gsi-types'
import { DEFAULT_VOICE } from '@shared/voice'
import { DEFAULT_NOTIFY } from '@shared/notify'
import { defaultWidgets } from '@shared/widgets'
import type { SetupStatus } from '../../main/gsi-config'
import type { Settings } from '../../main/store'
import App from './App'

/**
 * A fake preload bridge. It captures the callbacks App registers so the test
 * can push state exactly as the main process would over IPC.
 */
function fakeBridge() {
  const handlers: Record<string, ((value: never) => void)[]> = {}

  const on = (key: string) => (cb: (value: never) => void) => {
    ;(handlers[key] ??= []).push(cb)
    return () => {}
  }

  const emit = <T,>(key: string, value: T) =>
    act(() => {
      handlers[key]?.forEach((cb) => cb(value as never))
    })

  return {
    api: {
      onState: on('state'),
      onManual: on('manual'),
      onSettings: on('settings'),
      onSetup: on('setup'),
      onReposition: on('reposition'),
      onHidden: on('hidden'),
      ready: vi.fn(),
      moveWidget: vi.fn(),
      exitEdit: vi.fn()
    },
    emit
  }
}

/** jsdom has no speech synthesis; we capture what would be spoken. */
function fakeSpeech() {
  const said: string[] = []

  class Utterance {
    lang = ''
    rate = 1
    volume = 1
    voice: unknown = null
    constructor(public text: string) {}
  }

  const synth = {
    speak: (u: Utterance) => said.push(u.text),
    cancel: vi.fn(),
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }

  Object.assign(window, { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance })
  return said
}

const SETUP: SetupStatus = {
  dotaRoot: 'C:\\Steam\\steamapps\\common\\dota 2 beta',
  cfgStatus: 'created',
  cfgPath: 'C:\\...\\gamestate_integration_overlay.cfg',
  cfgContents: '',
  error: null,
  port: 53000
}

const SETTINGS: Settings = {
  configVersion: 3,
  gsiToken: 'x',
  port: 53000,
  dotaRootOverride: null,
  displayId: null,
  overlay: { opacity: 0.9 },
  showJungle: false,
  recording: false,
  // Positions computed for the jsdom viewport: Widget clamps against
  // window.innerWidth, so a 1920px fixture would be pulled back.
  widgets: defaultWidgets({ width: window.innerWidth, height: window.innerHeight }),
  voice: DEFAULT_VOICE,
  notify: DEFAULT_NOTIFY
}

const inMatch = (over: Partial<OverlayState> = {}): OverlayState => ({
  ...EMPTY_OVERLAY_STATE,
  connected: true,
  inMatch: true,
  matchId: '7471020497',
  clockTime: 600,
  gameState: 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
  daytime: true,
  receivedAt: Date.now(),
  ...over
})

let bridge: ReturnType<typeof fakeBridge>
let said: string[]

function mount(state?: OverlayState, manual?: ManualState, settings: Settings = SETTINGS) {
  render(<App />)
  bridge.emit('setup', SETUP)
  bridge.emit('settings', settings)
  if (manual) bridge.emit('manual', manual)
  if (state) bridge.emit('state', state)
}

const widget = (id: string) => document.querySelector(`[data-widget="${id}"]`)

beforeEach(() => {
  // With no real timers the interpolated clock stands still and the test is
  // deterministic.
  vi.useFakeTimers()
  // jsdom does not implement pointer capture, which dragging needs.
  Element.prototype.setPointerCapture = vi.fn()
  Element.prototype.releasePointerCapture = vi.fn()

  said = fakeSpeech()
  bridge = fakeBridge()
  ;(window as unknown as { overlay: unknown }).overlay = bridge.api
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('setup', () => {
  it('explains what is missing while Dota is not connected', () => {
    mount()

    expect(screen.getByText(/Waiting for Dota 2/)).toBeDefined()
    expect(screen.getByText('-gamestateintegration')).toBeDefined()
    expect(screen.getByText(/Fullscreen Windowed/)).toBeDefined()
  })

  it('reports when Dota was not found', () => {
    render(<App />)
    bridge.emit('settings', SETTINGS)
    bridge.emit('setup', { ...SETUP, dotaRoot: null, cfgStatus: 'no-dota' })

    expect(screen.getByText('Dota 2 not found')).toBeDefined()
  })

  it('shows the cfg path when writing fails on permissions', () => {
    render(<App />)
    bridge.emit('settings', SETTINGS)
    bridge.emit('setup', { ...SETUP, cfgStatus: 'error', error: 'EPERM: not permitted' })

    expect(screen.getByText(/Could not write the cfg/)).toBeDefined()
    expect(screen.getByText(/EPERM/)).toBeDefined()
  })

  it('switches to "connected" when Dota appears but the match has not started', () => {
    mount(inMatch({ inMatch: false, gameState: 'DOTA_GAMERULES_STATE_HERO_SELECTION' }))
    expect(screen.getByText('Connected')).toBeDefined()
  })
})

describe('timers', () => {
  it('renders the clock and the events during a match', () => {
    mount(inMatch())

    expect(screen.getByText('10:00')).toBeDefined()
    expect(screen.getByText('Power rune')).toBeDefined()
    expect(screen.getByText('Bounty rune')).toBeDefined()
  })

  it('shows no match clock when there is no match', () => {
    mount()
    expect(screen.getByText('--:--')).toBeDefined()
    expect(screen.getByText('no match')).toBeDefined()
  })

  it('keeps manual marks in the Roshan widget', () => {
    mount(inMatch())
    // With nothing marked, the Roshan widget takes no space on screen.
    expect(screen.queryByText('Roshan')).toBeNull()

    bridge.emit('manual', { ...EMPTY_MANUAL_STATE, matchId: '7471020497', roshanKilledAt: 600 })

    expect(widget('roshan')?.textContent).toContain('Roshan')
    expect(widget('timers')?.textContent).not.toContain('Roshan')
  })

  it('hides jungle timers by default and shows them when enabled', () => {
    mount(inMatch())
    expect(screen.queryByText('Stack camp')).toBeNull()

    bridge.emit('settings', { ...SETTINGS, showJungle: true })
    expect(screen.getByText('Stack camp')).toBeDefined()
  })

  it('flags timings not yet confirmed for the patch', () => {
    mount(inMatch())

    const unconfirmed = screen.getByText('Neutral items').closest('li')!
    expect(unconfirmed.querySelector('[title*="not yet confirmed"]')).not.toBeNull()

    // Lotus left the doubtful list: two independent sources agree.
    const lotus = screen.getByText('Lotus').closest('li')!
    expect(lotus.querySelector('[title*="not yet confirmed"]')).toBeNull()
  })

  it('reports when the match is paused', () => {
    mount(inMatch({ paused: true }))
    expect(screen.getByText('paused')).toBeDefined()
  })
})

describe('visual alerts', () => {
  // Pull happens at :15 and :45 of every minute. At 4:12 the 4:15 one is
  // inside the 5s lead — and no rune is anywhere near.
  const NEAR_PULL = 252
  // At 3:50 the bounty rune (4:00) is inside the 15s lead.
  const NEAR_RUNE = 230

  it('shows the pull alert when the moment arrives', () => {
    mount(inMatch({ clockTime: NEAR_PULL }))
    expect(screen.getByText('PULL')).toBeDefined()
  })

  it('shows the rune alert', () => {
    mount(inMatch({ clockTime: NEAR_RUNE }))
    expect(screen.getByText('BOUNTY RUNE')).toBeDefined()
  })

  it('alerts about lotus during the laning phase', () => {
    // At 2:55 the 3:00 lotus is inside the 10s lead.
    mount(inMatch({ clockTime: 175 }))
    expect(screen.getByText('LOTUS')).toBeDefined()
  })

  it('stops alerting about lotus once the pool fills up', () => {
    // At 20:00 the pool has been full for two minutes.
    mount(inMatch({ clockTime: 1200 }))
    expect(screen.queryByText('LOTUS')).toBeNull()
  })

  it('disappears on its own after the configured duration', () => {
    mount(inMatch({ clockTime: NEAR_PULL }))
    expect(screen.getByText('PULL')).toBeDefined()

    act(() => {
      vi.advanceTimersByTime(DEFAULT_NOTIFY.durationMs + 100)
    })

    expect(screen.queryByText('PULL')).toBeNull()
  })

  it('KEEPS SHOWING with the panels hidden', () => {
    // This is the point of the feature: clean screen, still reminded to pull.
    mount(inMatch({ clockTime: NEAR_PULL }))
    bridge.emit('hidden', true)

    expect(screen.getByText('PULL')).toBeDefined()
    // And the panels really are gone.
    expect(widget('timers')).toBeNull()
    expect(widget('clock')).toBeNull()
  })

  it('does not repeat the same alert on every state update', () => {
    mount(inMatch({ clockTime: NEAR_PULL }))

    bridge.emit('state', inMatch({ clockTime: NEAR_PULL + 1 }))
    bridge.emit('state', inMatch({ clockTime: NEAR_PULL + 2 }))

    expect(screen.getAllByText('PULL')).toHaveLength(1)
  })

  it('stays quiet while paused and outside a match', () => {
    mount(inMatch({ clockTime: NEAR_PULL, paused: true }))
    expect(screen.queryByText('PULL')).toBeNull()

    cleanup()
    bridge = fakeBridge()
    ;(window as unknown as { overlay: unknown }).overlay = bridge.api
    mount(inMatch({ clockTime: NEAR_PULL, inMatch: false }))
    expect(screen.queryByText('PULL')).toBeNull()
  })

  it('honours the visual alert master switch', () => {
    mount(inMatch({ clockTime: NEAR_PULL }), undefined, {
      ...SETTINGS,
      notify: { ...DEFAULT_NOTIFY, enabled: false }
    })
    expect(screen.queryByText('PULL')).toBeNull()
  })

  it('leaves stack off by default — it would flash once a minute', () => {
    // At 3:50 stack (3:53) would be inside its lead, if it were enabled.
    mount(inMatch({ clockTime: NEAR_RUNE }))
    expect(screen.queryByText('STACK')).toBeNull()
  })

  it('shows a sample while editing, to give something to drag', () => {
    mount(inMatch())
    bridge.emit('reposition', true)

    expect(widget('alerts')?.textContent).toContain('SAMPLE ALERT')
  })
})

describe('voice alerts', () => {
  it('speaks the enabled alerts when they enter their lead time', () => {
    // At 3:50 the bounty rune (4:00) is inside the 15s lead.
    mount(inMatch({ clockTime: 230 }))
    expect(said).toContain('Bounty')
  })

  it('says nothing while the game is paused', () => {
    mount(inMatch({ clockTime: 230, paused: true }))
    expect(said).toEqual([])
  })

  it('says nothing outside a match', () => {
    mount(inMatch({ clockTime: 230, inMatch: false }))
    expect(said).toEqual([])
  })

  it('does not repeat the same alert on every state update', () => {
    mount(inMatch({ clockTime: 230 }))
    const first = said.length

    bridge.emit('state', inMatch({ clockTime: 231 }))
    bridge.emit('state', inMatch({ clockTime: 232 }))

    expect(said.length).toBe(first)
  })

  it('honours the voice master switch', () => {
    mount(inMatch({ clockTime: 230 }), undefined, {
      ...SETTINGS,
      voice: { ...DEFAULT_VOICE, enabled: false }
    })
    expect(said).toEqual([])
  })

  it('speaks jungle timers even while they are hidden from the panel', () => {
    // At 3:50 the stack callout (3:53) is inside the 7s lead.
    mount(inMatch({ clockTime: 230 }))

    expect(screen.queryByText('Stack camp')).toBeNull()
    expect(said).toContain('Stack')
  })
})

describe('enemy tracker', () => {
  const sk = {
    unitname: 'npc_dota_hero_skeleton_king',
    short: 'SK',
    x: -1100,
    y: 602,
    lastSeen: 600,
    visible: true
  }

  it('takes no space until an enemy has been spotted', () => {
    mount(inMatch())
    expect(widget('minimap')?.textContent).toBe('')
  })

  it('draws a visible enemy with their tag', () => {
    mount(inMatch({ enemies: [sk] }))
    expect(screen.getByText('SK')).toBeDefined()
  })

  it('marks a ghost and shows how long ago it was seen', () => {
    mount(inMatch({ clockTime: 615, enemies: [{ ...sk, visible: false, lastSeen: 600 }] }))

    expect(screen.getByText('SK')).toBeDefined()
    expect(screen.getByText('15s')).toBeDefined()
  })

  it('shows no age for someone visible right now', () => {
    mount(inMatch({ clockTime: 615, enemies: [sk] }))
    expect(screen.queryByText(/^\d+s$/)).toBeNull()
  })

  it('positions by world coordinates: Dire base top-right', () => {
    mount(inMatch({ enemies: [{ ...sk, x: 8288, y: 8288 }] }))

    const pin = screen.getByText('SK').closest('.pin') as HTMLElement
    expect(pin.style.left).toBe('100%')
    expect(pin.style.top).toBe('0%')
  })

  it('fades the ghost as it ages', () => {
    mount(inMatch({ clockTime: 640, enemies: [{ ...sk, visible: false, lastSeen: 600 }] }))

    const pin = screen.getByText('SK').closest('.pin') as HTMLElement
    expect(Number(pin.style.opacity)).toBeLessThan(1)
    expect(Number(pin.style.opacity)).toBeGreaterThan(0)
  })

  it('shows your own position to orient the reading', () => {
    mount(inMatch({ self: { x: 0, y: 0 } }))

    const self = document.querySelector('.pin--self') as HTMLElement
    expect(self.style.left).toBe('50%')
    expect(self.style.top).toBe('50%')
  })

  it('appears empty while editing, to give something to drag', () => {
    mount(inMatch())
    bridge.emit('reposition', true)

    expect(widget('minimap')?.textContent).toContain('Spotted enemies show up here')
  })
})

describe('layout editing', () => {
  it('shows the bar and the handles on entering edit mode', () => {
    mount(inMatch())
    expect(screen.queryByText(/Drag the widgets/)).toBeNull()

    bridge.emit('reposition', true)

    expect(screen.getByText(/Drag the widgets/)).toBeDefined()
    expect(screen.getByText('Clock')).toBeDefined()
    expect(screen.getByText('Timers')).toBeDefined()
  })

  it('reveals even the empty widgets, to give something to drag', () => {
    mount(inMatch())
    bridge.emit('reposition', true)

    expect(widget('roshan')?.textContent).toContain('Roshan and Aegis show up here')
  })

  it('saves the position only when the drag ends', () => {
    mount(inMatch())
    bridge.emit('reposition', true)

    const clock = widget('clock')!
    const start = SETTINGS.widgets.clock

    fireEvent.pointerDown(clock, { pointerId: 1, clientX: start.x, clientY: start.y })
    fireEvent.pointerMove(clock, { pointerId: 1, clientX: start.x + 40, clientY: start.y + 25 })

    // Still dragging: nothing has hit the disk.
    expect(bridge.api.moveWidget).not.toHaveBeenCalled()

    fireEvent.pointerUp(clock, { pointerId: 1, clientX: start.x + 40, clientY: start.y + 25 })

    expect(bridge.api.moveWidget).toHaveBeenCalledWith('clock', start.x + 40, start.y + 25)
  })

  it('leaves edit mode with Esc, without hitting any target', () => {
    mount(inMatch())
    bridge.emit('reposition', true)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(bridge.api.exitEdit).toHaveBeenCalled()
  })

  it('ignores Esc outside edit mode', () => {
    mount(inMatch())
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(bridge.api.exitEdit).not.toHaveBeenCalled()
  })

  it('ignores dragging outside edit mode', () => {
    mount(inMatch())

    const clock = widget('clock')!
    fireEvent.pointerDown(clock, { pointerId: 1, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(clock, { pointerId: 1, clientX: 200, clientY: 200 })
    fireEvent.pointerUp(clock, { pointerId: 1, clientX: 200, clientY: 200 })

    expect(bridge.api.moveWidget).not.toHaveBeenCalled()
  })

  it('refuses to drag a widget off screen', () => {
    mount(inMatch())
    bridge.emit('reposition', true)

    const clock = widget('clock')!
    const start = SETTINGS.widgets.clock

    fireEvent.pointerDown(clock, { pointerId: 1, clientX: start.x, clientY: start.y })
    fireEvent.pointerMove(clock, { pointerId: 1, clientX: 99999, clientY: 99999 })
    fireEvent.pointerUp(clock, { pointerId: 1, clientX: 99999, clientY: 99999 })

    const [, x, y] = (bridge.api.moveWidget as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(x).toBeLessThanOrEqual(window.innerWidth)
    expect(y).toBeLessThanOrEqual(window.innerHeight)
  })
})
