import type { SetupStatus } from '../../../main/gsi-config'

/**
 * Shown while GSI is not delivering a match. Since the window is
 * click-through, everything here is read-only — no buttons.
 */
export function SetupNotice({ setup, connected }: { setup: SetupStatus; connected: boolean }) {
  if (!setup.dotaRoot) {
    return (
      <div className="card notice notice--error">
        <strong>Dota 2 not found</strong>
        <p>Point at the folder manually in config.json (tray → Open data folder).</p>
      </div>
    )
  }

  if (setup.cfgStatus === 'error') {
    return (
      <div className="card notice notice--error">
        <strong>Could not write the cfg</strong>
        <p>{setup.error}</p>
        <p>
          Create the file by hand at <code>{setup.cfgPath}</code> with the contents found in the
          app's data folder.
        </p>
      </div>
    )
  }

  if (connected) {
    return (
      <div className="card notice">
        <strong>Connected</strong>
        <p>Timers appear once the match starts.</p>
      </div>
    )
  }

  return (
    <div className="card notice">
      <strong>Waiting for Dota 2…</strong>
      <ul className="notice__steps">
        <li>
          Launch option <code>-gamestateintegration</code> in the game properties
        </li>
        <li>Restart Dota if it was already open</li>
        <li>Run it in "Fullscreen Windowed"</li>
      </ul>
      {setup.error && <p className="notice__warn">{setup.error}</p>}
    </div>
  )
}
