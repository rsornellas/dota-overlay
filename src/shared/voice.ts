/**
 * Voice alerts. The what-and-when decision lives in cues.ts; this file only
 * holds configuration and defaults. The renderer does the actual speaking,
 * through Chromium's speechSynthesis.
 */

import type { CueConfig, CueSource } from './cues'

export interface VoiceSettings extends CueSource {
  /** Speech rate (0.5 to 2). Above 1 because short callouts sound better fast. */
  rate: number
  volume: number
  cues: Record<string, CueConfig>
}

/**
 * On by default: stack, pull, runes and lotus — the reminders most often lost
 * in the heat of a game. The user turns on the rest if they want it, so the
 * overlay does not become constant chatter.
 */
export const DEFAULT_VOICE: VoiceSettings = {
  enabled: true,
  rate: 1.15,
  volume: 0.8,
  cues: {
    bounty: { enabled: true, phrase: 'Bounty', lead: 15 },
    power: { enabled: true, phrase: 'Power rune', lead: 15 },
    water: { enabled: true, phrase: 'Water rune', lead: 15 },
    stack: { enabled: true, phrase: 'Stack', lead: 7 },
    pull: { enabled: true, phrase: 'Pull', lead: 5 },
    // Six callouts across the first 18 minutes — cheap and useful in lane.
    lotus: { enabled: true, phrase: 'Lotus', lead: 10 },

    roshan: { enabled: false, phrase: 'Roshan may be up', lead: 0 },
    aegis: { enabled: false, phrase: 'Aegis expiring', lead: 20 },
    tormentor: { enabled: false, phrase: 'Tormentor', lead: 15 },
    daynight: { enabled: false, phrase: 'Switching', lead: 10 },
    wisdom: { enabled: false, phrase: 'Wisdom', lead: 10 },
    'neutral-items': { enabled: false, phrase: 'Neutral items', lead: 10 }
  }
}
