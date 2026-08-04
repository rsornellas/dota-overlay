import type { ActiveAlert } from '../hooks/useAlerts'

/**
 * A big, brief flash at the top centre of the screen.
 *
 * It keeps showing with the panels hidden (Ctrl+Alt+H) — that is exactly the
 * point: play with a clean screen and still be reminded to pull or head up for
 * the rune.
 */
export function AlertsWidget({ alerts, editing }: { alerts: ActiveAlert[]; editing: boolean }) {
  if (alerts.length === 0) {
    // Outside edit mode it takes no space; during editing it needs a body so
    // the user can position it before any alert happens.
    if (!editing) return null

    return <div className="alert alert--sample">SAMPLE ALERT</div>
  }

  return (
    <div className="alerts">
      {alerts.map((alert) => (
        <div key={alert.key} className="alert">
          {alert.text}
        </div>
      ))}
    </div>
  )
}
