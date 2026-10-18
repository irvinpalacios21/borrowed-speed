# Audio direction

## Fit for Borrowed Speed

The player automatically travels near racing speed and makes small steering changes to join drafting trains or time a pass. Audio should communicate sustained speed and the change in airflow when leaving a draft. My recommendation is a restrained, slightly arcade engine recording with a soft air rush underneath it. Keeping the pitch range small suits the simulation's narrow speed range.

The first implementation uses one recorded engine loop with speed-dependent pitch. It stays quiet during selection, countdown, pauses, the player's finish, and results. Sound remains off until the player clicks the toolbar control. Focus loss immediately fades the mix, even if animation frames stop in the background.

The music layer uses "Pixel Sprinter" by Zane Little Music. Its combination of piano, strings, and chiptune synths supplies a melody for the arcade presentation. It has a separate Music toggle so the tune can play with the engine disabled. The local Ogg loop is kept at a modest gain and its normal pitch, including while the car changes speed. It plays during selection, countdown, races, and results, then fades out on pause or focus loss. Both music and effects start off on reload.

For a later pass, add short countdown tones, a restrained player-finish cue, and passing-car positioning. Continuous tire squeal would communicate cornering or sliding that this straight-track game does not simulate.

## Research and selection

| Candidate | Source and license | Decision |
| --- | --- | --- |
| Pixel Sprinter, Zane Little Music | [OpenGameArt](https://opengameart.org/content/pixel-sprinter), CC0 | Selected the dedicated Ogg loop, about 563 KB. A melodic blend of piano, strings, and chiptune synths. The author tags it for racing and supplies both standalone and looping versions. |
| Hot Roadway, MintoDog | [OpenGameArt](https://opengameart.org/content/hot-roadway), CC0 | A loopable techno alternative intended for racing and action games. Its 160 BPM version and larger download are better suited to a more intense soundtrack direction. No files included. |
| Racing car engine sound loops, domasx2 | [OpenGameArt](https://opengameart.org/content/racing-car-engine-sound-loops), CC0 | Selected loop_0.wav. A small PCM loop made for a racing game, easy to decode locally and vary gently with speed. The author's note says the other files differ only in pitch, so importing all six adds no useful detail. |
| Car Engine Loop 96kHz, 4s, qubodup | [OpenGameArt](https://opengameart.org/content/car-engine-loop-96khz-4s), offers CC BY 3.0 among its license choices | A longer alternative for later listening comparisons. Larger files and attribution terms make it less convenient for this first addition. |
| Interface Sounds, Kenney | [Kenney](https://kenney.nl/assets/interface-sounds), CC0 | A possible source for future interface cues. No files from this pack are included. |

The [Wreckfest engine audio guide hosted by Audiokinetic](https://www.audiokinetic.com/media/blog/LoopBasedCarEngineDesign/vehicle_audio_modding_guide_for_wreckfest-Wwise2019_2_9.pdf), appendix 2, recommends steady-pitch, seamless source loops and warns against stretching a few samples over a wide RPM range. That supports a modest pitch range here. A detailed engine simulation would need recordings at several RPM and load states; this implementation is a lightweight arcade treatment.

The [Web Audio playbackRate documentation](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/playbackRate) describes changing a buffer source's playback speed and pitch. The [loop documentation](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop) covers native repeat playback. Both are used instead of restarting an HTML audio element on every loop.

## Files and behavior

- `public/audio/engine-loop.wav` is an unchanged copy of the selected download.
- `public/audio/pixel-sprinter-loop.ogg` is the unchanged music download.
- `public/audio/README.md` records source, license, provenance, and SHA-256. CC0 terms are linked there.
- `src/game/audio.ts` owns independent lazy loading for music and effects, decoding, engine filtering, pitch smoothing and fades. Both asset URLs respect Vite's configured base path.
- `src/main.ts` connects the existing sound button and race state. The button prevents overlapping initialization clicks and shows loading feedback.

Enabling sound resumes the browser audio context during the click gesture, then loads the local WAV once. Later toggles reuse the decoded loop. An eight-second fetch timeout, HTTP error, or decoding failure uses the original style of synthesized engine sound, keeping optional sound usable without blocking the race. A browser without working Web Audio shows "Sound unavailable" and allows a retry.

Enabling music resumes the same audio context during the click, fetches and decodes the local Ogg once, and loops it through its own gain node. It does not fetch or enable engine audio. A failed request or decode shows "Retry music" and allows a fresh attempt without affecting the effects control. Muting reuses the decoded loop when music is enabled again.

Both assets are served by the game itself, including in production builds. Playing the game makes no request to OpenGameArt. No audio packages or external audio services are required.

## Verification

Browser checks measure actual Web Audio output through analysers attached to the native graph. They cover silence before a user gesture, loading and decoding the local WAV, nonzero racing output, pause and focus-loss silence, resume, mute, reuse across toggles, finish silence, and missing or corrupt asset fallback. Build and existing simulation checks also run.

Music checks cover local Ogg decoding and audible output, independent controls, mute and reuse, pause and focus loss, retry after a failed download or decode, and phone-width layout.

These checks establish working playback and state handling. Final loudness and timbre still benefit from a human listening pass on speakers and headphones.
