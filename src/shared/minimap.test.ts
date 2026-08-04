import { describe, expect, it } from 'vitest'
import {
  DIRE_TEAM,
  enemyTeamOf,
  extractEnemyHeroes,
  GHOST_MAX_AGE_SECONDS,
  ghostOpacity,
  heroShortName,
  MAP_BOUND,
  RADIANT_TEAM,
  toMapFraction,
  trackEnemies,
  type TrackedHero
} from './minimap'

/** A faithful slice of the minimap block recorded in a real match. */
const MINIMAP = {
  o0: {
    xpos: -4672,
    ypos: -4552,
    image: 'minimap_racks45',
    team: 2,
    yaw: 135,
    unitname: 'npc_dota_goodguys_melee_rax_mid',
    visionrange: 600
  },
  o1: {
    xpos: -732,
    ypos: -687,
    image: 'minimap_herocircle',
    team: 2,
    name: 'npc_dota_hero_death_prophet',
    yaw: -25,
    unitname: 'npc_dota_hero_death_prophet',
    visionrange: 1800
  },
  o2: {
    xpos: -1100,
    ypos: 602,
    image: 'minimap_herocircle',
    team: 3,
    name: 'npc_dota_hero_skeleton_king',
    yaw: 10,
    unitname: 'npc_dota_hero_skeleton_king',
    visionrange: 1800
  },
  o3: {
    xpos: -1069,
    ypos: 514,
    image: 'minimap_herocircle',
    team: 3,
    name: 'npc_dota_hero_witch_doctor',
    yaw: 90,
    unitname: 'npc_dota_hero_witch_doctor',
    visionrange: 1800
  },
  o4: {
    xpos: 500,
    ypos: 500,
    image: 'minimap_creep',
    team: 3,
    unitname: 'npc_dota_creep_badguys_melee',
    visionrange: 500
  }
}

const hero = (over: Partial<TrackedHero> = {}): TrackedHero => ({
  unitname: 'npc_dota_hero_skeleton_king',
  short: 'SK',
  x: 0,
  y: 0,
  lastSeen: 600,
  visible: true,
  ...over
})

describe('enemyTeamOf', () => {
  it('flips the player team', () => {
    expect(enemyTeamOf('radiant')).toBe(DIRE_TEAM)
    expect(enemyTeamOf('dire')).toBe(RADIANT_TEAM)
  })

  it('returns null when the team is unknown', () => {
    // Happens on the loading screen, before the player block arrives.
    expect(enemyTeamOf(undefined)).toBeNull()
    expect(enemyTeamOf('')).toBeNull()
    expect(enemyTeamOf('spectator')).toBeNull()
  })
})

describe('heroShortName', () => {
  it('uses initials for compound names', () => {
    expect(heroShortName('npc_dota_hero_skeleton_king')).toBe('SK')
    expect(heroShortName('npc_dota_hero_witch_doctor')).toBe('WD')
    expect(heroShortName('npc_dota_hero_death_prophet')).toBe('DP')
  })

  it('uses the first three letters for single-word names', () => {
    expect(heroShortName('npc_dota_hero_juggernaut')).toBe('JUG')
    expect(heroShortName('npc_dota_hero_pudge')).toBe('PUD')
  })

  it('never overflows on very long names', () => {
    expect(heroShortName('npc_dota_hero_a_b_c_d_e_f').length).toBeLessThanOrEqual(4)
  })

  it('survives unexpected input', () => {
    expect(heroShortName('')).toBe('?')
    expect(heroShortName('npc_dota_hero_')).toBe('?')
  })
})

describe('extractEnemyHeroes', () => {
  it('picks up enemy heroes only', () => {
    const enemies = extractEnemyHeroes(MINIMAP, DIRE_TEAM)

    expect(enemies.map((e) => e.unitname)).toEqual([
      'npc_dota_hero_skeleton_king',
      'npc_dota_hero_witch_doctor'
    ])
  })

  it('ignores buildings, creeps and allies', () => {
    const enemies = extractEnemyHeroes(MINIMAP, DIRE_TEAM)
    expect(enemies.some((e) => e.unitname.includes('creep'))).toBe(false)
    expect(enemies.some((e) => e.unitname.includes('rax'))).toBe(false)
    expect(enemies.some((e) => e.unitname.includes('death_prophet'))).toBe(false)
  })

  it('preserves world coordinates', () => {
    const [sk] = extractEnemyHeroes(MINIMAP, DIRE_TEAM)
    expect(sk).toEqual({ unitname: 'npc_dota_hero_skeleton_king', x: -1100, y: 602 })
  })

  it('returns empty without a minimap or without a known team', () => {
    expect(extractEnemyHeroes(undefined, DIRE_TEAM)).toEqual([])
    expect(extractEnemyHeroes(MINIMAP, null)).toEqual([])
    expect(extractEnemyHeroes({}, DIRE_TEAM)).toEqual([])
  })

  it('does not break on malformed entries', () => {
    const junk = { o0: null, o1: 'text', o2: { unitname: 'npc_dota_hero_x', team: 3 } }
    expect(extractEnemyHeroes(junk as never, DIRE_TEAM)).toEqual([])
  })
})

describe('trackEnemies', () => {
  const sk = { unitname: 'npc_dota_hero_skeleton_king', x: -1100, y: 602 }
  const wd = { unitname: 'npc_dota_hero_witch_doctor', x: -1069, y: 514 }

  it('records a hero seen for the first time', () => {
    const tracked = trackEnemies([], [sk], 600)
    expect(tracked).toEqual([
      { unitname: sk.unitname, short: 'SK', x: -1100, y: 602, lastSeen: 600, visible: true }
    ])
  })

  it('turns into a ghost when the hero enters the fog', () => {
    const seen = trackEnemies([], [sk], 600)
    const ghost = trackEnemies(seen, [], 610)

    expect(ghost[0]).toMatchObject({
      visible: false,
      // The last known position is preserved — that is what the player saw.
      x: -1100,
      y: 602,
      lastSeen: 600
    })
  })

  it('updates the position when the hero reappears', () => {
    const ghost = trackEnemies(trackEnemies([], [sk], 600), [], 610)
    const back = trackEnemies(ghost, [{ ...sk, x: 2000, y: 2000 }], 620)

    expect(back[0]).toMatchObject({ x: 2000, y: 2000, lastSeen: 620, visible: true })
  })

  it('tracks several heroes independently', () => {
    const both = trackEnemies([], [sk, wd], 600)
    const onlySk = trackEnemies(both, [sk], 610)

    expect(onlySk.find((h) => h.unitname === sk.unitname)?.visible).toBe(true)
    expect(onlySk.find((h) => h.unitname === wd.unitname)?.visible).toBe(false)
  })

  it('forgets positions too old to be useful', () => {
    const seen = trackEnemies([], [sk], 600)

    const stillUseful = trackEnemies(seen, [], 600 + GHOST_MAX_AGE_SECONDS)
    expect(stillUseful).toHaveLength(1)

    const tooOld = trackEnemies(seen, [], 600 + GHOST_MAX_AGE_SECONDS + 1)
    expect(tooOld).toEqual([])
  })

  it('never forgets someone currently visible, however long it takes', () => {
    const seen = trackEnemies([], [sk], 600)
    const later = trackEnemies(seen, [sk], 9999)
    expect(later).toHaveLength(1)
  })

  it('drops ghosts when the clock runs backwards', () => {
    // New match: the clock restarts and leftovers are worthless.
    const seen = trackEnemies([], [sk], 1200)
    expect(trackEnemies(seen, [], 30)).toEqual([])
  })
})

describe('toMapFraction', () => {
  it('puts the map centre in the middle', () => {
    expect(toMapFraction(0, 0)).toEqual({ left: 0.5, top: 0.5 })
  })

  it('puts the Radiant base bottom-left and Dire top-right', () => {
    const radiant = toMapFraction(-MAP_BOUND, -MAP_BOUND)
    const dire = toMapFraction(MAP_BOUND, MAP_BOUND)

    expect(radiant).toEqual({ left: 0, top: 1 })
    expect(dire).toEqual({ left: 1, top: 0 })
  })

  it('keeps everything inside the frame even out of bounds', () => {
    const out = toMapFraction(99999, -99999)
    expect(out.left).toBe(1)
    expect(out.top).toBe(1)
  })
})

describe('ghostOpacity', () => {
  it('shows anyone currently visible at full strength', () => {
    expect(ghostOpacity(hero({ visible: true }), 9999)).toBe(1)
  })

  it('fades the ghost as it ages', () => {
    const ghost = hero({ visible: false, lastSeen: 600 })
    const fresh = ghostOpacity(ghost, 605)
    const old = ghostOpacity(ghost, 640)

    expect(fresh).toBeGreaterThan(old)
    expect(fresh).toBeLessThan(1)
  })

  it('never fades away entirely while still listed', () => {
    expect(ghostOpacity(hero({ visible: false, lastSeen: 0 }), 10_000)).toBe(0.25)
  })
})
