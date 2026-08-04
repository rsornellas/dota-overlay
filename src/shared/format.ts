/** Formats clock seconds like the HUD does: `12:34`, `-1:15` during pre-game. */
export function formatClock(seconds: number): string {
  const sign = seconds < 0 ? '-' : ''
  const abs = Math.abs(Math.trunc(seconds))
  const m = Math.floor(abs / 60)
  const s = abs % 60
  return `${sign}${m}:${String(s).padStart(2, '0')}`
}

/** Formats a countdown. Zero or negative collapses to `now`. */
export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'now'
  return formatClock(seconds)
}
