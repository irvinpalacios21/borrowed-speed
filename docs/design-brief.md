# Design brief

Borrowed Speed. Use their speed. Take their place.

Status: sixteen drivers, eight teams, and a ten-race season. Preserve the overall Five Miles to Go experience: automatic speed, simple steering, drafting trains, and timed passes.

## Current scope

- Choose one driver at the start; keep that driver for the season.
- Sixteen fictional drivers, two per team, with individual results and combined team points.
- Ten races with preset distances and four scenery settings.
- Opening seeded draw, followed by reverse individual driver championship grids.
- Two parallel starting columns across eight rows.
- Equal engines and physical rules, with opportunistic teammate drafting.
- Following wake benefit, close train pushing, and approach momentum for passes.
- Visible links, train size, push/tow speed gain, closing speed, and a slingshot indicator.
- Saved driver choice and results, with driver and team champions after race ten.
- Keyboard and touch steering and gradual braking, pause, restart before a finish locks, and optional sound.

## Entrants

| Team         | Driver one       | Driver two        |
| ------------ | ---------------- | ----------------- |
| Apex Union   | #12 Luca Moretti | #19 Elena Voss    |
| Copperline   | #28 Mateo Silva  | #31 Freya Lind    |
| Blue Harbor  | #04 Noah Bennett | #42 Hana Park     |
| Violet Works | #61 Amara Okafor | #63 Jules Laurent |
| Ember Racing | #36 Rafael Costa | #38 Zoe Hart      |
| Pinecrest    | #85 Finn Anders  | #87 Leila Haddad  |
| Silverline   | #53 Theo Morgan  | #57 Sora Tanaka   |
| Tideway      | #27 Alex Rivera  | #29 Maya Chen     |

Names are temporary. Saved records use stable IDs.

## Calendar

| Race | Event             | Distance  | Setting |
| ---- | ----------------- | --------- | ------- |
| 1    | Opening run       | 6 miles   | Coastal |
| 2    | Harbor dash       | 7.5 miles | Night   |
| 3    | Copper classic    | 8 miles   | Desert  |
| 4    | Pinecrest sprint  | 6.5 miles | Forest  |
| 5    | Midseason run     | 9 miles   | Night   |
| 6    | Union straight    | 7 miles   | Desert  |
| 7    | Coastal challenge | 8.5 miles | Coastal |
| 8    | Ember dash        | 6 miles   | Desert  |
| 9    | Silverline cup    | 9.5 miles | Forest  |
| 10   | Season finale     | 10 miles  | Night   |

All settings retain the same straight track geometry. Scenery itself does not change physics.

## Championships and grids

Points for first through sixteenth: 25, 22, 20, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1. Both drivers contribute to their team. Equal points use best finishing records, starting with wins, then the latest result.

Race one uses a saved seeded draw because nobody has scored. Every subsequent grid reverses the individual driver ranking. Lowest-ranked drivers start at the front; leaders start at the back. The grid does not use team totals.

## Racing feel

A larger close train should beat a smaller one through its followers' push. An exposed leader receives no automatic slipstream bonus, and distant followers must close up before they can push it. An approaching car builds closing speed in the wake. Pulling out before latching carries that actual speed into a pass as momentum fades. Latching spends the approach and matches the car ahead; a settled second-place car cannot pull out with stored boost. Cars respect occupied space.

Hold Left Arrow to brake gradually and release it to accelerate automatically. Up and Down steer, including while braking. Touch play has separate Up, Brake, and Down buttons. Braking gives equal-speed cars a way to establish a leading and following position before merging into a train.

The player and AI may brake only when there is no close follower in the same physical path. A solo car or train tail can drop back; closely followed leaders and middle cars must pull clear first. AI tails can briefly brake to reset a settled approach. Braking availability is visible in the HUD and touch controls.

Teammates prefer useful opportunities to join or preserve a shared train. They retain their own results and can pass each other. Otherwise, opponents follow neutral race tactics. There are no forced team orders, deliberate sacrifice, or hidden team speed advantages.

Exact strengths, gap tolerance, momentum release, and opponent choices are tuning values. Later changes to track behavior, upgrades, or team performance should follow playtesting.

## Presentation

The race stays central, with a compact event banner and desktop Race, Drivers, and Teams tabs. A collapsible overview supplies full names, team affiliations, both points tables, and the calendar on every screen size.

Cars use their team's color, unique driver numbers, and a second-seat stripe. You identifies the player; TM identifies their teammate. Drafting uses text, numbers, and dotted connections so color is not the only signal.

Coastal water and palms, desert dunes and cacti, forest trees, and a dark floodlit venue distinguish the events. Barlow Condensed supplies the title and instruments; system sans serif supplies controls and tables.

## Architecture and next playtest

Keep simulation, season records, settings, drawing, and input separate in TypeScript. Canvas and Vite keep browser play simple and leave room for an installed app later.

Playtest whether the sixteen-car pack remains readable, teammates help without dominating choices, reverse grids create movement through the field, train size matters, and passing rewards timing.
