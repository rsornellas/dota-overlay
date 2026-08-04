# dota-overlay

A real-time overlay for Dota 2, built on Valve's **official Game State
Integration**.

On top of the game it shows the map timers (runes, Roshan, Aegis, Tormentor,
neutral items, day/night), calls them out by voice and by an on-screen flash
when it is time to pull or head up for a rune, and tracks the last known
position of enemies you have already seen.

**In a hurry?** Jump to [Setup](#setup) — five steps, and the GSI file writes
itself.

---

## Why this is not cheating

1. **Nothing is injected into the game.** No memory reading, no DirectX
   hooking, no modified game files. Dota itself sends the data: GSI is a
   feature Valve built and documented, and the game POSTs to `127.0.0.1` of its
   own accord.

2. **It is the same technology professional broadcasts use.** GSI is what feeds
   tournament observers and scoreboards.

3. **We only show what the game already gave you.** Every timer derives from
   `map.clock_time` — the clock on your HUD. Arithmetic that professional
   players do in their heads.

4. **Valve applies the fog of war itself.** While you play, GSI hands over your
   hero's data and the positions you can already see — nothing more. An enemy
   in the fog simply does not appear in the payload (real measurement under
   [Enemy tracker](#enemy-tracker)). You could not snoop even if you wanted to:
   the information never reaches us.

> **Golden rule of this project:** if a feature would reveal something you could
> not see by playing normally, it does not ship.
>
> A Roshan timer ships — you saw the kill and noted it down. The enemy tracker
> ships — it only remembers positions that already crossed your screen. An
> enemy's position inside the fog, never.

The Roshan timer is **manual** for exactly that reason: GSI does not report
when he dies. You press a shortcut, like typing "rosh 12:30" in team chat.

---

## Setup

Five steps, once. Steps 1 and 2 are the app; steps 3 to 5 are Dota.

### 1. Get the app

**Option A — the .exe (recommended).** Build the executables once:

```bash
npm install
npm run dist
```

Two files land in `release/`:

| File                              | What it is                                          |
| --------------------------------- | --------------------------------------------------- |
| `Dota Overlay Setup 0.1.0.exe`    | Installer: creates desktop and Start menu shortcuts |
| `Dota Overlay 0.1.0 portable.exe` | Single file, installs nothing — just double-click   |

Once installed, it starts like any other program: from the shortcut. There is
no console window; it lives in the **clock icon in the system tray** (near the
Windows clock, possibly hidden behind the `^` arrow). Right-click it to
configure or quit.

> The first time, Windows may show a blue SmartScreen warning, because the
> executable is not code-signed (a certificate costs money and only makes sense
> for public distribution). Click **"More info" → "Run anyway"**.

**Option B — run from source.** For development or testing changes. Needs
**Node 20.19+** (tested on 22.14). Double-click `start.bat`, or:

```bash
npm install
npm run dev
```

Here the console window has to stay open — it is what keeps the app alive.

### 2. Start the app — the GSI file writes itself

There is nothing to configure. On first run the app:

- **finds your Dota installation by itself** — Steam's registry key plus
  `libraryfolders.vdf`, so libraries on other drives are covered. You never
  type a steamapps path;
- generates a random authentication token;
- writes `gamestate_integration_overlay.cfg` into
  `…\dota 2 beta\game\dota\cfg\gamestate_integration\`.

If the folder is write-protected, the overlay shows the exact path and the file
contents so you can create it by hand. If the installation is somewhere
unusual, set `dotaRootOverride` in `config.json` (tray → Open data folder) to
the `dota 2 beta` folder.

### 3. Set Dota 2's launch options in Steam

Steam → right-click **Dota 2** → **Properties** → **Launch Options**:

```
-gamestateintegration
```

That single flag is all this app needs. It is what makes Dota POST its state to
`127.0.0.1`.

> **Why not `-console -condebug` too?**
>
> You will see other overlays ask for those. They need them because they also
> read Dota's console log file to get data GSI does not expose. This project
> reads **only** GSI, so those flags would add nothing here — and `-condebug`
> makes Dota continuously append to a `console.log` that grows all match.
>
> Keeping them does no harm if you already use them for something else. Just
> do not add them on this project's account.

### 4. Set Dota to "Fullscreen Windowed"

Dota → Settings → Video → **Fullscreen Windowed** (borderless).

In exclusive fullscreen, Windows hands the entire screen to the game and **no**
overlay can draw over it without injecting. Since we inject nothing, this is
the only way. Every honest overlay has the same requirement.

### 5. Restart Dota, then start a game

The cfg is only read when Dota launches, so restart it if it was already open.
Then simply start a match with the app running.

### Did it work?

Watch the clock widget in the top-right corner:

| What you see                       | What it means                                     |
| ---------------------------------- | ------------------------------------------------- |
| Nothing at all                     | Dota is in exclusive fullscreen (step 4)          |
| "Waiting for Dota 2…"              | Launch option missing, or Dota not restarted      |
| "Connected"                        | GSI is flowing; timers appear when the match does |
| A running clock and the timer list | Everything works                                  |

The tray icon's tooltip says the same thing, and its first menu line is the
current status.

---

## Shortcuts

They work with Dota focused (these are global Windows shortcuts and do not
interfere with the game).

| Shortcut           | What it does                                           |
| ------------------ | ------------------------------------------------------ |
| `Ctrl+Alt+R`       | Roshan died now → starts the 8–11 min window           |
| `Ctrl+Alt+A`       | Aegis picked up now → counts 5 min                     |
| `Ctrl+Alt+T`       | Tormentor died now → counts 10 min                     |
| `Ctrl+Alt+X`       | Clears the marks                                       |
| `Ctrl+Alt+P`       | Edit layout (drag the widgets)                         |
| `Esc`              | Leaves layout editing                                  |
| `Ctrl+Alt+H`       | Hides the panels — visual alerts keep firing           |
| `Ctrl+Alt+Shift+H` | Suspends everything, hides the window (emergency exit) |

Marks are saved to disk along with the `matchid`: if the overlay closes
mid-match, the Roshan timer comes back when it reopens. Change match and they
are discarded.

Everything else lives in the tray icon (the overlay has no title bar).

---

## Customisable layout

`Ctrl+Alt+P` enters edit mode: every block grows a handle and can be dragged
wherever you want. `Esc` or `Ctrl+Alt+P` again finishes.

The blocks are independent: **Clock**, **Timers**, **Roshan & Aegis**, **Enemy
tracker**, **Visual alerts** and **Status**. Any of them can be turned off from
the tray menu → Widgets.

Positions live in `%APPDATA%\dota-overlay\config.json`, outside the install
folder — which is why they **survive reinstalling or updating the app**. If you
switch monitors or lower the resolution, widgets that would end up off-screen
are brought back automatically.

With two monitors, pick which one the overlay uses from the tray menu →
Display.

> In edit mode the window covers the whole screen and captures clicks — the one
> moment it is not click-through. That is why `Esc` always exits, without
> depending on you hitting any button.

---

## Visual alerts

A big, brief flash at the top centre of the screen when it is time to **pull**
or to **head up for a rune**.

**They keep showing with the panels hidden** (`Ctrl+Alt+H`). That is the point
of the feature: you can play with a completely clean screen and still be
reminded of the two things most easily forgotten.

Hence `Ctrl+Alt+H` hides the _panels_, not the window. To make everything
disappear, alerts included, use `Ctrl+Alt+Shift+H` (suspend) — which doubles as
the emergency exit if click-through fails on your machine and the window starts
swallowing clicks.

Enabled by default: **pull**, the three **runes** and **lotus**. A flash is far
more intrusive than speech, so the bar here is higher. Stack, for example,
would flash once a minute for the whole match; it ships disabled.

Lotus alerts fire 6 times (3:00, 6:00, 9:00, 12:00, 15:00, 18:00) and then stop
— see [About lotus](#about-lotus).

Turn the whole thing on or off: tray → Visual alerts. To customise, edit
`notify` in `config.json` — same shape as `voice`, plus `durationMs`:

```json
"notify": {
  "enabled": true,
  "durationMs": 2500,
  "cues": {
    "pull": { "enabled": true, "phrase": "PULL", "lead": 5 }
  }
}
```

The **Visual alerts** widget is draggable like the rest (`Ctrl+Alt+P`). While
editing it shows a sample, so you can position it without waiting for an event.

---

## Voice alerts

The overlay speaks its callouts using the Windows speech synthesiser. Nothing
is downloaded, and nothing fires outside a match or while the game is paused.

Enabled by default: **stack**, **pull**, the three **runes** and **lotus**. The
rest (Roshan, Aegis, Tormentor, day/night) ships quiet so the overlay does not
turn into constant chatter.

One deliberate detail: speech is independent of the panel. You can hear the
stack callout without jungle timers taking up space on screen.

To customise, edit `voice` in `config.json`:

```json
"voice": {
  "enabled": true,
  "rate": 1.15,
  "volume": 0.8,
  "cues": {
    "bounty": { "enabled": true, "phrase": "Bounty", "lead": 15 }
  }
}
```

`phrase` is what gets spoken (empty = falls back to the timer name) and `lead`
is the warning time in seconds. Toggle everything at once: tray → Voice alerts.

> **Save `config.json` as UTF-8.** The file may contain accented characters;
> saving as ANSI turns them into garbage. Modern Notepad already defaults to
> UTF-8, and the app strips a BOM by itself. Avoid manipulating the file with
> PowerShell 5.1: `Get-Content` reads it as Windows-1252 and mangles accents on
> every pass.

### How new defaults reach you

`config.json` stores **every** cue, so a stored value would always beat a new
default — enabling lotus in an update would have no effect for anyone already
using the app.

That is what `configVersion` is for. When it goes up, voice and visual cues
reset to the new version's defaults. **Token, widget positions, display,
opacity and the master switches are preserved** — only the cues are reseeded.

---

## Enemy tracker

Keeps the last known position of every enemy hero. Solid = visible now; faded
with a counter = where you last saw them, and how long ago.

### Why this is not cheating

Because **Valve filters the data by your vision before sending it**. That is
not an assumption: it was measured on a real match recorded with this app.

| Heroes             | Frames with a position |
| ------------------ | ---------------------- |
| My team (5 heroes) | 259 of 259             |
| Enemy team         | 28 of 259              |

Enemies only appear in the payload during the moments they were visible on your
minimap. The game **never** says where someone is inside the fog.

What the overlay does is remember what you already saw — like typing "mid miss"
in chat. No new information is revealed, and nothing is injected into the game:
the data comes from official GSI, same as the timers.

This differs from how commercial tools do it: they use screen capture plus
computer vision to read the icons drawn on your screen. None of that here.

### Details

- The background is a **schematic** of the map (diagonal river, lanes, bases),
  not Dota's art — nothing is downloaded or read from the game's files.
- Heroes appear as short tags: `SK`, `WD`, `JUG`. Portraits would mean
  extracting images from the game; left for later.
- A ghost disappears after 2 minutes: a stale position hurts more than it helps.
- The blue dot is you.

### Checking for yourself

The cfg requests every GSI block, including the spectator-only ones. Asking
grants nothing: whatever Valve does not expose simply never arrives.

1. Tray → **Record payloads (diagnostics)**
2. Join a match and play for a few minutes
3. Turn recording off and run `npm run inspect`

The report shows exactly which blocks Dota sent. With a recording on the
machine, `npm test` also replays the tracker against it
([`minimap.replay.test.ts`](src/shared/minimap.replay.test.ts)) — tests with
invented data prove the logic is coherent, the replay proves the assumptions
about Valve's format are right.

---

## About lotus

The pool gains **one** lotus every 3 minutes, capped at **6** — 18 minutes to
fill. So the alert fires at 3:00, 6:00, 9:00, 12:00, 15:00 and 18:00, and then
**stops on purpose**.

After those 18 minutes, a new lotus only grows when someone harvests one. GSI
does not report how many are in the pool — the `minimap` block carries the
position of both pools, but no counter. Continuing to alert every 3 minutes
would be guesswork dressed up as information, so the overlay stays quiet.

If Valve ever starts exposing the pool state, `npm run inspect` will show it —
the same route that settled the enemy tracker.

---

## Validating the timings

**This is the most important step after a gameplay patch.**

Every number lives in a single file:
[`src/shared/timings.ts`](src/shared/timings.ts), with the reference patch noted
at the top (currently **7.41d**).

Entries flagged `unverified: true` came from secondary sources that contradicted
each other and have **not been confirmed in game**. The overlay shows a discreet
`?` next to them. Today those are: Wisdom shrine, Tormentor and the neutral item
tiers.

Lotus left that list: two independent sources agree on the 180 s interval and
the cap of 6 (see [About lotus](#about-lotus)). It still lacks direct in-game
observation — if you notice a discrepancy, the value is in `timings.ts`.

To check:

1. Create a bot lobby (fast and risk-free).
2. Leave the overlay open and compare each event against the game clock.
3. Fix the value in `timings.ts` and drop the `unverified` flag.
4. `npm test` — the scheduling logic is covered by tests.

---

## Development

```bash
npm run dev        # app in development mode
npm test           # 155 tests (timers, alerts, tracker, widgets, VDF, server, store, UI)
npm run inspect    # report on the recorded payloads
npm run typecheck
npm run build      # compiles to out/
npm run dist       # compiles and produces the .exe files in release/
npm run icons      # regenerates build/tray.png, icon.png and icon.ico
```

Icons are drawn in code by
[`scripts/make-icon.mjs`](scripts/make-icon.mjs) — PNG and ICO assembled by hand
with `zlib`, no image library involved. To change the drawing, edit the
`sample()` function and run `npm run icons`.

### Working without launching Dota

The mock pretends to be the game, sending GSI payloads with the clock running:

```bash
npm run mock                 # starts in pre-game, real time
npm run mock -- --from 800   # starts at 13:20
npm run mock -- --speed 20   # 20x faster, to see many events
npm run mock -- --replay     # replays a real recording, tracker included
```

You can build and tune the whole UI without entering a match.

Synthetic mode only sends `provider`, `map` and `player` — enough for timers and
alerts, but nothing more. `npm run inspect` recognises a recording that came
from the mock and warns you, so it is never mistaken for real game data.

---

## Structure

```
src/
├─ shared/          pure, shared, testable logic
│  ├─ timings.ts    ★ the single source of patch numbers
│  ├─ schedule.ts   ★ (clock, marks) → upcoming events
│  ├─ cues.ts       ★ (events, config, already fired) → what to announce now
│  ├─ voice.ts      speech configuration and defaults
│  ├─ notify.ts     visual alert configuration and defaults
│  ├─ minimap.ts    ★ (sightings, ghosts) → where the enemies are
│  ├─ widgets.ts    default positions and on-screen clamping
│  └─ gsi-types.ts  types for Dota's payload
├─ main/            Electron process
│  ├─ gsi-server.ts HTTP server receiving the POSTs
│  ├─ dota-path.ts  installation discovery (registry + VDF)
│  ├─ gsi-config.ts cfg installation
│  ├─ store.ts      settings and session in %APPDATA%
│  └─ overlay-window.ts  transparent, click-through window
└─ renderer/        React UI
```

`schedule.ts` and `cues.ts` are pure functions: no `Date.now()`, no global
state, no I/O. That is what makes it possible to test every timing and every
alert without launching the game. Speech and visual alerts share the same
`dueCues` — only the presentation differs.

---

## Troubleshooting

**The overlay does not appear over the game.**
Dota is in exclusive fullscreen — [step 4](#4-set-dota-to-fullscreen-windowed).

**"Waiting for Dota 2…" even with the game open.**
The `-gamestateintegration` launch option is missing
([step 3](#3-set-dota-2s-launch-options-in-steam)), or Dota was not restarted
after the cfg was written ([step 5](#5-restart-dota-then-start-a-game)).

**"Dota 2 not found".**
Automatic detection missed your installation. Open `config.json` (tray → Open
data folder) and set `dotaRootOverride` to the `dota 2 beta` folder, for
example:

```json
"dotaRootOverride": "D:\\SteamLibrary\\steamapps\\common\\dota 2 beta"
```

**Could not write the cfg.**
The Steam folder is protected. The overlay shows the exact path and the file
contents so you can create it by hand.

**Clicks do not pass through the panel.**
Hardware acceleration has been known to fight click-through on transparent
Windows windows. Run with:

```bash
$env:DOTA_OVERLAY_NO_HWACCEL = "1"; npm run dev
```

If it makes the desktop unusable, `Ctrl+Alt+Shift+H` suspends the overlay
immediately.

**The shortcuts do nothing.**
Another app already registered the combination. The overlay reports which ones
failed.

---

## Security

- The server listens **only on `127.0.0.1`** — nothing leaves the machine.
- Every payload is validated against a locally generated random token
  (constant-time comparison).
- No network requests, no telemetry, no accounts.
- The token and your settings live in `%APPDATA%\dota-overlay\`, **outside the
  repository**. Nothing personal is version-controlled.

---

## License

[MIT](LICENSE).

This project is not affiliated with Valve. Dota 2 is a trademark of Valve
Corporation.
