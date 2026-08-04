/**
 * Reads the recorded payloads and shows what Dota ACTUALLY sent.
 *
 *   npm run inspect
 *
 * This answers what the documentation does not: which GSI blocks arrive while
 * you are playing (rather than spectating). In particular `minimap` — if it
 * comes through with positions limited to your vision, the whole tracker can
 * be built on GSI alone.
 *
 * How to record: tray → "Record payloads (diagnostics)", join a bot match,
 * play for ~2 minutes, then turn recording off.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const file = join(process.env.APPDATA, 'dota-overlay', 'recorded.jsonl')

if (!existsSync(file)) {
  console.error(`No recording at ${file}`)
  console.error('Enable "Record payloads (diagnostics)" from the tray and join a match.')
  process.exit(1)
}

const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)

if (lines.length === 0) {
  console.error('Recording file is empty.')
  process.exit(1)
}

const payloads = []
for (const line of lines) {
  try {
    payloads.push(JSON.parse(line))
  } catch {
    // Truncated line (recording interrupted mid-write): skip it.
  }
}

console.log(`\n${payloads.length} payloads recorded.\n`)

// The mock only sends provider/map/player. Without this warning the verdict
// below would look like an answer about real Dota — and be a wrong conclusion.
const fromMock = payloads.every((p) => p.player?.name === 'mock')

if (fromMock) {
  console.log('⚠  THIS RECORDING CAME FROM THE MOCK (npm run mock), NOT FROM DOTA.')
  console.log('   The mock only sends provider/map/player, so the verdict below')
  console.log('   says nothing about the real game. For a real answer, record a')
  console.log('   bot match with Dota running.\n')
}

// ── Which blocks showed up, and in how many payloads ──────────────────────
const blocks = new Map()
for (const p of payloads) {
  for (const key of Object.keys(p)) {
    blocks.set(key, (blocks.get(key) ?? 0) + 1)
  }
}

console.log('BLOCKS RECEIVED')
console.log('─'.repeat(46))
for (const [name, count] of [...blocks].sort((a, b) => b[1] - a[1])) {
  const pct = Math.round((count / payloads.length) * 100)
  console.log(`  ${name.padEnd(16)} ${String(count).padStart(6)}  (${pct}%)`)
}

// Requested in the cfg but never delivered: Valve does not expose these to players.
// prettier-ignore
const requested = [
  'provider', 'map', 'player', 'hero', 'abilities', 'items', 'buildings',
  'draft', 'wearables', 'minimap', 'events', 'couriers', 'neutralitems', 'roshan'
]
const missing = requested.filter((b) => !blocks.has(b))

if (missing.length > 0) {
  console.log('\nREQUESTED IN THE CFG BUT NEVER SENT')
  console.log('─'.repeat(46))
  console.log(`  ${missing.join(', ')}`)
  console.log('  (Valve does not expose these while you are playing)')
}

// ── The verdict on the minimap ────────────────────────────────────────────
console.log('\nVERDICT — MINIMAP TRACKER')
console.log('─'.repeat(46))

const withMinimap = payloads.filter((p) => p.minimap && Object.keys(p.minimap).length > 0)

if (withMinimap.length === 0) {
  console.log('  The `minimap` block does NOT arrive while you play.')
  console.log('  An enemy tracker would only be possible through screen capture')
  console.log('  plus computer vision, which leaves GSI behind.')
} else {
  const teams = new Map()
  const units = new Set()
  let sample = null

  for (const p of withMinimap) {
    for (const element of Object.values(p.minimap)) {
      if (!element || typeof element !== 'object') continue
      teams.set(element.team ?? '?', (teams.get(element.team ?? '?') ?? 0) + 1)
      if (element.unitname) units.add(element.unitname)
      sample ??= element
    }
  }

  console.log(`  The \`minimap\` block DOES arrive (${withMinimap.length} payloads).`)
  console.log(`  Teams seen: ${[...teams.keys()].join(', ')}`)
  console.log(`  Distinct units: ${units.size}`)
  console.log(`\n  Sample element:`)
  console.log(`  ${JSON.stringify(sample, null, 2).split('\n').join('\n  ')}`)
  console.log(`\n  Units: ${[...units].slice(0, 25).join(', ')}`)
  console.log('\n  >> If heroes from the ENEMY team appear here, the tracker is')
  console.log('     viable on GSI alone, limited to your vision.')
}

// ── Sample of the richest payload, for manual inspection ──────────────────
const richest = payloads.reduce((a, b) => (Object.keys(b).length > Object.keys(a).length ? b : a))

console.log('\nKEYS OF THE RICHEST PAYLOAD')
console.log('─'.repeat(46))
for (const [key, value] of Object.entries(richest)) {
  const shape =
    value && typeof value === 'object'
      ? `{ ${Object.keys(value).slice(0, 6).join(', ')}${Object.keys(value).length > 6 ? ', …' : ''} }`
      : typeof value
  console.log(`  ${key.padEnd(16)} ${shape}`)
}

console.log()
