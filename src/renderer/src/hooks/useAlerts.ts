import { useEffect, useRef, useState } from 'react'
import { dueCues } from '@shared/cues'
import type { NotifySettings } from '@shared/notify'
import type { TimerEvent } from '@shared/schedule'

export interface ActiveAlert {
  key: string
  text: string
}

/**
 * Visual alerts currently on screen.
 *
 * Each one appears as its event approaches and leaves on its own after
 * `durationMs`. The set of already-fired alerts lives in a ref because it must
 * not trigger a re-render — it only exists to prevent repeats.
 */
export function useAlerts(
  events: TimerEvent[],
  settings: NotifySettings,
  active: boolean,
  matchId: string | null
): ActiveAlert[] {
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])
  const fired = useRef(new Set<string>())
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  // New match, alerts reset. Without this, an event sharing a timestamp with
  // the previous match would count as already fired.
  useEffect(() => {
    fired.current.clear()
  }, [matchId])

  useEffect(() => {
    if (!active) return

    const cues = dueCues(events, settings, fired.current)
    if (cues.length === 0) return

    for (const cue of cues) fired.current.add(cue.key)
    setAlerts((current) => [...current, ...cues])

    for (const cue of cues) {
      timers.current.push(
        setTimeout(() => {
          setAlerts((current) => current.filter((a) => a.key !== cue.key))
        }, settings.durationMs)
      )
    }
  }, [events, settings, active])

  // Outside a match or while paused, clear the screen at once.
  useEffect(() => {
    if (!active) setAlerts([])
  }, [active])

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout)
      timers.current = []
    },
    []
  )

  return alerts
}
