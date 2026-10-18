# Borrowed Speed

*Use their speed. Take their place.*

A playable drafting race inspired by Five Miles to Go.

Sixteen fictional drivers represent eight teams in a ten-race season. Pick one driver before the opening race; that choice stays locked for the season. Every driver has the same engine and physical rules. Following cars build closing speed in a wake. Close followers push a train forward; its exposed leader receives no slipstream bonus. Pull out during an approach to carry that speed into a slingshot pass.

Each event has a fixed distance between 6 and 10 miles and a coastal, desert, forest, or night setting. The track stays straight.

## Play locally

Requires Node.js 22.12 or newer. Development was verified with Node.js 24.18.

    npm ci
    npm run dev -- --port 5173

Open [the game](http://127.0.0.1:5173/). Keep the terminal running while playing.

| Control                   | Action                                         |
| ------------------------- | ---------------------------------------------- |
| Up / Down or W / S        | Steer across the track                         |
| Left Arrow                | Hold to brake gradually; release to accelerate |
| Space or Escape           | Pause or resume                                |
| R                         | Restart the current uncompleted race           |
| On-screen driving buttons | Hold to steer or brake on a phone or tablet    |

Braking lets you drop behind a car traveling at the same speed and then steer into its wake. Both you and the AI may brake only when no close follower is behind in the same physical path. Solo cars and train tails can brake; closely followed leaders and middle cars must pull clear first. A distant car or a car in another racing line does not block the brake. The HUD explains Car close behind · braking unavailable, and the touch brake shows Blocked.

Steering and braking can be held together. A held brake takes effect as soon as you pull clear and stops braking if a follower closes behind. Releasing the brake resumes automatic acceleration. Braking lights identify cars that are actively slowing. AI tail cars sometimes make a short drop-back to rebuild an approach, then release the brake; they use the same restriction and braking strength as you.

The game pauses when the window loses focus or the Season view opens during a race. **Season standings** opens a separate view for drivers, teams, points history, and the calendar. **Back to race** returns to the same race, still paused. Race shortcuts stay inactive while viewing Season.

Open **Audio** in the compact toolbar, then click **Sound off** to enable the recorded engine loop. Sound is off by default. Engine pitch follows speed. Pausing or finishing silences the mix.

Click **Music off** in Audio to enable "Pixel Sprinter" by Zane Little Music, a looping piano, strings, and chiptune track. Music and engine sounds have separate controls, so the tune can play on its own. Music continues through the menus and results, and fades out when the race pauses or the window loses focus. Both controls start off on reload.

**Full screen** uses the browser's fullscreen mode. Click **Exit full screen** or press Escape to leave it. The race layout, camera, and game settings keep their existing behavior.

See [audio direction and research](docs/audio.md) and [audio credits and licensing](public/audio/README.md).

## Season rules

First through sixteenth earn 25, 22, 20, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2, and 1 points. This is Borrowed Speed's own scoring table. Driver standings count each driver's results. Team standings combine both teammates' points. Ties compare counts of wins, second places, and subsequent finishes, then the most recent finish. Roster order resolves any remaining exact tie.

The opening grid uses a seeded draw saved with the season. Every later grid reverses the individual driver championship ranking. Cars start in two parallel columns across eight rows, with a small stagger to establish their positions. Restarting a race retains its grid and opponent seed.

Teammates prefer useful drafting opportunities with each other and tend to hold a helpful train. They still seek their own finish and use the same speed and spacing rules as everyone else. The player retains full control of their own steering. TM marks your teammate in the field and on the track.

Opponents react when they have a usable slingshot instead of waiting for their next routine racing-line decision. They check whether they can leave the wake before latching, compare the space on both sides, and hold the chosen path briefly. If both exits are occupied, they stay in the wake. This changes their decisions, not their engine or drafting advantage.

All sixteen cars finish before an event is scored. After your finish locks, the rest of the field completes at accelerated viewing speed. Select Next race to continue. Race ten ends with both driver and team champions.

Open **Season standings**, then **Points history** to follow driver or team points across completed races. Switch to **Position** to see where competitors passed each other in the championship. Hover or tap a race, or use the race selector, to inspect points earned, cumulative totals, and position changes. Select a name in the table to highlight its line. Team colors and dashed second-driver lines match the roster. History works with existing saved seasons.

## Saves

The current race, driver choice, opening draw, completed results, and record book save automatically in this browser on this device. During a race, the game saves every three seconds, and also saves when you pause, open another view, or leave the page. Reloading resumes an unfinished race from its saved time and positions, paused until you select **Resume race**. If no race is in progress, the next uncompleted race is ready to start.

Open **Saves** for **Save game**, **Download backup**, and **Restore a backup**. A downloaded JSON file contains the current race and the whole record book, so you can keep a separate copy or move your game to another browser or device. Restoring shows a preview before replacing your current game. Invalid files leave your game unchanged. Browser storage failures appear in Saves; downloading a backup still works.

After race ten, the completed season is automatically added to **Record book**. Starting another season unlocks driver selection and preserves every archived season. Browse final driver and team standings, champions, and the first three finishers in every race. **Driver careers** tracks titles, wins, podiums, starts, and points across seasons. **Team careers** tracks team titles and combines both drivers' race statistics. A podium means a top-three race finish. Completed races in the current season count toward career totals; titles are awarded only when all ten races are complete.

Borrowed Speed keeps the original browser storage keys so existing saves continue to load after the rename. The full game uses slipstream-game-v1. Existing sixteen-driver saves under slipstream-season-v2 migrate automatically, including a completed season, and a compatibility copy stays available under that key. The previous eight-car save remains untouched under its original key. It cannot be continued as a sixteen-driver championship. New backups use borrowed-speed-season filenames; backups downloaded before the rename can still be restored. Saves are local to this browser unless you download a backup.

The camera follows your driver at a steady scale with consistent car proportions. Distant cars can leave the view and keep racing; the ahead/behind counts and standings track them.

## Drafting feedback

Teal dotted connections show your train. Front/rear indicators show links; the train count and speed-gain meter show their benefit. The closing-speed readout compares your speed to the car ahead. A connection alone does not push the leader; followers must close onto the train first. A leader's speed gain is labeled Push.

The slingshot indicator shows Building a run while you approach. Pull out now turns gold when your actual closing speed offers a passing opportunity and a side is clear. A small bar beside your car shows the same opportunity, then fades as you carry your momentum outside the wake. Pulling out grants no extra speed.

If you reach the bumper, Latched · run spent means you have settled at the train's pace. Sitting second in a train does not store a boost. Hold the brake briefly to drop back, release it to rebuild an approach, and steer out before latching again. Braking spends carried momentum. Pausing freezes it.

Teammate linked identifies a front or rear connection with your teammate. Car alongside means another car is blocking the requested steering move. Opponents follow the same approach, latching, pushing, and momentum rules.

## Develop and verify

    npm test
    npm run build
    npm run test:browser

Browser tests use an installed Google Chrome and start or reuse the local server on port 5173. The production build is in dist; npm run preview serves it locally.

TypeScript, Vite, and the browser's 2D canvas provide the app foundation. Physics runs at 120 updates per second, independently of display refresh rate. Fonts ship with the app. No account or hosted runtime service is required.

## Project map

Open the [interactive mechanics and balance atlas](docs/visuals/game-mechanics.html) for a clickable repo map, drafting diagrams, tuning sliders, and source-linked balance controls. The guide is a self-contained HTML snapshot; its sliders change the explanation only. Its AI pass diagram predates the reactive pass decision described above.

[Balance feedback](docs/balance-feedback.md) tracks playtest observations, proposed experiments, and decisions about race pacing and competitiveness.

- [Race tuning](src/game/config.ts): speeds, drafting, momentum, steering, and dimensions.
- [Teams and drivers](src/game/teams.ts): names, numbers, colors, and affiliations.
- [Season](src/game/season.ts): calendar, driver selection, grids, points, tie-breaks, results, and save validation.
- [History](src/game/history.ts) and [points charts](src/points-history.ts): race-by-race championship totals, positions, and interactive charts.
- [Game saves](src/game/save.ts) and [record book](src/record-book.ts): complete game backups, season archives, and career records. Simulation checkpoints are serialized and validated by [simulation](src/game/simulation.ts).
- [Settings](src/game/settings.ts): the four scenery palettes.
- [Simulation](src/game/simulation.ts): drafting, teammate decisions, movement, spacing, and finish order.
- [Renderer](src/game/renderer.ts): scenery, cars, camera, connections, and progress.
- [App](src/main.ts): controls, screens, and season progression.
- [Audio](src/game/audio.ts): the optional engine tone.
- [Implementation notes](docs/implementation.md), [design brief](docs/design-brief.md), [reference research](docs/reference-research.md), and [glossary](CONTEXT.md): project context.

The physics is an original approximation. Exact numerical parity with the Flash game has not been established. Game code, car graphics, and audio are original to this project. Barlow Condensed is bundled through Fontsource under its included open font license.
