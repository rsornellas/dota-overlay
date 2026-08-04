/**
 * Visual alerts: a big, brief flash on screen.
 *
 * They keep showing with the panels hidden (Ctrl+Alt+H). That is the whole
 * point: play with a clean screen and still be reminded to pull the lane or
 * head up for the rune.
 */

import type { CueConfig, CueSource } from './cues'

export interface NotifySettings extends CueSource {
  /** How long each alert stays on screen, in milliseconds. */
  durationMs: number
  cues: Record<string, CueConfig>
}

/**
 * Pull, runes and lotus only by default. A flash is far more intrusive than
 * speech, so the bar to enable one is higher — stack, for instance, would fire
 * every single minute for the whole match.
 */
export const DEFAULT_NOTIFY: NotifySettings = {
  enabled: true,
  durationMs: 2500,
  cues: {
    pull: { enabled: true, phrase: 'PULL', lead: 5 },
    bounty: { enabled: true, phrase: 'BOUNTY RUNE', lead: 15 },
    power: { enabled: true, phrase: 'POWER RUNE', lead: 15 },
    water: { enabled: true, phrase: 'WATER RUNE', lead: 15 },
    // Only 6 times in a whole match, all during laning: it fits a flash.
    lotus: { enabled: true, phrase: 'LOTUS', lead: 10 },

    stack: { enabled: false, phrase: 'STACK', lead: 7 },
    roshan: { enabled: false, phrase: 'ROSHAN MAY BE UP', lead: 0 },
    aegis: { enabled: false, phrase: 'AEGIS EXPIRING', lead: 20 },
    tormentor: { enabled: false, phrase: 'TORMENTOR', lead: 15 },
    daynight: { enabled: false, phrase: 'SWITCHING', lead: 10 },
    wisdom: { enabled: false, phrase: 'WISDOM', lead: 10 },
    'neutral-items': { enabled: false, phrase: 'NEUTRAL ITEMS', lead: 10 }
  }
}
