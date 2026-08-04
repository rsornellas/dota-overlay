/**
 * Pretends to be Dota 2: sends GSI payloads to the overlay. Useful for building
 * and checking the UI without entering a match.
 *
 *   npm run mock                    # synthetic clock, from pre-game
 *   npm run mock -- --from 800      # starts at 13:20
 *   npm run mock -- --speed 20      # 20x faster, to see many events
 *   npm run mock -- --replay        # replays a real recording of the game
 *
 * Synthetic mode only sends provider/map/player — enough for timers and
 * alerts. To exercise the enemy tracker use `--replay`, which resends the full
 * payloads captured in a real match.
 *
 * The app must be running: the token comes from the config.json it generated.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(process.argv[i + 1])
}

const from = arg('from', -90)
const speed = arg('speed', 1)
const replay = process.argv.includes('--replay')

const dataDir = join(process.env.APPDATA, 'dota-overlay')
const configPath = join(dataDir, 'config.json')

let config
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'))
} catch {
  console.error(`Could not find ${configPath}.`)
  console.error('Run the app at least once (npm run dev) so it generates the token.')
  process.exit(1)
}

const url = `http://localhost:${config.port}/gsi`
const matchid = String(7_000_000_000 + Math.floor(Math.random() * 1e9))

let clock = from

function payload() {
  const preGame = clock < 0
  // Day/night cycle: starts in daylight, flips every 5 minutes.
  const daytime = preGame || Math.floor(clock / 300) % 2 === 0

  return {
    provider: { name: 'Dota 2', appid: 570, version: 47, timestamp: Math.floor(Date.now() / 1000) },
    map: {
      name: 'start',
      matchid,
      game_time: Math.round(clock + 90),
      clock_time: Math.round(clock),
      daytime,
      nightstalker_night: false,
      game_state: preGame
        ? 'DOTA_GAMERULES_STATE_PRE_GAME'
        : 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      paused: false,
      win_team: 'none',
      customgamename: '',
      radiant_score: 0,
      dire_score: 0
    },
    player: {
      steamid: '76561190000000000',
      name: 'mock',
      activity: 'playing',
      kills: 0,
      deaths: 0,
      assists: 0,
      last_hits: Math.max(0, Math.floor(clock / 12)),
      denies: 0,
      kill_streak: 0,
      team_name: 'radiant',
      gold: 600,
      gold_reliable: 0,
      gold_unreliable: 600,
      gpm: 350,
      xpm: 420
    },
    auth: { token: config.gsiToken }
  }
}

/** Real recorded payloads, with the token swapped for the current one. */
function loadRecording() {
  const file = join(dataDir, 'recorded.jsonl')

  if (!existsSync(file)) {
    console.error(`No recording at ${file}.`)
    console.error('Record a match first: tray → "Record payloads (diagnostics)".')
    process.exit(1)
  }

  const frames = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        // The recorded token may be from another session; use the current one.
        return [{ ...JSON.parse(line), auth: { token: config.gsiToken } }]
      } catch {
        return []
      }
    })

  if (frames.length === 0) {
    console.error('The recording contains no readable payloads.')
    process.exit(1)
  }

  return frames
}

const TICK_MS = 100

const send = async (body) => {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch (err) {
    console.error(`Send failed: ${err.message}. Is the app running?`)
  }
}

if (replay) {
  const frames = loadRecording()
  let i = 0

  console.log(`Replaying ${frames.length} recorded payloads to ${url} (${speed}x)`)
  console.log('Ctrl+C to stop.')

  setInterval(() => {
    void send(frames[i])
    // Looping: you can leave it running while adjusting the interface.
    i = (i + 1) % frames.length
  }, TICK_MS / speed)
} else {
  console.log(`Sending to ${url} (match ${matchid}, ${speed}x, starting at ${from}s)`)
  console.log('Ctrl+C to stop.')

  setInterval(() => {
    clock += (TICK_MS / 1000) * speed
    void send(payload())
  }, TICK_MS)
}
