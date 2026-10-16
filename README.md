# Loony Wheels

A 2D physics hill-driving game for iOS. Drive as far as you can across six worlds (including a low-gravity moon), flip for coins, manage fuel, upgrade seven very different vehicles and chase your best distance.

Everything is original: the vehicles, terrain, sprites, music and sound are all generated in code, so there are no third-party art or audio assets.

## Highlights

- **Real 2D rigid-body physics** (planck.js / Box2D): wheel-joint suspension with progressive bump stops, motor and brake torque, traction, weight transfer, and arcade air control.
- **Forgiving by design.** A pedal held from the ground through a jump levels the car for landing; a fresh press in the air spins it (gas = forward, brake = backward). There's also anti-flip assist on big wheelies, and props can never trap the car.
- **Seeded procedural terrain** built from hand-designed pieces (hills, kickers, gaps, bridges, lava pits, rooftops, ice). Every non-ramp segment is slope-checked, so there's always a way forward. Difficulty ramps with distance.
- **Tricks and combos**: flips (double, triple…), big air, long jumps, perfect landings, close calls and wheelies, with a combo multiplier.
- **Daily Challenge**: one seeded course per day, the same for every attempt. It has a rotating world, a loaner car, a distance goal and a once-a-day reward, and you race a ghost replay of your best attempt.
- **Progression**: coins, gems, upgrade tokens, XP and levels, 6 upgrade stats × 10 levels per vehicle, 41 cosmetics, rotating missions, 24 trophies and a 7-day daily reward.
- **Game feel**: interpolated 120 Hz physics, look-ahead camera that frames your landing, trauma-based shake, slow-motion crashes, particles, floating trick text, coins that fly to the HUD, a driver whose head bobs with the car, and haptics.
- **Audio** made entirely with WebAudio: a layered engine whose pitch follows RPM, tire, skid and wind layers, about 25 synthesized sound effects, and a generative soundtrack per world.
- **Offline-first**, with a checksummed save and a backup slot. Corrupted fields are repaired one at a time instead of wiping the save.

## Tech

| | |
|---|---|
| Language | TypeScript (strict) |
| Rendering | Canvas 2D (procedural art baked into sprites; cached `Path2D` terrain) |
| Physics | [planck.js](https://github.com/piqnt/planck.js) |
| UI | DOM overlay (safe-area aware, landscape) |
| Build | Vite |
| Native shell | Capacitor 8 (iOS project in `ios/`, Swift Package Manager, no CocoaPods) |
| Tests | Vitest (unit + headless physics), Playwright (smoke and visual) |

Why this stack: it works on iOS through Capacitor and on the web unchanged. Android is one command away (`npx cap add android`). The game logic also runs headlessly, so physics and balance are tested by simulation.

## Play in the browser (GitHub Pages)

Every push to the default branch runs `.github/workflows/pages.yml`, which typechecks, runs the tests, builds the release game and publishes it to **https://deathangel4290.github.io/Loony/**.

- In **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**. Until then, GitHub also publishes the raw source on every push. The workflow waits for that build and deploys afterwards, so the game still wins.
- On iPhone, open the page in Safari and choose **Share → Add to Home Screen** to play full-screen. A service worker caches the game, so it also works offline after the first load.

## Getting started

```bash
npm install
npm run dev          # http://localhost:5173 (debug tools enabled)
npm test             # unit + physics regression tests
npm run build        # release build -> dist/
```

### iOS

Requires macOS with Xcode 15+.

```bash
npm run ios:sync     # build the web app and copy it into the iOS project
npm run ios:open     # open in Xcode, choose a team, run on a device
```

The iOS app is landscape-only and full-screen with the status bar hidden. It uses the Taptic Engine through `@capacitor/haptics` and native key-value storage through `@capacitor/preferences`. The deployment target is iOS 15; a `roundRect` polyfill covers older WebKit.

### Android (optional)

```bash
npm i -D @capacitor/android && npx cap add android && npx cap sync android
```

## Project structure

```
src/
  App.ts                 app root: main loop, scene switching, pause, lifecycle
  core/                  math, seeded RNG, event bus, pools, polyfills
  data/                  all content and tuning (data-driven)
    vehicles.ts            7 vehicles: physics, trait, engine sound
    upgrades.ts            upgrade stats, costs, effect curves
    worlds.ts              5 worlds: palette, terrain mix, decor, music
    missions.ts achievements.ts cosmetics.ts rewards.ts config.ts
  game/                  gameplay (no DOM; runs headless)
    GameSession.ts         one run: physics world, scoring, collectibles ("LevelManager")
    VehiclePhysics.ts      wheel joints, motors, bump stops, air control, traits
    PlayerController.ts    fuel, damage, crash/end rules
    TerrainGenerator.ts    seeded piece-based terrain + coins/fuel/props/decor
    TerrainManager.ts      streams collision chunks and props around the camera
    TrickSystem.ts         flips, air, wheelies, landings, combos
    CameraController.ts    follow / look-ahead / zoom / shake
    Tutorial.ts            first-run teaching state machine
    Autopilot.ts           bot driver (menu attract mode, balance tests)
    GameView.ts            binds a session to rendering, FX, audio, haptics, HUD state
  render/                Canvas renderers: background, terrain, vehicle art, sprites, particles
  systems/               save, settings, currency, progression, upgrades, garage,
                         worlds, missions, achievements, daily rewards, audio, music,
                         haptics, input, services container
  ui/                    UIManager, screens (menu, garage, vehicles, worlds, missions,
                         trophies, settings, HUD, results), icons, previews
  debug/DebugMenu.ts     developer tools (compiled out of release builds)
tests/                   vitest suites + bot used for balance
tools/sim.ts             headless balance simulator (vehicles × worlds × seeds)
e2e/                     Playwright smoke, visual gallery, perf profile, icon generator
ios/                     Capacitor iOS project
```

## Adding content

All content lives in `src/data`, so adding any of the following needs no engine changes:

- **Vehicle**: append to `VEHICLES` with physics, trait, style and engine sound. For a new silhouette, add a style to `render/VehicleArt.ts`.
- **World**: append to `WORLDS` with a palette, terrain piece weights, decor, props, particles, music and an optional `gravityScale`.
- **Terrain piece**: add an id to `TerrainPieceId`, a `case` in `TerrainGenerator.build()`, and a weight in the worlds that should use it.
- **Mission, trophy or cosmetic**: add an entry to the relevant data file.
- **Feel tuning**: change `data/config.ts` (physics step, camera, tricks, scoring, fuel spacing, crash slow-mo).

## Balance tooling

```bash
npx tsx tools/sim.ts pip hills 5 1        # vehicle, world(s), seeds, upgrade level
npx tsx tools/sim.ts all all 3 4
AIRGAS=1 npx tsx tools/holdgas.ts pip hills 8   # "novice holds gas" survival check
```

## Debug tools

Debug tools are available in `npm run dev` and `npm run build:debug` builds, through the **DBG** button or by tapping the version label in Settings five times. They can:

- add coins, gems, tokens and XP
- unlock all vehicles, worlds and cosmetics, and max out upgrades
- skip 500 m, refuel, spawn fuel or coins, and launch the car
- toggle god mode, the FPS/timing overlay and physics debug drawing
- cycle the time of day and the weather
- restart the run, reset the tutorial, and advance the daily reward

`__DEBUG__` is false in release builds, so the whole module is removed.

## Testing

- `npm test`: save corruption and backup fallback, field sanitizing, economy, missions, daily-reward date logic, level-ups, and headless physics regressions (every vehicle in every world; a novice holding gas survives the tutorial; the starter car runs out of fuel before it crashes).
- `npm run build:debug && npx vite preview` and then `node e2e/smoke.mjs` boots the game in mobile Chromium at iPhone 15 and iPhone SE sizes, plays the first run with real input, walks through every screen, fails on any console or page error, and writes screenshots to `e2e/out/`.
- `node e2e/qa.mjs`: lifecycle QA — backgrounding pauses, save survives reload, out-of-fuel ending, upgrade/vehicle purchases through the real UI, settings persistence, retry.
- `node e2e/gallery.mjs`: one screenshot per world/vehicle pair.
- `node e2e/perf.mjs city vortex high 4`: frame timings with the CPU throttled 4×.

## Future-ready

Services talk through a typed event bus, and the game session has no DOM dependencies, so the following can be added later without touching the core loop:

- leaderboards and ghost races (runs are seeded and deterministic)
- cloud saves (swap the `StorageBackend`)
- events and battle passes (data-driven rewards)
- controller support (`InputManager`)
- monetization: gems already exist as a currency but can only be earned, and nothing is pay-to-win
