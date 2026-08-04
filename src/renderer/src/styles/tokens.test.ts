import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { WIDGET_WIDTH } from '@shared/widgets'

/*
 * The card width has to exist in two places: CSS lays the cards out with it,
 * and `defaultWidgets` needs it to work out the right-hand column before any
 * of them has been painted. Injecting the value from TS would make a
 * paint-critical property depend on module execution order — if it ever failed
 * to run, `width: var(--widget-width)` resolves invalid and every card
 * silently falls back to `width: auto`. So the duplication stays, and this
 * test is what keeps it honest.
 */
it('keeps --widget-width in step with WIDGET_WIDTH', () => {
  const css = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8')

  expect(css).toContain(`--widget-width: ${WIDGET_WIDTH}px`)
})
