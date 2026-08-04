import { describe, expect, it } from 'vitest'
import { cueKey, dueCues, type CueSource } from './cues'
import { DEFAULT_VOICE } from './voice'
import { DEFAULT_NOTIFY } from './notify'
import type { TimerEvent } from './schedule'

const event = (over: Partial<TimerEvent> = {}): TimerEvent => ({
  id: 'bounty',
  label: 'Bounty rune',
  category: 'rune',
  at: 240,
  in: 10,
  ...over
})

const source = (over: Partial<CueSource> = {}): CueSource => ({
  enabled: true,
  cues: DEFAULT_VOICE.cues,
  ...over
})

const texts = (cues: { text: string }[]) => cues.map((c) => c.text)

describe('dueCues', () => {
  it('fires once the configured lead time is reached', () => {
    // bounty has lead 15 in the voice configuration.
    expect(dueCues([event({ in: 16 })], source(), new Set())).toEqual([])
    expect(texts(dueCues([event({ in: 15 })], source(), new Set()))).toEqual(['Bounty'])
    expect(texts(dueCues([event({ in: 3 })], source(), new Set()))).toEqual(['Bounty'])
  })

  it('never repeats the same occurrence', () => {
    const fired = new Set([cueKey(event())])
    expect(dueCues([event({ in: 5 })], source(), fired)).toEqual([])
  })

  it('treats different occurrences of a timer as distinct alerts', () => {
    const fired = new Set([cueKey(event({ at: 240 }))])
    // The next rune, at 8:00, has not been announced yet.
    expect(dueCues([event({ at: 480, in: 5 })], source(), fired)).toHaveLength(1)
  })

  it('stays silent about alerts that expired long ago', () => {
    // Reopening the overlay mid-match must not dump stale alerts.
    expect(dueCues([event({ in: -1 })], source(), new Set())).toHaveLength(1)
    expect(dueCues([event({ in: -30 })], source(), new Set())).toEqual([])
  })

  it('honours the master switch', () => {
    expect(dueCues([event({ in: 1 })], source({ enabled: false }), new Set())).toEqual([])
  })

  it('ignores timers with no cue configured or turned off', () => {
    expect(dueCues([event({ id: 'wisdom', in: 1 })], source(), new Set())).toEqual([])
    expect(dueCues([event({ id: 'nonexistent', in: 1 })], source(), new Set())).toEqual([])
  })

  it('falls back to the timer label when the phrase is empty', () => {
    const custom = source({
      cues: { ...DEFAULT_VOICE.cues, bounty: { enabled: true, phrase: '   ', lead: 15 } }
    })
    expect(texts(dueCues([event({ in: 5 })], custom, new Set()))).toEqual(['Bounty rune'])
  })

  it('accepts custom phrases and lead times', () => {
    const custom = source({
      cues: { ...DEFAULT_VOICE.cues, bounty: { enabled: true, phrase: 'grab rune', lead: 40 } }
    })
    expect(texts(dueCues([event({ in: 35 })], custom, new Set()))).toEqual(['grab rune'])
  })

  it('can fire more than one alert at the same instant', () => {
    const cues = dueCues(
      [event({ id: 'bounty', in: 5 }), event({ id: 'stack', at: 293, in: 3 })],
      source(),
      new Set()
    )
    expect(texts(cues)).toEqual(['Bounty', 'Stack'])
  })

  it('drives both speech and visual alerts, with different wording', () => {
    const spoken = dueCues([event({ in: 5 })], DEFAULT_VOICE, new Set())
    const visual = dueCues([event({ in: 5 })], DEFAULT_NOTIFY, new Set())

    expect(texts(spoken)).toEqual(['Bounty'])
    expect(texts(visual)).toEqual(['BOUNTY RUNE'])
    // Same occurrence: both presentations agree on what counts as "one alert".
    expect(spoken[0].key).toBe(visual[0].key)
  })
})

describe('voice defaults', () => {
  it('ships with stack, pull, runes and lotus on, and the rest quiet', () => {
    const on = Object.entries(DEFAULT_VOICE.cues)
      .filter(([, c]) => c.enabled)
      .map(([id]) => id)
      .sort()

    expect(on).toEqual(['bounty', 'water', 'power', 'stack', 'pull', 'lotus'].sort())
  })

  it('gives enough lead time to rotate to the rune', () => {
    expect(DEFAULT_VOICE.cues.bounty.lead).toBeGreaterThanOrEqual(10)
    expect(DEFAULT_VOICE.cues.power.lead).toBeGreaterThanOrEqual(10)
  })
})

describe('visual alert defaults', () => {
  it('ships with pull, runes and lotus only — a flash is more intrusive', () => {
    const on = Object.entries(DEFAULT_NOTIFY.cues)
      .filter(([, c]) => c.enabled)
      .map(([id]) => id)
      .sort()

    expect(on).toEqual(['bounty', 'water', 'power', 'pull', 'lotus'].sort())
  })

  it('leaves stack off, which would flash once a minute all match', () => {
    expect(DEFAULT_NOTIFY.cues.stack.enabled).toBe(false)
  })

  it('stays on screen long enough to read, without getting in the way', () => {
    expect(DEFAULT_NOTIFY.durationMs).toBeGreaterThanOrEqual(1500)
    expect(DEFAULT_NOTIFY.durationMs).toBeLessThanOrEqual(4000)
  })

  it('covers the same timers as speech, so nothing lacks an option', () => {
    expect(Object.keys(DEFAULT_NOTIFY.cues).sort()).toEqual(Object.keys(DEFAULT_VOICE.cues).sort())
  })
})
