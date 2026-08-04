import { useEffect, useMemo } from 'react'
import { nextEvents } from '@shared/schedule'
import type { WidgetId } from '@shared/widgets'
import { AlertsWidget } from './components/AlertsWidget'
import { ClockWidget } from './components/ClockWidget'
import { MinimapWidget } from './components/MinimapWidget'
import { RoshanWidget } from './components/RoshanWidget'
import { SetupNotice } from './components/SetupNotice'
import { TimersWidget } from './components/TimersWidget'
import { Widget } from './components/Widget'
import { useAlerts } from './hooks/useAlerts'
import { useLiveClock, useOverlay } from './hooks/useOverlay'
import { useVoice } from './hooks/useVoice'

/** Used only in the moment between mounting and receiving settings from main. */
const SILENT_VOICE = { enabled: false, rate: 1, volume: 1, cues: {} }
const SILENT_NOTIFY = { enabled: false, durationMs: 2500, cues: {} }

export default function App() {
  const { state, manual, settings, setup, editing, hidden } = useOverlay()
  const clock = useLiveClock(state)

  const events = useMemo(
    () => nextEvents({ clockTime: clock, daytime: state.daytime, manual }),
    // `clock` ticks 5x a second but the schedule only moves once a second, so
    // the dependency is deliberately the rounded value and not the clock
    // itself: four of every five ticks recompute nothing.
    [Math.floor(clock), state.daytime, manual]
  )

  const inMatch = state.connected && state.inMatch
  const alerting = inMatch && !state.paused

  // Speech and visual alerts use the FULL list on purpose: you can be reminded
  // to stack without jungle timers taking up room in the panel.
  useVoice(events, settings?.voice ?? SILENT_VOICE, alerting, state.matchId)
  const alerts = useAlerts(events, settings?.notify ?? SILENT_NOTIFY, alerting, state.matchId)

  // In edit mode the window covers the whole screen and eats clicks. Esc is
  // the way out that does not depend on hitting any target.
  useEffect(() => {
    if (!editing) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.overlay.exitEdit()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editing])

  const manualEvents = events.filter((event) => event.category === 'manual')
  const listedEvents = events.filter(
    (event) => event.category !== 'manual' && (!event.optIn || settings?.showJungle)
  )

  if (!settings) return null

  // Panels hidden: only alerts survive. While editing everything shows, even
  // what would be hidden or empty — otherwise there would be no way to
  // position a widget before it has content.
  const shows = (id: WidgetId, whenPlaying: boolean) =>
    settings.widgets[id].visible && (editing || (!hidden && whenPlaying))

  return (
    <div className="stage" style={{ opacity: settings.overlay.opacity }}>
      {editing && (
        <div className="editbar">
          Drag the widgets · <kbd>Ctrl+Alt+P</kbd> to finish
        </div>
      )}

      {shows('clock', true) && (
        <Widget id="clock" state={settings.widgets.clock} editing={editing}>
          <ClockWidget clock={clock} daytime={state.daytime} paused={state.paused} live={inMatch} />
        </Widget>
      )}

      {shows('timers', inMatch) && (
        <Widget id="timers" state={settings.widgets.timers} editing={editing}>
          <TimersWidget events={listedEvents} />
        </Widget>
      )}

      {shows('status', !inMatch) && setup && (
        <Widget id="status" state={settings.widgets.status} editing={editing}>
          <SetupNotice setup={setup} connected={state.connected} />
        </Widget>
      )}

      {shows('roshan', inMatch) && (
        <Widget id="roshan" state={settings.widgets.roshan} editing={editing}>
          <RoshanWidget events={manualEvents} editing={editing} />
        </Widget>
      )}

      {shows('minimap', inMatch) && (
        <Widget id="minimap" state={settings.widgets.minimap} editing={editing}>
          <MinimapWidget
            enemies={state.enemies}
            self={state.self}
            clock={clock}
            editing={editing}
          />
        </Widget>
      )}

      {/* No `hidden` in this condition: alerts survive Ctrl+Alt+H. */}
      {settings.widgets.alerts.visible && (
        <Widget id="alerts" state={settings.widgets.alerts} editing={editing}>
          <AlertsWidget alerts={alerts} editing={editing} />
        </Widget>
      )}
    </div>
  )
}
