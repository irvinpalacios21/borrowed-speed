# Implementation notes

## Application foundation

TypeScript defines the race, driver, team, and season models and compiles to browser JavaScript. Vite builds the app; Canvas draws the race. Simulation and championship records have no dependency on DOM or drawing. The browser frontend can later be packaged as an installed app.

## Simulation and tuning

Distances use meters, speeds meters per second, and time seconds. The interface converts to miles and mph. Physics advances in fixed 1/120-second steps. Bounded frame accumulation prevents a background pause from fast-forwarding active races.

Reciprocal nearest neighbors within 36 meters of bumper gap and the configured alignment form draft links. Each linked component is a train. Only cars with a front link receive the train's aerodynamic benefit. It grows linearly through five cars, then with diminishing returns toward its maximum. An exposed leader always has zero draftBonus and slipstreamBonus.

An approaching follower receives an additional gap-scaled wake target of up to 8 meters per second. At a 2-meter bumper gap it latches, spends its approach momentum, and matches the leading car's pace. Its latch remains until it leaves the wake or drops back beyond 10 meters. It keeps the ordinary tow benefit while latched, without accumulating a slingshot reserve.

At gaps of 0.8 meters or less, a group transfers propulsion by averaging its members' free speed targets. This lets sheltered followers push the exposed cars ahead while accounting for the number of cars being moved. Braking cars cannot contribute to a push. Larger close trains still travel faster. Speed changes remain bounded by acceleration and contact spacing.

On a lateral wake exit, only an unlatched approach with at least 1 meter per second of actual closing speed earns carried momentum. The reserve starts at the car's actual speed above solo pace and decays with a 12-second time constant. Ordinary tow and following targets disappear immediately on exit. Pulling out adds no speed. Latching, braking, and entering another wake spend the reserve. Pause freezes it; restart clears it.

The readiness cue estimates whether the actual reserve can close the distance to clear the car ahead within six seconds, allowing for momentum decay and the front car's current pace. It also checks space to steer out. The same feedback drives AI passing eligibility, the accessible on-track meter, and the small indicator beside the player's car. The meter shows building, ready, blocked, latched, and carrying states; it never fills from waiting in a settled train. These dynamics are included in race checkpoints.

These are game tuning values, not measured aerodynamic coefficients or a CFD simulation. Cars cannot travel through a leader or steer through an occupied space. Finish order uses interpolated crossing times, then numeric car ID for an exact tie.

The player can hold Left Arrow or the touch brake to reduce speed at a configured 3 meters per second per second, about 6.7 mph each second. All cars share the same braking permission: no follower may be within an 8-meter bumper gap and lateral body clearance of car width plus 0.16 meters. This uses actual car positions independently of aerodynamic links. Solo cars and tails can brake; a closely followed leader or middle car cannot. Braking overrides automatic acceleration and draft-related acceleration while held, never reverses the car, and can be combined with lateral steering. Releasing it resumes the normal acceleration model. A long hold can stop a clear car.

Braking permission is re-evaluated after steering each fixed step for the player and every AI car. A held input starts working when the player pulls clear, and stops applying if a follower closes. Rejected input changes neither velocity nor carried momentum. Countdown, pause, and a locked finish ignore it. Pause, focus loss, restart, and pointer cancellation clear held player input. A Braking label, pressed touch button, and rear lights identify active braking. When unavailable, the touch control uses aria-disabled and a Blocked label while remaining available for explaining an attempted input. The draft console reports Car close behind · braking unavailable.

At normal line decisions, settled AI tail cars may initiate a drop-back with a 35 percent chance, an initial stagger, and a 12–20-second attempt cooldown. They hold their wake position while braking for at most 3.5 seconds, release once their bumper gap reaches latch-reset distance plus 2 meters, and resume automatic acceleration. A close follower, loss of the tow, or entering the final 1,000 meters cancels the maneuver. Brake timing is included in race checkpoints; older checkpoints without these fields still restore. Active braking flags are cleared while paused and derived again on resume.

## Drivers, teams, and opponent behavior

teams.ts defines eight stable team IDs and sixteen stable driver IDs. Team metadata supplies color; drivers supply name, unique number, team ID, and seat. The second seat has a white livery stripe. Each simulation car retains its numeric array index as its link ID even when its grid position changes.

The player selects one driver before starting the season. Selection locks immediately and is saved before the first countdown. Pre-season selection previews the car, teammate, and opening-grid position. The player never switches drivers within a season.

Opponents score available racing lines based on draft opportunities, gaps, and space at ordinary decisions, 1.8 to 5.2 seconds apart. A nearby teammate adds a preference for joining or maintaining a helpful train. A ready slingshot interrupts that timer: the opponent checks whether it can leave the wake before latching, evaluates the adjacent racing lines using present clearance and projected traffic at arrival, and commits to the clearer usable exit for at least four seconds. It stays in the wake if neither exit is usable. The pass uses the same earned approach speed and collision rules as a player pass. Teams receive no extra speed, blocking authority, or forced finishing order. Human steering stays under player control.

## Championship and grids

season.ts defines ten preset events and a custom sixteen-place points table: 25, 22, 20, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1.

Driver standings accumulate individual results. Team standings combine both drivers. Both use points, counts of first through sixteenth places, most recent result, then stable roster order. A team's most recent position is its best finish in that event.

The first grid is a deterministic shuffle using the saved season gridSeed. Later grids reverse the complete driver championship ranking, including its tie-breakers. Eight rows use two columns, alternating grid positions between columns. A 0.45-meter stagger within each row establishes a strict starting order.

Per-event opponent randomness combines the event seed and saved season seed. Restarting or reloading an uncompleted race retains that seed, grid, and selected driver.

## Race flow and persistence

Simulation phases are ready, countdown, racing, finishing, paused, and finished. The app additionally displays pre-season selection and season completion. Focus loss and opening the overview pause active play and clear held input.

The player's crossing locks their time and position. The remaining field runs at four times viewing speed until all sixteen drivers cross. Only then can a result score. Results are immutable, complete ordered driver IDs and times. Repeated identical scoring is idempotent; replacing a result or skipping a scheduled event is rejected.

Version two stores playerDriverId, gridSeed, and results at slipstream-season-v2. Validation checks all required fields, driver identity, event order, complete unique fields, and positive finite ordered times. Standings are derived, never stored as separate totals.

The full game envelope at slipstream-game-v1 atomically stores the current season, an optional simulation checkpoint, and completed season archives. Borrowed Speed retains the original storage keys and save format so games and downloaded backups from before the rename remain compatible. New downloads use borrowed-speed-season filenames. Each season has a stable ID and sequence number. The current season is archived once when its tenth result scores; starting another season preserves the archive. An existing version-two season is migrated on load, including a completed season. The version-two key remains a compatibility copy and the previous eight-car version's slipstream-season-v1 key is untouched.

Simulation checkpoints contain every car's dynamic state, finish times, countdown, elapsed time, and opponent random state. Static identity and the starting grid come from the validated season. Restore validates all fields before mutation and always opens paused, retaining the countdown, racing, or field-finishing phase for resume. Held controls are cleared. Deterministic replay tests confirm identical race outcomes after restoring.

Automatic saves run every three seconds during active play, on pause and focus loss, on view changes, and on pagehide. Finished races score before capturing a checkpoint so a page exit cannot drop an unrecorded finish. Restricted storage keeps the game and record book playable in memory with a visible notice. An unreadable stored save is preserved until the user restores a valid backup.

Saves provides explicit save, JSON download, and file restore with a preview before replacement. Backup parsing validates the whole current season, checkpoint, archive identities, and every archived result; an invalid file leaves the existing game intact. Downloads remain available when browser storage fails.

The record book derives final champions using the existing championship tie-breaks. Career records combine each archived season and the current season once, by season ID. Wins and top-three race finishes count after each completed race, while titles count only after ten races. Team career starts, wins, podiums, and points combine both drivers. Archived season views include full driver and team standings and all race podiums.

## Rendering and responsive interface

settings.ts supplies coastal, desert, forest, and night palettes. The renderer adds water and palms, dunes and cacti, trees, or steady floodlights. Settings do not alter physics or opponent decisions.

The camera follows the selected driver at a fixed horizontal anchor, 28 percent of the canvas width. Scale depends only on viewport width and applies equally to progress, lateral positions, car length, and car width. Separating packs cannot change zoom or framing. Distant cars leave the view while the full field continues racing, with ahead/behind counts and standings keeping their positions visible. The player has an outline and You label; their teammate has TM. All cars carry unique numbers and team colors.

Desktop has Race, Drivers, and Teams sidebar views. A separate Season view contains driver standings, team standings, points history, and the calendar, including on phones. Opening Season pauses active play; returning keeps the same race paused until the player resumes. Race shortcuts are inactive in Season. The compact header groups music and effects under Audio and provides browser fullscreen controls. Track dimensions, camera scale, and gameplay settings retain their existing behavior. Held pointer controls supplement keyboard steering.

## Extension points

| Change                                       | Starting point                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Calendar, points, tie-breaks, grids          | src/game/season.ts                                                     |
| Team and driver names, numbers, affiliations | src/game/teams.ts                                                      |
| Setting palettes                             | src/game/settings.ts                                                   |
| Scenery, camera, car livery                  | src/game/renderer.ts                                                   |
| Drafting and momentum tuning                 | src/game/config.ts and trainSpeedBonus in simulation.ts                |
| Teammate and neutral opponent tactics        | chooseLine in src/game/simulation.ts                                   |
| Controller input                             | src/main.ts                                                            |
| Curved tracks                                | Track geometry in the renderer and a separate review of physical rules |

## Verification

Thirty-two simulation and season checks cover sixteen-driver grids and selection, reverse ranking with ties, complete points, combined team totals, valid saves, and all ten actual races. They also check teammate preferences without a physical advantage, identical physics across settings, monotonic train benefits, closing speed, a slingshot pass, spacing, deterministic decisions, pause, and actual full-field finish times. Six braking checks cover gradual slowing and automatic recovery, a same-speed brake-and-merge maneuver, simultaneous steering and braking, stopping without reversing, inactive phases and locked finishes, and full-field spacing under repeated braking.

The race and camera browser checks cover driver selection and locking across reload, pause and restart, a complete race into a saved reverse-grid event, both champions, a fresh season, preservation of the old save, phone controls and overview tabs, and the four settings. Camera regression checks additionally exercise the former 62-meter cutoff, car proportions, offscreen simulation, viewport resizing, and four ninety-second race replays. They confirm a constant player anchor and car size while packs separate. Screenshots are kept in ignored .local/screenshots for visual review.

Two additional browser checks exercise Left Arrow braking without vertical steering, automatic recovery, pause and focus loss, restart, held pointer braking, pointer cancellation, and the three-button layout at 390 and 320 pixels.

Numerical parity with the Flash game and final balance remain playtest work.
