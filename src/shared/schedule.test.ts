import { describe, expect, it } from 'vitest'
import { EMPTY_MANUAL_STATE, type ManualState } from './gsi-types'
import { manualForMatch, nextDayNight, nextEvents, nextOccurrence } from './schedule'
import { formatClock, formatCountdown } from './format'
import { RECURRING, type RecurringSpec } from './timings'

const spec = (id: string): RecurringSpec => {
  const found = RECURRING.find((s) => s.id === id)
  if (!found) throw new Error(`spec ${id} does not exist`)
  return found
}

const at = (clockTime: number, over: Partial<ManualState> = {}) =>
  nextEvents({ clockTime, daytime: true, manual: { ...EMPTY_MANUAL_STATE, ...over } })

const find = (clockTime: number, id: string, over: Partial<ManualState> = {}) =>
  at(clockTime, over).find((e) => e.id === id)

describe('nextOccurrence', () => {
  it('returns the first occurrence when the clock has not reached it', () => {
    expect(nextOccurrence(-75, spec('bounty'))).toBe(0)
    expect(nextOccurrence(0, spec('power'))).toBe(360)
  })

  it('skips ahead when the event is happening exactly now', () => {
    // At 0:00 the bounty rune is spawning; what matters is the 4:00 one.
    expect(nextOccurrence(0, spec('bounty'))).toBe(240)
    expect(nextOccurrence(240, spec('bounty'))).toBe(480)
  })

  it('chains correctly in the middle of an interval', () => {
    expect(nextOccurrence(239, spec('bounty'))).toBe(240)
    expect(nextOccurrence(241, spec('bounty'))).toBe(480)
    expect(nextOccurrence(1000, spec('power'))).toBe(1080)
  })

  it('honours explicit lists and runs out at the end', () => {
    expect(nextOccurrence(0, spec('water'))).toBe(120)
    expect(nextOccurrence(120, spec('water'))).toBe(240)
    // Only two water runes exist in the whole match.
    expect(nextOccurrence(240, spec('water'))).toBeNull()
    expect(nextOccurrence(9999, spec('water'))).toBeNull()
  })

  it('returns null for a one-off event that already passed', () => {
    expect(nextOccurrence(0, spec('tormentor'))).toBe(900)
    expect(nextOccurrence(900, spec('tormentor'))).toBeNull()
  })

  it('honours endsAfter', () => {
    const limited: RecurringSpec = {
      id: 'x',
      label: 'x',
      category: 'rune',
      first: 0,
      every: 60,
      endsAfter: 120
    }
    expect(nextOccurrence(0, limited)).toBe(60)
    expect(nextOccurrence(60, limited)).toBe(120)
    expect(nextOccurrence(120, limited)).toBeNull()
  })
})

describe('nextDayNight', () => {
  it('counts down to the first night during pre-game', () => {
    expect(nextDayNight(-75, true)).toMatchObject({ at: 300, in: 375, label: 'Night' })
  })

  it('flips every 5 minutes', () => {
    expect(nextDayNight(0, true).at).toBe(300)
    expect(nextDayNight(299, true).at).toBe(300)
    expect(nextDayNight(300, false).at).toBe(600)
    expect(nextDayNight(301, false).at).toBe(600)
  })

  it('labels from the GSI daytime flag, not from the clock', () => {
    // Night Stalker can force night outside the normal cycle.
    expect(nextDayNight(100, false).label).toBe('Day')
    expect(nextDayNight(100, true).label).toBe('Night')
  })
})

describe('nextEvents', () => {
  it('works during pre-game with a negative clock', () => {
    const events = at(-75)
    expect(events.every((e) => e.in > 0)).toBe(true)
    expect(find(-75, 'bounty')).toMatchObject({ at: 0, in: 75 })
  })

  it('sorts from most imminent to furthest away', () => {
    const ins = at(600).map((e) => e.in)
    expect(ins).toEqual([...ins].sort((a, b) => a - b))
  })

  it('stops listing the water rune after 4:00', () => {
    expect(find(120, 'water')).toBeDefined()
    expect(find(300, 'water')).toBeUndefined()
  })

  it('stops announcing lotus once the pool fills up, at 18:00', () => {
    // One lotus every 3 min up to a cap of 6. After that they only grow when
    // someone harvests, and GSI does not report the pool — better quiet than
    // guessing.
    expect(find(0, 'lotus')).toMatchObject({ at: 180 })
    expect(find(900, 'lotus')).toMatchObject({ at: 1080 })
    expect(find(1080, 'lotus')).toBeUndefined()
    expect(find(2000, 'lotus')).toBeUndefined()
  })

  it('propagates the unverified flag so the UI can mark it', () => {
    expect(find(0, 'tormentor')?.unverified).toBe(true)
    expect(find(0, 'bounty')?.unverified).toBeUndefined()
  })

  it('flags optIn events so the UI can hide them', () => {
    expect(find(600, 'stack')?.optIn).toBe(true)
    expect(find(600, 'power')?.optIn).toBeUndefined()
  })
})

describe('Roshan', () => {
  it('does not show up until it is marked', () => {
    expect(find(600, 'roshan')).toBeUndefined()
  })

  it('becomes an 8-to-11 minute window after the kill', () => {
    const ev = find(600, 'roshan', { roshanKilledAt: 600 })
    expect(ev).toMatchObject({ at: 1080, in: 480, windowEnd: 1260, windowIn: 660 })
  })

  it('goes negative once the window opens', () => {
    const ev = find(1100, 'roshan', { roshanKilledAt: 600 })
    expect(ev!.in).toBeLessThan(0)
    expect(ev!.windowIn).toBeGreaterThan(0)
  })

  it('disappears once the window closes — he is certainly alive', () => {
    expect(find(1259, 'roshan', { roshanKilledAt: 600 })).toBeDefined()
    expect(find(1260, 'roshan', { roshanKilledAt: 600 })).toBeUndefined()
  })
})

describe('Aegis', () => {
  it('expires 5 minutes after being picked up', () => {
    expect(find(600, 'aegis', { aegisPickedAt: 600 })).toMatchObject({ at: 900, in: 300 })
  })

  it('disappears after expiring', () => {
    expect(find(899, 'aegis', { aegisPickedAt: 600 })).toBeDefined()
    expect(find(900, 'aegis', { aegisPickedAt: 600 })).toBeUndefined()
  })
})

describe('Tormentor', () => {
  it('shows the fixed first spawn until it dies', () => {
    expect(find(0, 'tormentor')).toMatchObject({ at: 900, category: 'objective' })
  })

  it('switches to a manual 10-minute respawn after the first kill', () => {
    const ev = find(1000, 'tormentor', { tormentorKilledAt: 1000 })
    expect(ev).toMatchObject({ at: 1600, in: 600, category: 'manual' })
  })

  it('never duplicates between the fixed spawn and the manual mark', () => {
    const matches = at(500, { tormentorKilledAt: 400 }).filter((e) => e.id === 'tormentor')
    expect(matches).toHaveLength(1)
  })
})

describe('manualForMatch', () => {
  const marked: ManualState = {
    matchId: '111',
    roshanKilledAt: 600,
    aegisPickedAt: 610,
    tormentorKilledAt: null
  }

  it('keeps the marks within the same match', () => {
    expect(manualForMatch(marked, '111')).toBe(marked)
  })

  it('drops everything when the match changes', () => {
    expect(manualForMatch(marked, '222')).toEqual({
      matchId: '222',
      roshanKilledAt: null,
      aegisPickedAt: null,
      tormentorKilledAt: null
    })
  })

  it('adopts the matchId when there was none yet', () => {
    expect(manualForMatch(EMPTY_MANUAL_STATE, '333').matchId).toBe('333')
  })
})

describe('formatting', () => {
  it('formats the clock like the HUD', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(754)).toBe('12:34')
    expect(formatClock(-75)).toBe('-1:15')
  })

  it('collapses elapsed countdowns to "now"', () => {
    expect(formatCountdown(45)).toBe('0:45')
    expect(formatCountdown(0)).toBe('now')
    expect(formatCountdown(-10)).toBe('now')
  })
})
