import { useEffect, useState } from 'react'
import {
  EMPTY_MANUAL_STATE,
  EMPTY_OVERLAY_STATE,
  type ManualState,
  type OverlayState
} from '@shared/gsi-types'
import type { SetupStatus } from '../../../main/gsi-config'
import type { Settings } from '../../../main/store'

/** Subscribes to everything the main process publishes and reports readiness. */
export function useOverlay() {
  const [state, setState] = useState<OverlayState>(EMPTY_OVERLAY_STATE)
  const [manual, setManual] = useState<ManualState>(EMPTY_MANUAL_STATE)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [setup, setSetup] = useState<SetupStatus | null>(null)
  const [editing, setEditing] = useState(false)
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    const unsubscribers = [
      window.overlay.onState(setState),
      window.overlay.onManual(setManual),
      window.overlay.onSettings(setSettings),
      window.overlay.onSetup(setSetup),
      window.overlay.onReposition(setEditing),
      window.overlay.onHidden(setHidden)
    ]

    // Only now does main know it can send the initial state.
    window.overlay.ready()

    return () => unsubscribers.forEach((off) => off())
  }, [])

  return { state, manual, settings, setup, editing, hidden }
}

/**
 * A clock that keeps running between payloads.
 *
 * GSI arrives every ~250ms, which would already be enough, but interpolating
 * keeps the countdown smooth even if a packet is late. With the game paused we
 * extrapolate nothing: the clock freezes along with it.
 */
export function useLiveClock(state: OverlayState): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!state.connected || state.paused) return
    const id = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(id)
  }, [state.connected, state.paused])

  if (!state.connected || state.paused || state.receivedAt === 0) return state.clockTime

  const drift = (now - state.receivedAt) / 1000
  // If we have gone a long time with no payload, freezing beats inventing.
  return drift > 2 ? state.clockTime : state.clockTime + drift
}
