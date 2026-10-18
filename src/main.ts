import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/barlow-condensed/latin-700.css";
import "@fontsource/barlow-condensed/latin-800.css";
import "./style.css";
import { FIXED_STEP, METERS_PER_MILE, MPH_PER_MPS } from "./game/config.ts";
import { RaceSimulation } from "./game/simulation.ts";
import { RaceRenderer } from "./game/renderer.ts";
import { RaceAudio } from "./game/audio.ts";
import { PointsHistory } from "./points-history.ts";
import { RecordBook } from "./record-book.ts";
import { createGame, parseGame, archiveCompletedSeason, nextSeason, GAME_STORAGE_KEY } from "./game/save.ts";
import type { GameSave } from "./game/save.ts";
import {
  DEFAULT_DRIVER_ID,
  DRIVERS,
  TEAMS,
  driverById,
  teamById,
  teammateOf,
} from "./game/teams.ts";
import {
  createSeason,
  parseSeason,
  recordRace,
  chooseDriver,
  driverStandings,
  teamStandings,
  startingGrid,
  SEASON_SCHEDULE,
  SEASON_STORAGE_KEY,
  POINTS,
} from "./game/season.ts";

import { SETTINGS } from "./game/settings.ts";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <main class="race-app" data-phase="ready" data-view="race">
    <header class="masthead">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span><h1>Borrowed Speed</h1></div>
      <div class="toolbar">
        <button id="show-saves" class="quiet-button">Saves</button>
        <button id="show-records" class="quiet-button">Record book</button>
        <div class="audio-control">
          <button id="audio-toggle" class="quiet-button" aria-expanded="false" aria-controls="audio-options">Audio <span aria-hidden="true">⌄</span></button>
          <div id="audio-options" class="audio-options" role="group" aria-label="Audio controls" hidden>
            <button id="music" class="quiet-button" aria-pressed="false" title="Toggle Pixel Sprinter by Zane Little Music">Music off</button>
            <button id="sound" class="quiet-button" aria-pressed="false" title="Toggle engine audio">Sound off</button>
          </div>
        </div>
        <button id="fullscreen" class="quiet-button" aria-pressed="false">Full screen</button>
        <div id="race-actions" class="race-actions"><button id="restart" class="quiet-button">Restart race</button><button id="pause" class="pause-button" disabled>Pause <kbd>Space</kbd></button></div>
      </div>
    </header>
    <p id="display-status" class="display-status" role="status" hidden></p>
    <div id="race-view">
    <section class="season-banner" aria-label="Current season race">
      <div class="event-identity"><span id="round-label">Race 1 of 10</span><h2 id="event-name">Opening run</h2><p id="grid-note"></p></div>
      <div class="season-summary"><span id="setting-label" class="setting-badge"></span><span id="event-distance">6 miles</span><span id="championship-place">8 teams</span><button id="show-season" class="season-link">Season standings</button></div>
    </section>
    <div class="race-layout">
      <section class="race-panel" aria-label="Race">
        <div class="instrument-bar">
          <div class="instrument"><span>Position</span><div><strong id="position">8</strong><small>/ 16</small></div></div>
          <div class="instrument speed"><span>Speed <em id="brake-status" hidden>Braking</em></span><div><strong id="speed">177</strong><small>mph</small></div></div>
          <div class="instrument distance"><span>To the finish</span><div><strong id="remaining">6.00</strong><small>mi</small></div></div>
          <div class="race-clock"><span>Race time</span><strong id="race-time">0:00.0</strong></div>
        </div>
        <div class="track-stage">
          <canvas id="race-canvas" tabindex="0" aria-label="Overhead race view. Up and Down or W and S steer. Hold Left Arrow to brake. Space pauses.">This game requires HTML canvas support.</canvas>
          <div id="countdown" class="countdown" hidden aria-live="polite"></div>
          <section id="overlay" class="overlay" aria-label="Race controls"></section>
          <div id="final-mile" class="final-mile" hidden>Final mile</div>
          <div id="slingshot-indicator" class="slingshot-indicator" data-state="idle" hidden>
            <div><span>Slingshot</span><strong id="slingshot-label">Build a run</strong></div>
            <div id="slingshot-meter" class="slingshot-meter" role="meter" aria-label="Slingshot momentum" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="slingshot-fill"></span></div>
          </div>
          <div id="field-finishing" class="field-finishing" hidden role="status"></div>
        </div>
        <section class="draft-console" aria-label="Drafting feedback">
          <div class="draft-readout"><span class="draft-icon" aria-hidden="true">≋</span><div><strong id="draft-state">Train linked</strong><span id="draft-hint">Stay aligned to build speed.</span><span id="brake-availability" class="brake-availability" role="status" hidden>Car close behind · braking unavailable</span></div></div>
          <div class="draft-connections"><span id="rear-link" class="connection">Rear <i></i></span><span id="player-mini" class="mini-car" aria-hidden="true">27</span><span id="front-link" class="connection">Front <i></i></span></div>
          <div class="draft-power"><div><span id="train-size">4-car train</span><strong id="draft-gain">+0 mph</strong></div><div class="power-track" role="meter" aria-label="Draft speed gain" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="power-fill"></span></div><span id="closing-readout" class="closing-readout">Matched pace</span></div>
        </section>
        <div class="touch-controls"><button id="steer-up" aria-label="Steer up">↑ <span>Up</span></button><button id="brake" class="brake-button" aria-label="Brake" aria-describedby="brake-availability" aria-pressed="false" disabled>← <span>Brake</span></button><button id="steer-down" aria-label="Steer down"><span>Down</span> ↓</button></div>
      </section>
      <aside class="standings-panel" aria-label="Race and championship standings">
        <div class="standings-heading"><h2 id="table-title">The field</h2><span id="field-count">16 drivers</span></div>
        <div class="standings-tabs" role="tablist" aria-label="Standings view"><button id="race-tab" role="tab" aria-selected="true" aria-controls="standings">Race</button><button id="drivers-tab" role="tab" aria-selected="false" aria-controls="standings">Drivers</button><button id="teams-tab" role="tab" aria-selected="false" aria-controls="standings">Teams</button></div>
        <div class="standing-labels"><span>Position / driver</span><span id="gap-label">Gap (s)</span></div>
        <ol id="standings"></ol>
        <div id="player-identity" class="field-note"></div>
      </aside>
    </div>
    <footer class="race-footer"><div class="controls-help"><span><kbd>↑</kbd><kbd>↓</kbd> or <kbd>W</kbd><kbd>S</kbd> steer</span><span><kbd>←</kbd> hold to brake</span><span><kbd>Space</kbd> pause</span><span><kbd>R</kbd> restart race</span></div><p id="save-status">Completed races are saved on this device.</p></footer>
    <p class="track-note">Use their speed. Take their place.</p>
    </div>
    <section id="season-view" class="season-overview" aria-labelledby="season-heading" hidden>
      <header class="season-view-heading"><div><h2 id="season-heading" tabindex="-1">Season</h2><p>Standings, points history &amp; calendar <span id="completed-count">0 of 10 complete</span></p></div><button id="back-to-race" class="quiet-button">Back to race</button></header>
      <div id="season-details">
        <div class="overview-tabs" role="tablist" aria-label="Season overview"><button id="overview-drivers-tab" role="tab" aria-selected="true" aria-controls="overview-drivers">Drivers</button><button id="overview-teams-tab" role="tab" aria-selected="false" aria-controls="overview-teams">Teams</button><button id="overview-history-tab" role="tab" aria-selected="false" aria-controls="overview-history">Points history</button><button id="overview-calendar-tab" role="tab" aria-selected="false" aria-controls="overview-calendar">Calendar</button></div>
        <div id="overview-drivers" class="overview-pane" role="tabpanel"><h3>Driver championship</h3><table class="championship-table"><thead><tr><th scope="col">Pos</th><th scope="col">Driver / team</th><th scope="col">Wins</th><th scope="col">Points</th></tr></thead><tbody id="driver-table"></tbody></table></div>
        <div id="overview-teams" class="overview-pane" role="tabpanel" hidden><h3>Team championship</h3><table class="championship-table"><thead><tr><th scope="col">Pos</th><th scope="col">Team</th><th scope="col">Wins</th><th scope="col">Points</th></tr></thead><tbody id="team-table"></tbody></table><p class="scoring-note">Both teammates' points count toward their team.</p></div>
        <div id="overview-history" class="overview-pane" role="tabpanel" aria-labelledby="overview-history-tab" hidden></div>
        <div id="overview-calendar" class="overview-pane" role="tabpanel" hidden><h3>Race calendar</h3><ol id="season-schedule" class="season-schedule"></ol></div>
        <p class="scoring-note season-rules">Points from first to sixteenth: 25, 22, 20, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1.<br>Ties use best finishing records, then the most recent finish. The next grid reverses the driver standings.</p>
      </div>
    </section>
    <section id="records-view" class="season-overview" aria-labelledby="records-heading" hidden>
      <header class="season-view-heading"><div><h2 id="records-heading" tabindex="-1">Record book</h2><p>Completed seasons, championships, wins &amp; podiums</p></div><button id="records-back" class="quiet-button">Back to race</button></header>
      <div id="record-book"></div>
    </section>
    <section id="saves-view" class="season-overview" aria-labelledby="saves-heading" hidden>
      <header class="season-view-heading"><div><h2 id="saves-heading" tabindex="-1">Saves</h2><p>Pick up where you left off.</p></div><button id="saves-back" class="quiet-button">Back to race</button></header>
      <div class="save-panel"><h3>Current game</h3><p id="save-summary"></p><p id="game-save-status" role="status"></p><div class="save-buttons"><button id="save-now" class="primary-button">Save game</button><button id="export-save" class="quiet-button">Download backup</button></div><p class="scoring-note">Your race and record book save automatically in this browser every few seconds and when you pause or leave. Download a backup to keep a copy outside this browser or move to another device.</p></div>
      <div class="save-panel"><h3>Restore a backup</h3><label for="import-save">Choose a Borrowed Speed save file</label><input id="import-save" type="file" accept=".json,application/json"><p id="import-status" role="status"></p><div id="import-preview" hidden><p id="import-summary"></p><p>Restoring replaces the current game and record book. Download your current backup first if you want to keep it.</p><div class="save-buttons"><button id="restore-save" class="primary-button">Restore this backup</button><button id="cancel-import" class="quiet-button">Cancel</button></div></div></div>
    </section>
    <div id="announcer" class="sr-only" role="status" aria-live="polite"></div>
  </main>`;

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("race-canvas");
const pointsHistory = new PointsHistory(element("overview-history"));
const recordBook = new RecordBook(element("record-book"));
const renderer = new RaceRenderer(canvas);
const audio = new RaceAudio();
const keys = new Set<string>();
let windowFocused = document.hasFocus();
const drawSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let season = createSeason(null, drawSeed());
let game: GameSave;
let saveMessage = "Your game saves automatically on this device.";
let storageReadable = true;
try {
  const raw = localStorage.getItem(GAME_STORAGE_KEY);
  const saved = parseGame(raw);
  if (saved) {
    game = saved;
    season = saved.current.season;
  } else if (raw) {
    storageReadable = false;
    saveMessage = "The saved game could not be read. It has been kept untouched. Restore a backup in Saves to continue.";
  } else {
    const legacy = localStorage.getItem(SEASON_STORAGE_KEY);
    const savedSeason = parseSeason(legacy);
    if (savedSeason) season = savedSeason;
    else if (legacy) {
      storageReadable = false;
      saveMessage = "The previous save could not be read. It has been kept untouched. Restore a backup in Saves to continue.";
    }
  }
} catch {
  saveMessage = "Progress stays in this tab. Browser storage is unavailable.";
}
game ??= createGame(season);
let previewDriverId = season.playerDriverId ?? DEFAULT_DRIVER_ID;
let activeRaceIndex = Math.min(
  season.results.length,
  SEASON_SCHEDULE.length - 1,
);
let activeRace = SEASON_SCHEDULE[activeRaceIndex];
const complete = () => season.results.length === SEASON_SCHEDULE.length;
const selectedDriver = () =>
  driverById(season.playerDriverId ?? previewDriverId);
const makeSimulation = () =>
  new RaceSimulation(
    { miles: activeRace.miles, carCount: DRIVERS.length },
    (activeRace.seed ^ season.gridSeed) >>> 0,
    {
      playerDriverId: selectedDriver().id,
      grid: startingGrid(season),
      setting: activeRace.setting,
    },
  );
let sim = makeSimulation();
if (game.current.race) sim.restore(game.current.race);
let lastScreen = "";
let recorded = complete();
type TableMode = "race" | "drivers" | "teams";
let tableMode: TableMode = recorded ? "drivers" : "race";
let activeView: "race" | "season" | "records" | "saves" = "race";
let pendingImport: GameSave | null = null;
let uiTime = 0;
const ordinal = (n: number) =>
  `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
const raceTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;
const announce = (message: string) => {
  element("announcer").textContent = message;
};
const chip = (id: string) => {
  const d = driverById(id);
  return `<span class="car-chip" style="--car-color:${teamById(d.teamId).color}">${d.number}</span>`;
};
const isPlayer = (id: string) => id === selectedDriver().id;
const identityLabel = (id: string) =>
  isPlayer(id)
    ? '<span class="you-label">You</span>'
    : id === teammateOf(selectedDriver().id).id
      ? '<span class="mate-label">TM</span>'
      : "";

function captureGame() {
  if (scoreFinishedRace()) updateSeasonViews();
  game = archiveCompletedSeason({
    ...game, savedAt: new Date().toISOString(),
    current: { ...game.current, season, race: recorded ? null : sim.snapshot() },
  });
}
function saveSeason() {
  captureGame();
  if (!storageReadable) {
    updateSaveStatus();
    return false;
  }
  try {
    // The current race and all archived seasons are committed together.
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(game));
    saveMessage = `Game saved on this device at ${new Date(game.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`;
  } catch {
    saveMessage = "Could not save in this browser. Download a backup to keep your race and record book.";
    updateSaveStatus();
    return false;
  }
  // Retain the original season format for older builds. The full game save is
  // authoritative, so a failure to write this compatibility copy loses nothing.
  try { localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(season)); } catch { /* Full save succeeded. */ }
  updateSaveStatus();
  return true;
}
function updateSaveStatus() {
  element("save-status").textContent = saveMessage;
  element("game-save-status").textContent = saveMessage;
  element("save-summary").textContent = `Season ${game.current.number} · ${season.results.length} of 10 races complete · ${game.archives.length} completed seasons in the record book${game.current.race ? " · Race saved in progress" : ""}`;
}
function resetRace(start = false) {
  if (activeRaceIndex < season.results.length) return;
  keys.clear();
  sim = makeSimulation();
  recorded = false;
  lastScreen = "";
  if (start && season.playerDriverId !== null) {
    sim.start();
    canvas.focus();
  }
  saveSeason();
  updateSeasonViews();
  updateUI();
}
function beginRace() {
  if (season.playerDriverId === null) {
    season = chooseDriver(season, previewDriverId);
    updateSeasonViews();
  }
  sim.start();
  saveSeason();
  canvas.focus();
  announce(
    `Race ${activeRaceIndex + 1} starting. You are ${selectedDriver().name} of ${sim.player.teamName}.`,
  );
  updateUI();
}
function nextRace() {
  if (complete()) return;
  activeRaceIndex = season.results.length;
  activeRace = SEASON_SCHEDULE[activeRaceIndex];
  tableMode = "race";
  resetRace();
}
function newSeason() {
  saveSeason();
  game = nextSeason(game, drawSeed());
  season = game.current.season;
  previewDriverId = DEFAULT_DRIVER_ID;
  activeRaceIndex = 0;
  activeRace = SEASON_SCHEDULE[0];
  tableMode = "race";
  resetRace();
}
function showSeason() {
  showView("season");
}
function showView(view: "season" | "records" | "saves") {
  if (["racing", "countdown", "finishing"].includes(sim.phase))
    sim.togglePause();
  keys.clear();
  closeAudio();
  saveSeason();
  activeView = view;
  element("race-view").hidden = true;
  for (const name of ["season", "records", "saves"]) element(name + "-view").hidden = name !== view;
  element("race-actions").hidden = true;
  app.firstElementChild!.setAttribute("data-view", activeView);
  updateUI();
  recordBook.update(game);
  window.scrollTo(0, 0);
  element(view + "-heading").focus({ preventScroll: true });
}
function showRace() {
  activeView = "race";
  for (const name of ["season", "records", "saves"]) element(name + "-view").hidden = true;
  element("race-view").hidden = false;
  element("race-actions").hidden = false;
  app.firstElementChild!.setAttribute("data-view", activeView);
  keys.clear();
  updateUI();
  window.scrollTo(0, 0);
  const action = element("overlay").querySelector<HTMLButtonElement>("button:not(:disabled)");
  (action ?? canvas).focus({ preventScroll: true });
}
function closeAudio() {
  element("audio-options").hidden = true;
  element("audio-toggle").setAttribute("aria-expanded", "false");
}
function showOverlay() {
  const overlay = element("overlay");
  overlay.hidden =
    !complete() && ["racing", "countdown", "finishing"].includes(sim.phase);
  const driver = selectedDriver();
  if (complete()) {
    const drivers = driverStandings(season);
    const teams = teamStandings(season);
    const place = drivers.findIndex((row) => row.driver.id === driver.id);
    const team = teams.findIndex((row) => row.team.id === driver.teamId);
    overlay.innerHTML = `<div class="result-card season-result"><span class="finish-tag">Season complete</span><h2>${ordinal(place + 1)}<small> / 16</small></h2><p>${driver.name} · <strong>${drivers[place].points} points</strong><br>${teams[team].team.name}: ${ordinal(team + 1)} with ${teams[team].points} points.</p><p class="champion-note"><strong>${drivers[0].driver.name}</strong> wins the driver title.<br><strong>${teams[0].team.name}</strong> wins the team title.</p><button id="new-season" class="primary-button">Start a new season <span aria-hidden="true">↗</span></button><button id="results-standings" class="text-button">View final standings</button></div>`;
    element("new-season").addEventListener("click", newSeason);
    element("results-standings").addEventListener("click", showSeason);
  } else if (sim.phase === "ready") {
    const choosing = season.playerDriverId === null;
    const options = TEAMS.map(
      (team) =>
        `<optgroup label="${team.name}">${DRIVERS.filter(
          (d) => d.teamId === team.id,
        )
          .map(
            (d) =>
              `<option value="${d.id}" ${driver.id === d.id ? "selected" : ""}>#${d.number} · ${d.name}</option>`,
          )
          .join("")}</optgroup>`,
    ).join("");
    overlay.innerHTML = `<div class="start-card ${choosing ? "driver-selection" : ""}"><span class="finish-tag">${choosing ? "16 drivers · 8 teams · 10 races" : "Race " + (activeRaceIndex + 1)}</span><h2>${choosing ? "Choose your driver." : "Find your opening."}</h2>${choosing ? `<label class="driver-select-label" for="driver-select">Your driver for the whole season</label><select id="driver-select">${options}</select>` : ""}<div id="driver-profile" class="driver-profile"><span class="profile-number" style="--car-color:${sim.player.color}">${driver.number}</span><div><strong>${driver.name}</strong><span>${sim.player.teamName}</span></div></div><p class="teammate-note">Teammate: ${teammateOf(driver.id).name}</p><div class="event-preview"><span>${activeRace.name} · ${SETTINGS[activeRace.setting].name}</span><strong>${activeRace.miles} miles · Grid P${sim.player.gridPosition}</strong></div><button id="start-race" class="primary-button">${choosing ? "Start season" : "Start race " + (activeRaceIndex + 1)} <span aria-hidden="true">↗</span></button><p class="start-tip">${choosing ? "Driver locks when you start. " : ""}↑ ↓ steer. Hold ← to brake.</p></div>`;
    if (choosing)
      element<HTMLSelectElement>("driver-select").addEventListener(
        "change",
        (event) => {
          previewDriverId = (event.target as HTMLSelectElement).value;
          resetRace();
          element("driver-select").focus();
        },
      );
    element("start-race").addEventListener("click", beginRace);
  } else if (sim.phase === "paused") {
    overlay.innerHTML = `<div class="pause-card"><span class="pause-symbol" aria-hidden="true">Ⅱ</span><h2>Race paused</h2><p>Your place in the pack is safe.</p><button id="resume-race" class="primary-button">Resume race</button><button id="pause-restart" class="text-button" ${sim.player.finishTime !== null ? "hidden" : ""}>Restart this race</button></div>`;
    element("resume-race").addEventListener("click", () => {
      sim.togglePause();
      saveSeason();
      canvas.focus();
      updateUI();
    });
    element("pause-restart").addEventListener("click", () => resetRace(true));
  } else if (sim.phase === "finished") {
    const table = driverStandings(season);
    const championshipPlace =
      table.findIndex((row) => row.driver.id === driver.id) + 1;
    const next = SEASON_SCHEDULE[activeRaceIndex + 1];
    overlay.innerHTML = `<div class="result-card"><span class="finish-tag">Race ${activeRaceIndex + 1} complete</span><h2>${ordinal(sim.position)}<small> / 16</small></h2><p><strong>+${POINTS[sim.position - 1]} points</strong> for ${driver.name}.<br>${ordinal(championshipPlace)} in the driver championship.</p><div class="result-details"><span>${activeRace.miles} miles</span><span>${raceTime(sim.player.finishTime ?? sim.elapsed)}</span></div><button id="next-race" class="primary-button">Next race <span aria-hidden="true">↗</span></button><p class="next-event">${next.name} · ${next.miles} miles</p><button id="results-standings" class="text-button">View season standings</button></div>`;
    element("next-race").addEventListener("click", nextRace);
    element("results-standings").addEventListener("click", showSeason);
    announce(
      `${driver.name} finished ${ordinal(sim.position)} and earned ${POINTS[sim.position - 1]} points.`,
    );
  }
}
function updateSeasonViews() {
  const drivers = driverStandings(season),
    teams = teamStandings(season);
  const driver = selectedDriver(),
    mate = teammateOf(driver.id);
  const index = drivers.findIndex((row) => row.driver.id === driver.id);
  element("round-label").textContent = complete()
    ? "10 races complete"
    : `Race ${activeRaceIndex + 1} of 10`;
  element("event-name").textContent = complete()
    ? "Season complete"
    : activeRace.name;
  element("event-distance").textContent = `${activeRace.miles} miles`;
  element("setting-label").textContent = SETTINGS[activeRace.setting].name;
  element("setting-label").dataset.setting = activeRace.setting;
  element("grid-note").textContent = complete()
    ? "Driver and team championships decided"
    : `${season.results.length ? "Reverse driver standings" : "Seeded opening draw"} · Two columns · Your grid: P${sim.player.gridPosition}`;
  element("championship-place").textContent = season.results.length
    ? `${driver.shortName}: ${ordinal(index + 1)} · ${drivers[index].points} pts`
    : "16 drivers · 8 teams";
  element("completed-count").textContent =
    `${season.results.length} of 10 complete`;
  element("save-status").textContent = saveMessage;
  element("player-mini").textContent = driver.number;
  element("player-mini").style.backgroundColor = sim.player.color;
  element("player-identity").innerHTML =
    `<span class="player-swatch" style="background:${sim.player.color}"></span><strong>#${driver.number} ${driver.name}</strong><br>${sim.player.teamName} · Teammate #${mate.number}<br>Everyone has the same engine.`;
  element("driver-table").innerHTML = drivers
    .map(
      (row, i) =>
        `<tr class="${isPlayer(row.driver.id) ? "your-team" : ""}" data-driver-id="${row.driver.id}"><td>${i + 1}</td><th scope="row">${chip(row.driver.id)}<span class="table-name">${row.driver.name}${identityLabel(row.driver.id)}<small>${teamById(row.driver.teamId).name}</small></span></th><td>${row.wins}</td><td class="driver-points">${row.points}</td></tr>`,
    )
    .join("");
  element("team-table").innerHTML = teams
    .map(
      (row, i) =>
        `<tr class="${row.team.id === driver.teamId ? "your-team" : ""}" data-team-id="${row.team.id}"><td>${i + 1}</td><th scope="row"><span class="team-dot" style="background:${row.team.color}"></span>${row.team.name}${row.team.id === driver.teamId ? '<span class="you-label">You</span>' : ""}</th><td>${row.wins}</td><td class="team-points">${row.points}</td></tr>`,
    )
    .join("");
  element("season-schedule").innerHTML = SEASON_SCHEDULE.map((race, i) => {
    const result = season.results[i];
    const place = result
      ? result.finishes.findIndex((finish) => finish.driverId === driver.id) + 1
      : null;
    return `<li class="${result ? "event-done" : i === season.results.length ? "event-current" : ""}"><span class="event-number">${i + 1}</span><div><strong>${race.name}</strong><span>${SETTINGS[race.setting].name} · ${race.miles} miles</span></div><span class="event-result">${place ? ordinal(place) + " · +" + POINTS[place - 1] : i === season.results.length && !complete() ? "Up next" : "Upcoming"}</span></li>`;
  }).join("");
  pointsHistory.update(season);
  recordBook.update(game);
}
function updateStandings() {
  for (const mode of ["race", "drivers", "teams"] as const)
    element(mode + "-tab").setAttribute(
      "aria-selected",
      String(tableMode === mode),
    );
  element("table-title").textContent =
    tableMode === "race"
      ? complete()
        ? "Final race"
        : sim.phase === "ready"
          ? "Starting grid"
          : "The field"
      : tableMode === "drivers"
        ? "Driver points"
        : "Team points";
  element("field-count").textContent =
    tableMode === "teams" ? "8 teams" : "16 drivers";
  element("gap-label").textContent =
    tableMode === "race"
      ? sim.phase === "ready" && !complete()
        ? "Grid"
        : "Gap (s)"
      : "Points";
  if (tableMode === "teams") {
    element("standings").innerHTML = teamStandings(season)
      .map(
        (row, i) =>
          `<li class="${row.team.id === selectedDriver().teamId ? "is-player" : ""}" data-team-id="${row.team.id}"><span class="rank">${i + 1}</span><span class="team-dot" style="background:${row.team.color}"></span><span class="car-name">${row.team.name}</span><span class="gap">${row.points}</span></li>`,
      )
      .join("");
  } else if (tableMode === "drivers") {
    element("standings").innerHTML = driverStandings(season)
      .map(
        (row, i) =>
          `<li class="${isPlayer(row.driver.id) ? "is-player" : ""}" data-driver-id="${row.driver.id}"><span class="rank">${i + 1}</span>${chip(row.driver.id)}<span class="car-name">${row.driver.shortName}${identityLabel(row.driver.id)}<small>${teamById(row.driver.teamId).name}</small></span><span class="gap">${row.points}</span></li>`,
      )
      .join("");
  } else {
    const standings = complete()
      ? season.results[season.results.length - 1].finishes.map((finish) => ({
          ...sim.cars.find((car) => car.driverId === finish.driverId)!,
          finishTime: finish.time,
        }))
      : sim.standings;
    const leader = standings[0];
    element("standings").innerHTML = standings
      .map((car, i) => {
        const gap =
          car.finishTime !== null && leader.finishTime !== null
            ? car.finishTime - leader.finishTime
            : (leader.progress - car.progress) / Math.max(1, leader.speed);
        return `<li class="${car.player ? "is-player" : ""}" data-driver-id="${car.driverId}"><span class="rank">${i + 1}</span>${chip(car.driverId)}<span class="car-name" title="${car.driverName} · ${car.teamName}">${car.shortName}${identityLabel(car.driverId)}<small>${car.teamName}</small></span><span class="gap">${sim.phase === "ready" && !complete() ? "P" + car.gridPosition : i === 0 ? "Leader" : "+" + Math.max(0, gap).toFixed(2)}</span></li>`;
      })
      .join("");
  }
}
function scoreFinishedRace() {
  if (sim.phase === "finished" && !recorded && !complete()) {
    season = recordRace(season, {
      raceId: activeRace.id,
      finishes: sim.standings.map((car) => ({
        driverId: car.driverId,
        time: car.finishTime!,
      })),
    });
    recorded = true;
    keys.clear();
    if (complete()) tableMode = "drivers";
    return true;
  }
  return false;
}
function updateUI() {
  if (scoreFinishedRace()) {
    saveSeason();
    updateSeasonViews();
  }
  const screen = complete()
    ? "season-complete"
    : season.playerDriverId === null
      ? "selection"
      : sim.phase;
  app.firstElementChild!.setAttribute("data-phase", screen);
  if (lastScreen !== screen) {
    lastScreen = screen;
    showOverlay();
  }
  const player = sim.player;
  element("position").textContent = String(sim.position);
  element("speed").textContent = String(Math.round(player.speed * MPH_PER_MPS));
  const closeFollower = sim.brakeBlocker();
  const brakeActive = sim.phase === "racing" && player.finishTime === null && !complete();
  element("brake-status").hidden = (!sim.braking && !sim.brakeBlocked) || complete();
  element("brake-status").textContent = sim.brakeBlocked ? "Brake blocked" : "Braking";
  element("brake").setAttribute(
    "aria-pressed",
    String(sim.braking && !complete()),
  );
  const brakeButton = element<HTMLButtonElement>("brake");
  brakeButton.disabled = !brakeActive;
  brakeButton.setAttribute("aria-disabled", String(!brakeActive || closeFollower !== null));
  brakeButton.dataset.blocked = String(brakeActive && closeFollower !== null);
  brakeButton.querySelector("span")!.textContent = closeFollower && brakeActive ? "Blocked" : "Brake";
  brakeButton.title = closeFollower && brakeActive
    ? "Car close behind · braking unavailable" : "Hold to brake when clear behind";
  element("brake-availability").hidden = !brakeActive || closeFollower === null;
  element("remaining").textContent = sim.remainingMiles.toFixed(2);
  element("race-time").textContent = raceTime(player.finishTime ?? sim.elapsed);
  const pause = element<HTMLButtonElement>("pause");
  pause.disabled =
    activeView !== "race" || sim.phase === "ready" || sim.phase === "finished" || complete();
  pause.innerHTML = `${sim.phase === "paused" ? "Resume" : "Pause"} <kbd>Space</kbd>`;
  element<HTMLButtonElement>("restart").disabled =
    activeView !== "race" || recorded ||
    player.finishTime !== null ||
    complete() ||
    season.playerDriverId === null;
  element("countdown").hidden = sim.phase !== "countdown" || complete();
  element("countdown").textContent = String(
    Math.max(1, Math.ceil(sim.countdown)),
  );
  element("final-mile").hidden = !(
    sim.phase === "racing" && sim.remainingMiles <= 1
  );
  element("field-finishing").hidden = sim.phase !== "finishing";
  element("field-finishing").textContent =
    `${ordinal(sim.position)} finish locked. Completing the field…`;
  const front = player.frontId === null ? null : sim.cars[player.frontId];
  const rear = player.rearId === null ? null : sim.cars[player.rearId];
  const mateLinked =
    front?.teamId === player.teamId || rear?.teamId === player.teamId;
  const linked = player.trainSize > 1;
  const sling = sim.slingshot();
  const leading = !front && linked;
  const closing = front ? (player.speed - front.speed) * MPH_PER_MPS : 0;
  let draftState: string, draftHint: string;
  if (sim.braking) {
    draftState = "Braking";
    draftHint = "Ease behind a car. Release the brake to build speed again.";
  } else if (sim.brakeBlocked) {
    draftState = "Braking unavailable";
    draftHint = "Car close behind. Pull clear before slowing down.";
  } else if (sim.steeringBlocked) {
    draftState = "Car alongside";
    draftHint = "Wait for space before moving across.";
  } else if (sling.state === "ready") {
    draftState = "Slingshot ready";
    draftHint = "Pull out now, before you latch onto the car ahead.";
  } else if (sling.state === "blocked") {
    draftState = "Momentum ready · no opening";
    draftHint = "You have closing speed. Wait for a clear side.";
  } else if (sling.state === "carrying") {
    draftState = "Carrying approach momentum";
    draftHint = "Carry your run past the car ahead. Momentum is fading.";
  } else if (sling.state === "latched") {
    draftState = "Latched to the train";
    draftHint = closeFollower
      ? "Your run is spent. Pull clear before braking back."
      : "Your run is spent. Drop back to build another approach.";
  } else if (leading) {
    draftState = player.pushBonus > 0.1 ? "Pushed by the train" : "Leading in open air";
    draftHint = player.pushBonus > 0.1
      ? "Close followers are pushing. You have no slipstream."
      : "Followers must close up before they can push you.";
  } else if (mateLinked) {
    draftState = "Teammate linked";
    draftHint = "Working together builds speed for both of you.";
  } else if (front) {
    draftState = "In the slipstream";
    draftHint = "Build closing speed. Pull out before reaching the bumper.";
  } else {
    draftState = "Running solo";
    draftHint = "Line up with a car ahead or behind.";
  }
  element("draft-state").textContent = draftState;
  element("draft-hint").textContent = draftHint;
  for (const [id, connected] of [
    ["front-link", player.frontId !== null],
    ["rear-link", player.rearId !== null],
  ] as const) {
    element(id).classList.toggle("connected", connected);
    element(id).setAttribute(
      "aria-label",
      `${id === "front-link" ? "Front" : "Rear"} draft ${connected ? "connected" : "disconnected"}`,
    );
  }
  element("train-size").textContent = linked
    ? `${player.trainSize}-car train`
    : "No train";
  const actualGain = Math.max(
    0,
    (player.speed - sim.config.baseSpeed) * MPH_PER_MPS,
  );
  element("draft-gain").textContent = `${leading && player.pushBonus > 0.1 ? "Push " : ""}+${Math.round(actualGain)} mph`;
  element("closing-readout").textContent = sim.braking
    ? "Slowing down"
    : front
      ? closing > 0.1
        ? `Closing +${closing.toFixed(1)} mph`
        : sling.state === "latched"
          ? "Pace matched · latched"
          : "Matched pace"
      : sling.state === "carrying"
        ? "Slingshot momentum"
        : "Find a tow";
  const power = Math.min(
    100,
    Math.round(
      (actualGain /
        ((sim.config.maxDraftBonus + sim.config.maxSlipstreamBonus) *
          MPH_PER_MPS)) *
        100,
    ),
  );
  element("power-fill").style.width = `${power}%`;
  element("power-fill").parentElement!.setAttribute(
    "aria-valuenow",
    String(power),
  );
  const slingLabels = {
    idle: leading ? "No tow at the front" : "Find a tow",
    building: "Building a run",
    ready: "Pull out now",
    blocked: "No clear opening",
    latched: "Latched · run spent",
    carrying: "Momentum fading",
  };
  element("slingshot-indicator").hidden = complete() || player.finishTime !== null ||
    !["racing", "paused"].includes(sim.phase);
  element("slingshot-indicator").dataset.state = sling.state;
  const slingLabel = sim.braking ? "Braking · run spent" : slingLabels[sling.state];
  element("slingshot-label").textContent = slingLabel;
  const slingPower = Math.round(sling.strength * 100);
  element("slingshot-fill").style.width = `${slingPower}%`;
  element("slingshot-meter").setAttribute("aria-valuenow", String(slingPower));
  element("slingshot-meter").setAttribute("aria-valuetext", `${slingLabel}, ${slingPower}%`);
  if (complete()) updateCompletedSeasonInstruments();
  updateStandings();
}
function updateCompletedSeasonInstruments() {
  const final = season.results[season.results.length - 1];
  const position = final.finishes.findIndex(
    (finish) => finish.driverId === selectedDriver().id,
  );
  element("position").textContent = String(position + 1);
  element("speed").textContent = "0";
  element("remaining").textContent = "0.00";
  element("race-time").textContent = raceTime(final.finishes[position].time);
  element("draft-state").textContent = "Season complete";
  element("draft-hint").textContent =
    "Your final driver and team standings are ready in Season.";
  element("train-size").textContent = "10 races complete";
  element("draft-gain").textContent = "+0 mph";
  element("closing-readout").textContent = "Season finished";
  element("power-fill").style.width = "0%";
  element("power-fill").parentElement!.setAttribute("aria-valuenow", "0");
  for (const [id, label] of [
    ["front-link", "Front"],
    ["rear-link", "Rear"],
  ]) {
    element(id).classList.remove("connected");
    element(id).setAttribute("aria-label", label + " draft disconnected");
  }
}
element("restart").addEventListener("click", () =>
  resetRace(sim.phase !== "ready"),
);
element("pause").addEventListener("click", () => {
  sim.togglePause();
  keys.clear();
  saveSeason();
  canvas.focus();
  updateUI();
});
element("show-season").addEventListener("click", showSeason);
element("back-to-race").addEventListener("click", showRace);
element("records-back").addEventListener("click", showRace);
element("saves-back").addEventListener("click", showRace);
element("show-records").addEventListener("click", () => showView("records"));
element("show-saves").addEventListener("click", () => showView("saves"));
element("save-now").addEventListener("click", () => {
  if (saveSeason()) announce("Game and record book saved on this device.");
});
element("export-save").addEventListener("click", () => {
  saveSeason();
  const url = URL.createObjectURL(new Blob([JSON.stringify(game, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `borrowed-speed-season-${game.current.number}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce("Backup downloaded with your current race and record book.");
});
function clearImport() {
  pendingImport = null;
  element("import-preview").hidden = true;
  element<HTMLInputElement>("import-save").value = "";
}
element("cancel-import").addEventListener("click", clearImport);
element("import-save").addEventListener("change", async () => {
  pendingImport = null;
  element("import-preview").hidden = true;
  element("import-status").textContent = "";
  const file = element<HTMLInputElement>("import-save").files?.[0];
  if (!file) return;
  try {
    const parsed = parseGame(await file.text());
    if (!parsed) throw new Error("Invalid backup");
    pendingImport = parsed;
    element("import-summary").textContent = `Season ${parsed.current.number} · ${parsed.current.season.results.length} of 10 races complete · ${parsed.archives.length} completed seasons · Saved ${new Date(parsed.savedAt).toLocaleString()}`;
    element("import-preview").hidden = false;
    element("restore-save").focus();
  } catch {
    element("import-status").textContent = "This file is not a valid Borrowed Speed backup. Your current game has not changed.";
  }
});
element("restore-save").addEventListener("click", () => {
  if (!pendingImport) return;
  game = pendingImport;
  season = game.current.season;
  previewDriverId = season.playerDriverId ?? DEFAULT_DRIVER_ID;
  activeRaceIndex = Math.min(season.results.length, SEASON_SCHEDULE.length - 1);
  activeRace = SEASON_SCHEDULE[activeRaceIndex];
  sim = makeSimulation();
  if (game.current.race) sim.restore(game.current.race);
  recorded = complete();
  tableMode = recorded ? "drivers" : "race";
  lastScreen = "";
  keys.clear();
  accumulator = 0;
  storageReadable = true;
  clearImport();
  saveSeason();
  updateSeasonViews();
  showRace();
  announce("Backup restored. Your game is ready to continue.");
});
element("audio-toggle").addEventListener("click", () => {
  const open = element("audio-options").hidden;
  element("audio-options").hidden = !open;
  element("audio-toggle").setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Node) || !element("audio-toggle").parentElement!.contains(event.target))
    closeAudio();
});
document.addEventListener("focusin", (event) => {
  if (!(event.target instanceof Node) || !element("audio-toggle").parentElement!.contains(event.target))
    closeAudio();
});
const fullscreen = element<HTMLButtonElement>("fullscreen");
fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.addEventListener("click", async () => {
  element("display-status").hidden = true;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    element("display-status").textContent = "Full screen is unavailable in this browser window.";
    element("display-status").hidden = false;
  }
});
document.addEventListener("fullscreenchange", () => {
  const enabled = document.fullscreenElement !== null;
  fullscreen.textContent = enabled ? "Exit full screen" : "Full screen";
  fullscreen.setAttribute("aria-pressed", String(enabled));
});
for (const mode of ["race", "drivers", "teams"] as const)
  element(mode + "-tab").addEventListener("click", () => {
    tableMode = mode;
    updateStandings();
  });
for (const pane of ["drivers", "teams", "history", "calendar"])
  element("overview-" + pane + "-tab").addEventListener("click", () => {
    for (const other of ["drivers", "teams", "history", "calendar"]) {
      element("overview-" + other).hidden = other !== pane;
      element("overview-" + other + "-tab").setAttribute(
        "aria-selected",
        String(other === pane),
      );
    }
  });
element("music").addEventListener("click", async () => {
  const button = element<HTMLButtonElement>("music");
  button.disabled = true;
  if (!audio.musicEnabled) button.textContent = "Loading music...";
  try {
    const enabled = await audio.toggleMusic();
    button.textContent = enabled ? "Music on" : "Music off";
    button.setAttribute("aria-pressed", String(enabled));
    button.title = "Pixel Sprinter by Zane Little Music";
  } catch {
    button.textContent = "Retry music";
    button.setAttribute("aria-pressed", "false");
    button.title = "Music could not load. Click to try again.";
  } finally {
    button.disabled = false;
  }
});
element("sound").addEventListener("click", async () => {
  const button = element<HTMLButtonElement>("sound");
  button.disabled = true;
  if (!audio.enabled) button.textContent = "Loading sound...";
  try {
    const enabled = await audio.toggle();
    button.textContent = enabled ? "Sound on" : "Sound off";
    button.setAttribute("aria-pressed", String(enabled));
  } catch {
    button.textContent = "Sound unavailable";
    button.setAttribute("aria-pressed", "false");
  } finally {
    button.disabled = false;
  }
});
const drivingKeys = ["ArrowUp", "ArrowDown", "KeyW", "KeyS", "ArrowLeft"];
window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" && !element("audio-options").hidden) {
    event.preventDefault();
    closeAudio();
    element("audio-toggle").focus();
    return;
  }
  if (event.code === "Escape" && document.fullscreenElement) return;
  if (activeView !== "race") {
    if (event.code === "Escape") {
      event.preventDefault();
      showRace();
    }
    return;
  }
  if (
    event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement
  )
    return;
  if (event.code === "Space" && event.target instanceof HTMLButtonElement)
    return;
  if (![...drivingKeys, "Space", "Escape", "KeyR"].includes(event.code)) return;
  event.preventDefault();
  if (complete() || season.playerDriverId === null) return;
  if (drivingKeys.includes(event.code)) keys.add(event.code);
  if (!event.repeat && (event.code === "Space" || event.code === "Escape")) {
    if (sim.phase === "ready") beginRace();
    else sim.togglePause();
    keys.clear();
    saveSeason();
    updateUI();
  }
  if (
    !event.repeat &&
    event.code === "KeyR" &&
    !recorded &&
    sim.player.finishTime === null
  )
    resetRace(sim.phase !== "ready");
});
window.addEventListener("keyup", (event) => keys.delete(event.code));
for (const [id, key] of [
  ["steer-up", "TouchUp"],
  ["steer-down", "TouchDown"],
  ["brake", "TouchBrake"],
]) {
  const button = element(id);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    keys.add(key);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(event, () => keys.delete(key));
}
const pauseForFocus = () => {
  keys.clear();
  audio.silence();
  if (["racing", "countdown", "finishing"].includes(sim.phase)) {
    sim.togglePause();
    updateUI();
  }
  saveSeason();
};
window.addEventListener("blur", () => {
  windowFocused = false;
  pauseForFocus();
});
window.addEventListener("focus", () => {
  windowFocused = true;
});
window.addEventListener("pagehide", () => {
  audio.silence();
  saveSeason();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseForFocus();
});
let lastTime = performance.now();
let accumulator = 0;
let autosaveTime = 0;
function frame(now: number) {
  const elapsed = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  accumulator += elapsed;
  const up = keys.has("ArrowUp") || keys.has("KeyW") || keys.has("TouchUp");
  const down =
    keys.has("ArrowDown") || keys.has("KeyS") || keys.has("TouchDown");
  const brake = keys.has("ArrowLeft") || keys.has("TouchBrake");
  while (accumulator >= FIXED_STEP) {
    const steps = sim.phase === "finishing" ? 4 : 1;
    for (let i = 0; i < steps; i++)
      if (!complete()) sim.step(FIXED_STEP, Number(down) - Number(up), brake);
    accumulator -= FIXED_STEP;
  }
  renderer.draw(sim);
  audio.update(
    sim.player.speed,
    sim.phase === "racing" && !document.hidden,
    sim.phase !== "paused" && !document.hidden && windowFocused,
  );
  uiTime += elapsed;
  if (["racing", "countdown", "finishing"].includes(sim.phase)) {
    autosaveTime += elapsed;
    if (autosaveTime >= 3) {
      updateUI();
      saveSeason();
      autosaveTime = 0;
    }
  }
  const screen = complete()
    ? "season-complete"
    : season.playerDriverId === null
      ? "selection"
      : sim.phase;
  if (uiTime >= 0.1 || lastScreen !== screen) {
    updateUI();
    uiTime = 0;
  }
  requestAnimationFrame(frame);
}
updateSeasonViews();
updateUI();
saveSeason();
requestAnimationFrame(frame);
