# Reference research

Research date: October 17, 2026, America/Los_Angeles.

## Sources and method

- [Archived game](https://archive.org/details/1100_5_miles_2_go).
- [Original SWF file](https://archive.org/download/1100_5_miles_2_go/5_miles_2_go.swf).
- [REA repository](https://github.com/morluto/rea) and its [documented analysis targets](https://github.com/morluto/rea#what-you-can-analyze).
- [Original author's later revision](https://www.newgrounds.com/portal/view/339343), useful for provenance. Its controls and behavior are not evidence for the archived original.

The SWF was read as data using Python's standard library. Inspection covered its header, tag inventory, static text decoded through embedded font character maps, dynamic text fields, and printable strings in action records. Ruffle's [SWF reader](https://github.com/ruffle-rs/ruffle/blob/master/swf/src/read.rs) was consulted for text-record structure.

No original game code was executed or copied into this project. No art, music, or driver branding was imported. The browser-control runtime failed to start in this session, so there was no live gameplay observation. Static inspection does not establish exact runtime behavior.

## Confirmed reference baseline

The following comes from the archived SWF's instructions and data, not from assumptions about NASCAR games.

| Finding | Evidence in the SWF |
| --- | --- |
| Five cars total compete over the final five miles. | Intro text, character 83, and car references 1 through 5. |
| The course is straight, with no turns. | Driving instructions, character 144. |
| Cars share base speed and horsepower; speed is automatic. | Characters 83 and 144. |
| Up steers right and Down steers left. Q changes visual quality. | Characters 129 and 144. |
| Following cars help a car pass. Longer aligned groups gain speed. | Characters 144 and 157. |
| Opponents choose when to draft and when to pass. | Author commentary, character 168. |
| Stats include points, races, wins, and average finish. | Dynamic fields and labels 176 through 179. |
| The old game describes online ranking submission every fifth race. | Characters 129 and 189. This does not establish that the service still operates. |

The action strings include front/rear drafting, draft links, passing, merging, a finish line, and a one-mile-remaining marker. These names support further investigation, but do not prove the equations or decision rules. In particular, front and rear effects should not be assumed symmetric.

The header reports an uncompressed SWF version 4 file, a 600 by 450 stage, and 24 frames per second. These describe the reference file, not requirements for our implementation.

## What needs observation or deeper analysis

- Exact draft activation range, lateral tolerance, strength, train-size calculation, and speed limits.
- How quickly speed changes when a draft link forms or breaks.
- Steering rate, lateral limits, and whether movement is continuous throughout a maneuver.
- Opponent passing, blocking, merging, randomness, and final-mile decisions.
- Contact behavior and prevention of overlapping cars. Author commentary acknowledges overlap problems, but does not specify the intended collision rule.
- Starting grid and any variation between races.
- Finish-line tie handling, stat calculations, and persistence between visits.
- Camera motion, animation, sound cues, and the feel of a timed pass.

The first comparison should include an isolated car, a pair, a longer train, a train splitting, a blocked merge, and a pass near the finish. Those situations will reveal more than copying the menus first.

## REA assessment

REA is a general investigation toolkit, not the game's source repository or a game engine. Its published target list covers native programs, JavaScript, websites, and several other formats. It does not list a dedicated Flash/SWF ActionScript workflow. Inspecting a browser emulator alone would not establish the original game's rules.

For this game, static SWF inspection has already recovered useful design evidence. If exact formulas become necessary, [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) is a format-specific candidate to evaluate. No installation is needed to agree on the game design.

Recommended research order: compare live play when browser control is available, measure the situations above, then inspect only the relevant actions if behavior remains unclear. Record each conclusion as observed, recovered from code, or proposed for our version.

## Reference identity

For reproducibility, the downloaded bytes had the following identity:

```text
File: 5_miles_2_go.swf
Size: 351905 bytes
SHA-256: 7230cae3977eb3fe94fc868a7226c17eeaf613b630ad490650abe51c7ecc6f24
```

The SWF was processed in memory and is not bundled with this project.

## Slipstream physics check

[SimScale's drafting analysis](https://www.simscale.com/blog/drafting-slipstreaming-in-racing/) describes reduced drag for both cars, a trailing car's potential closing advantage, and the influence of spacing and vehicle shape. This supports retaining the train effect while adding a separate following benefit. Numerical strengths and momentum timing remain game tuning.
