# Balance feedback

Use this file to track playtest observations, explanations to check, proposed changes, and decisions. Keep reports separate from conclusions. Add a date, race context, and enough detail to replay an issue when possible. The [design brief](design-brief.md) holds the intended experience; [implementation notes](implementation.md) describe current mechanics.

## Goal

Races should become competitive early, and a player should have a credible path to win through drafting, steering, braking, timing, and choosing when to lead. A lost pack can remain costly, but the field should recognize opportunities to organize a chase. Keep equal engines and physical rules for all drivers. Avoid a speed bonus based only on being behind.

## Open feedback

### BF-001: Quiet opening and fixed rows

- **Reported 2026-10-18.** The two starting columns often hold their order for the first 2 to 3 miles. The player feels responsible for making the first move before AI drivers change the pace or shape of the drafting trains.
- **Desired experience.** AI drivers start competing for useful positions during the opening mile. Early moves have a racing reason and create decisions for the player, rather than random weaving.
- **Current rules to examine.** AI cars first consider a line change 1.5 to 6.5 seconds after the start, then score racing lines every 1.8 to 5.2 seconds. The score favors a nearby car ahead, a car behind, a linked teammate, and staying near the current line. A ready slingshot can interrupt this timer. Tail cars sometimes brake to rebuild an approach. These rules may favor staying in two settled trains once the first approaches have latched.
- **Ideas to test.** Give AI drivers an explicit reason to challenge a settled train early, such as preparing a run while an exit is still open. Let leaders consider a threat from behind when choosing a line. Have teammates help form or preserve a useful train when it improves both drivers' chances. Test deliberate, seeded variation in intent and timing; avoid motion with no tactical purpose.
- **Status.** Open. Diagnose before changing tuning.

### BF-002: Leading a train and earning a win

- **Reported 2026-10-18.** Winning feels tied to reaching the front of a train. Leading too early should carry a cost because rivals have time to set up and pass.
- **Desired experience.** A good run can take the lead, but holding it requires defending the racing line and managing challengers. A follower needs a real way to create another approach after latching. The best time to lead should depend on race distance, nearby cars, and teammate positions.
- **Current rules to examine.** A latched follower has spent its approach and cannot pull out with stored speed. A close follower can prevent the leader or a middle car from braking. A settled tail can briefly brake and rebuild a run. This may leave middle cars with too few ways to challenge a train leader.
- **Ideas to test.** Add AI planning to make space and rebuild an approach, using the same steering, braking, wake, and momentum rules as the player. Check whether a defender's line choice can block a realistic pass without freezing the whole train. Keep teammate help conditional on a useful race or championship situation; do not impose a finishing order.
- **Status.** Open. The desired risk of leading is a design goal, not yet a selected mechanic.

### BF-003: Split packs and organized chasing

- **Reported 2026-10-18.** A screenshot from a 9-mile race at 1:31.5, with 3.93 miles left, shows the player 9th at +2.81 seconds. Eighth is at +0.75, so the displayed break between them is about 2.06 seconds. The first seven cars are within +0.37 seconds; positions 9 through 12 are within +3.00. The player sees no credible way to close the split.
- **Measurement note.** During a race, the HUD calculates each gap from distance behind the leader divided by the leader's current speed. These are time-equivalent estimates, not recorded crossing times. A 2-second break at racing speed is far outside the current 36-meter draft-link range.
- **Desired experience.** Splits can happen and should matter. Trailing drivers should respond by seeking nearby cars, forming or improving a drafting train, and avoiding choices that slow the chase. A teammate already in the lead pack may rationally decline to help a trailing teammate, but cooperation should not become a fixed team order.
- **Current rules to examine.** A larger close train gains more speed than a smaller one. Once a large front group escapes draft range, a smaller chasing group may be slower even when it works together. AI scores local lines and teammate proximity but has no explicit response to a pack split or collective chase.
- **Ideas to test.** Measure closing rates for front and chasing train sizes before adjusting physics. Improve AI decisions for joining and maintaining the best available chasing train. Consider whether the train-size benefit or congestion at the front should make a well-organized chase viable under some circumstances. Preserve losses caused by a badly timed move; avoid guaranteed recovery or hidden catch-up speed.
- **Status.** Open. Need evidence across seeds, starting positions, and race lengths.

## First balance pass

1. **Measure the baseline.** Run seeded races with no player steering and with a few repeatable player tactics. Record the first AI-initiated pass, position changes by mile, train sizes, lead changes, and gaps between packs. Check whether the quiet opening and runaway split repeat across seeds and grids.
2. **Change decisions before speed.** Try one AI change that creates an earned opening move or organized chase. Keep physics equal and seeded. Compare the same races to the baseline and watch for pointless weaving, unsafe moves, or a leader that can never hold position.
3. **Tune the train advantage if needed.** If good chase decisions still cannot close any split, compare large and small train speeds and adjust the shared physical rules. Retest slingshot timing, spacing, finish order, and full-race outcomes.
4. **Play for feel.** Ask whether the player has a useful choice during the first mile, can recover from a modest mistake, and can identify why a large break was lost. Check that front-running, drafting, defending, and a late slingshot can each matter.

Candidate targets for the first experiments, subject to playtesting: an AI-initiated contest in the first mile in most races; fewer races with no AI position change by mile 2; both successful and failed chases after pack splits; wins available from several starting rows without making the opening grid irrelevant. Record the exact target values after a baseline run rather than treating these as settled balance rules.

## Decision log

| Date | Decision | Reason | Status |
| --- | --- | --- | --- |
| 2026-10-18 | Track opening activity, train leadership, and split-pack chasing together in this file. | The three observations interact and need shared playtest evidence. | Tracking |
| 2026-10-18 | Keep the next implementation choice open until baseline races are measured. | AI incentives and train-size physics can both cause the reported behavior. | Open |

## New report template

### BF-###: Short description

- **Reported.** Date, race, player driver and grid position, seed or save if available.
- **Observed.** What happened, when, and any screenshot or recording.
- **Expected.** The choice or outcome that would make the race more engaging.
- **Hypotheses.** What in the current rules might explain it.
- **Experiment.** One change or measurement that can test the hypothesis.
- **Decision and result.** What changed, why, and what the same scenarios showed afterward.
