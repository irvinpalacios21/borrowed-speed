# Agent guide for Borrowed Speed

This file applies to the whole project. Read it before changing code, then follow the links for the area you are working on. Keep it current when commands, module responsibilities, or game rules change.

## Purpose and scope

Borrowed Speed is a playable browser racing game inspired by Five Miles to Go. The player accelerates automatically and uses lateral steering, drafting, braking, and the timing of a slingshot pass to improve their finish.

A season has sixteen fictional drivers, eight two-driver teams, and ten straight-track races. The player chooses one driver before the season starts and keeps that driver throughout. Individual results produce both driver and team championships. Local saves, JSON backups, completed-season archives, points history, and career records support continued play.

The game uses an original, tuned physics approximation. Exact parity with the reference Flash game has not been established. All drivers share the same engine and physical rules. Teammates influence opponent decisions, not car performance.

This is a client-side TypeScript application built with Vite, browser DOM controls, a 2D canvas, and Web Audio. There is no backend, account system, or hosted runtime dependency. Fonts and audio ship with the app.

## Start here

- [README.md](README.md) explains playing, controls, season rules, saves, and local development.
- [CONTEXT.md](CONTEXT.md) defines domain language. Use "racing line" for lateral paths, "position" for race rank, and "drafting train" for linked cars. Keep this file a glossary rather than implementation notes.
- [docs/design-brief.md](docs/design-brief.md) records the intended experience and current scope.
- [docs/implementation.md](docs/implementation.md) explains physics, opponent behavior, persistence, and rendering decisions. Check the current code before relying on numerical values or test counts in prose.
- [docs/visuals/game-mechanics.html](docs/visuals/game-mechanics.html) is an interactive mechanics and balance atlas. Its sliders affect the explanation only. [docs/visuals/game-mechanics.src.html](docs/visuals/game-mechanics.src.html) is the companion source. The atlas is a snapshot, so verify its tuning values and source line references against the code.
- [docs/reference-research.md](docs/reference-research.md) records research into the reference game. [docs/audio.md](docs/audio.md) records audio behavior and selection.

## Run locally

Use Node.js 22.12 or newer and npm. The project uses ES modules and commits `package-lock.json`.

```sh
npm ci
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`. `npm ci` is for installing dependencies from the lockfile, not a prerequisite for every edit when dependencies are already installed.

| Command | Purpose |
| --- | --- |
| `npm test` | Run Node tests through `tsx` for simulation, season, saves, and wind. |
| `npm run build` | Type-check source and tests with `tsc --noEmit`, then build with Vite into `dist/`. |
| `npm run test:browser` | Run the Playwright browser suite. |
| `npm run preview` | Serve the production build locally after building. |

Playwright uses installed Google Chrome, one worker, and port 5173. It starts Vite with `--strictPort` or reuses an existing server at that address. Make sure a reused server belongs to this project. Configuration lives in [playwright.config.ts](playwright.config.ts). There is no configured lint script.

## Code map

| Area | File and responsibility |
| --- | --- |
| Entry point | [index.html](index.html) loads [src/main.ts](src/main.ts), which creates the DOM, owns app state and views, connects controls, runs the frame loop, saves progress, and advances races. |
| Layout and styling | [src/style.css](src/style.css) controls the responsive interface. |
| Physics tuning | [src/game/config.ts](src/game/config.ts) defines `RaceConfig`, `DEFAULT_CONFIG`, unit conversions, `FIXED_STEP`, and baseline racing lines. Scheduled events override the default race distance. |
| Race engine | [src/game/simulation.ts](src/game/simulation.ts) defines `RaceSimulation`, cars, phases, seeded opponent decisions, draft links, pushing, slingshots, braking restrictions, spacing, finish times, and checkpoints. |
| Wind | [src/game/wind.ts](src/game/wind.ts) generates seeded course sections, samples weather by distance, and computes exposed-speed and drafting effects. Wake geometry and shelter links live in the simulation. |
| Entrants | [src/game/teams.ts](src/game/teams.ts) defines stable driver and team IDs, numbers, colors, seats, and teammate lookup. |
| Championship | [src/game/season.ts](src/game/season.ts) defines the calendar, points, driver selection, result validation, standings, tie-breaks, starting grids, and legacy season format. |
| Full-game saves | [src/game/save.ts](src/game/save.ts) defines the `GameSave` envelope, backup validation, season archives, career totals, and race podiums. Browser storage and file-import controls are connected in `src/main.ts`. |
| History data | [src/game/history.ts](src/game/history.ts) derives cumulative points and championship positions from results. |
| Charts and records UI | [src/points-history.ts](src/points-history.ts) renders interactive history charts. [src/record-book.ts](src/record-book.ts) renders archives and career records. |
| Race drawing | [src/game/renderer.ts](src/game/renderer.ts) defines `RaceRenderer` for the camera, scenery, cars, wakes, links, and track feedback. [src/game/settings.ts](src/game/settings.ts) supplies the four scenery palettes. |
| Audio | [src/game/audio.ts](src/game/audio.ts) defines `RaceAudio`, independent music and effects controls, lazy asset loading, synthesized fallback, and pause/focus fades. [public/audio/README.md](public/audio/README.md) records asset provenance and licenses. |

Keep gameplay rules in the simulation and championship modules. Renderer, chart, and record-book code should consume game state. Keep DOM events, browser storage, and file downloads in the application layer rather than adding browser dependencies to the simulation.

## Runtime and state flow

1. `src/main.ts` loads and validates a full game save, falls back to a compatible legacy season, or creates a new game. Driver selection locks when the season starts.
2. `makeSimulation` supplies the scheduled distance, selected driver, starting grid, setting, and wind course. Event and saved season seeds determine repeatable conditions and opponent decisions.
3. `requestAnimationFrame` draws the game while an accumulator advances physics with `FIXED_STEP`, currently 1/120 second. UI refreshes and autosaves use their own intervals.
4. Simulation phases are `ready`, `countdown`, `racing`, `finishing`, `paused`, and `finished`. After the player crosses, the remaining field runs at four times viewing speed. Scoring waits for every driver to finish.
5. Completed results feed standings, history, and archives. Standings are derived from race results, not independently stored totals.

Distances and car dimensions use meters, speeds use meters per second, and time uses seconds internally. Convert to miles and mph for display. Positive lateral movement and positive crosswind point down the screen. Numeric `Car.id` values identify cars within the simulation array and its links. String driver IDs identify entrants across grids, results, and saves. Do not substitute a grid rank for a car ID.

## Rules to preserve

- A follower builds closing speed in a wake. Close followers can push a train. An exposed leader receives no slipstream bonus merely because a distant follower has a draft link.
- A slingshot carries actual approach speed when a car steers out before latching. Pulling out grants no fresh boost. Latching spends the approach, and braking spends carried momentum.
- Player and AI cars may brake only when no close follower occupies the same physical path. Check physical proximity and body overlap rather than treating every draft link as a braking blocker. Re-evaluate permission after steering each step.
- Cars respect occupied space. Preserve lateral blocking, longitudinal separation, and finish order based on crossing times.
- Wind is seeded and sampled at each car's course distance. Crosswind shifts shelter downwind and can carry a wake beyond the road edge. Wind does not steer the player. Simulations without an explicit course default to calm air.
- Scenery settings are cosmetic. The camera follows the player at a steady scale rather than zooming to fit a separating field. Offscreen cars continue racing.
- The first grid is a saved seeded draw. Later grids reverse individual driver championship standings, including tie-breaks. Restarting retains the grid and opponent seed.
- Score complete, unique, ordered sixteen-driver results in scheduled event order. Keep repeated identical scoring idempotent and reject replacement or skipped results. Team points combine both teammates.
- Pause, focus loss, view changes, restart, and canceled pointer input must handle held controls consistently. Opening Season during play pauses the race. Returning leaves it paused, and race shortcuts stay inactive in other views.
- Sound and music begin off on reload and require a user gesture. Preserve their independent controls and focus/pause behavior.

## Save compatibility

The name Borrowed Speed replaced an earlier Slipstream name. Existing storage keys intentionally retain that name:

| Key | Role |
| --- | --- |
| `slipstream-game-v1` | Current full game, optional race checkpoint, and archived seasons. |
| `slipstream-season-v2` | Legacy sixteen-driver season migration and compatibility copy. |
| `slipstream-season-v1` | Older eight-car save. Leave it untouched. |

Preserve stable roster IDs and validate backups completely before replacing current state. Invalid imports must leave the game unchanged. Unreadable stored saves remain intact. Storage failures should leave in-memory play and backup downloads usable.

Checkpoints must retain dynamic car state, opponent random state, countdown, elapsed time, and finish data needed for deterministic continuation. Restore validates before mutation and opens paused with held inputs cleared. When adding dynamic state, review `snapshot`, `restore`, and backwards compatibility together. Existing checkpoints can omit the later AI braking fields.

Completed seasons archive once by season ID. Career totals must not count the current season twice when it also appears in archives. Championships count only after the complete season. Roster, schedule, points, and physics changes can affect saved games because saves do not freeze the entire game configuration. Consider those consequences when changing them.

## Verification by change

Choose checks that exercise the changed behavior. For gameplay or application changes, run `npm test` and `npm run build`, then relevant browser specs. Use the full browser suite when changes cross several views or race lifecycle states. Documentation-only changes need path and command verification rather than a full gameplay run.

| Change | Relevant checks |
| --- | --- |
| Drafting, momentum, braking, collisions, opponent tactics | [tests/simulation.test.ts](tests/simulation.test.ts), browser `slingshot.spec.ts`, `braking.spec.ts`, and `race.spec.ts`. |
| Wind, wakes, shelter | [tests/wind.test.ts](tests/wind.test.ts), browser `wind.spec.ts`, and simulation regressions. |
| Calendar, grids, scoring, standings, history | [tests/season.test.ts](tests/season.test.ts), browser `race.spec.ts` and `history.spec.ts`. |
| Checkpoints, backups, archives, careers | [tests/save.test.ts](tests/save.test.ts), browser `saves.spec.ts`, plus season tests when formats or results change. |
| Camera, layout, controls, view navigation | Browser `camera.spec.ts`, `interface.spec.ts`, `race.spec.ts`, and `braking.spec.ts` as applicable. Check desktop and narrow phone layouts. |
| Sound or music | Browser `audio.spec.ts`, which measures actual Web Audio output and failure handling. |

Browser specs live in [tests/browser](tests/browser). For example, run `npm run test:browser -- tests/browser/saves.spec.ts` for save behavior. Browser tests use Playwright's controlled clock and, where needed, capture simulation instances by intercepting existing methods. Follow those patterns rather than adding a production debug API. Node scenarios step `RaceSimulation` directly with `FIXED_STEP`; keep seeded scenarios repeatable.

## Working conventions

- Match the existing strict TypeScript and ES module style. Local imports use explicit `.ts` extensions and type-only imports where appropriate. This project has no UI framework.
- Use seeded randomness for race decisions and weather. Keep simulation outcomes independent of display refresh rate and browser timing.
- Update the README and implementation notes when player behavior or architecture changes. Use the glossary for resolved domain terms rather than duplicating implementation details there.
- Record source and license information in `public/audio/README.md` when adding audio. Preserve bundled asset credits.
- Edit source files rather than generated output. `dist/`, `node_modules/`, `test-results/`, `playwright-report/`, and `.local/` are ignored artifacts or local tooling. Browser screenshots go under `.local/screenshots/`.
- For RRSS GitHub work, use `C:\Users\ipalacios\Projects` as the clone root.
