import { test } from "node:test";
import assert from "node:assert/strict";
import { createGame, parseGame, archiveCompletedSeason, nextSeason, careerRecords } from "../src/game/save.ts";
import { createSeason, recordRace, SEASON_SCHEDULE, startingGrid } from "../src/game/season.ts";
import { DRIVERS } from "../src/game/teams.ts";
import { RaceSimulation } from "../src/game/simulation.ts";
import { FIXED_STEP } from "../src/game/config.ts";

function seasonWithRounds(rounds: number, reverse = false) {
  let season = createSeason("hana-park", 173);
  for (let round = 0; round < rounds; round++) {
    season = recordRace(season, {
      raceId: SEASON_SCHEDULE[round].id,
      finishes: (reverse ? [...DRIVERS].reverse() : DRIVERS).map((driver, i) => ({ driverId: driver.id, time: 100 + i })),
    });
  }
  return season;
}
function simulation() {
  const season = seasonWithRounds(0);
  return new RaceSimulation({ miles: 6 }, 173 ^ season.gridSeed, {
    playerDriverId: season.playerDriverId!, grid: startingGrid(season), setting: "coastal",
  });
}

test("race snapshots resume paused and preserve deterministic opponent decisions and car dynamics", () => {
  const original = simulation();
  original.start(true);
  for (let tick = 0; tick < 4000; tick++) original.step(FIXED_STEP, tick < 100 ? 1 : 0);
  const snapshot = JSON.parse(JSON.stringify(original.snapshot()));
  const restored = simulation();
  assert.equal(restored.restore(snapshot), true);
  assert.equal(restored.phase, "paused");
  assert.deepEqual(restored.snapshot(), original.snapshot());
  restored.togglePause();
  for (let tick = 0; tick < 15000 && original.phase !== "finished"; tick++) {
    original.step(FIXED_STEP);
    restored.step(FIXED_STEP);
  }
  assert.equal(original.phase, "finished");
  assert.equal(restored.phase, "finished");
  assert.deepEqual(restored.cars, original.cars);
  assert.equal(restored.elapsed, original.elapsed);
});

test("countdown and field-finishing checkpoints restore their respective phases", () => {
  const sim = simulation();
  sim.start();
  sim.step(FIXED_STEP);
  const restored = simulation();
  assert.equal(restored.restore(sim.snapshot()), true);
  restored.togglePause();
  assert.equal(restored.phase, "countdown");
  for (let tick = 0; tick < 25000 && sim.phase !== "finishing"; tick++) sim.step(FIXED_STEP);
  assert.equal(sim.phase, "finishing");
  assert.equal(restored.restore(sim.snapshot()), true);
  restored.togglePause();
  assert.equal(restored.phase, "finishing");
  assert.equal(restored.player.finishTime, sim.player.finishTime);
});

test("invalid snapshots do not mutate the simulation or its roster", () => {
  const sim = simulation();
  sim.start(true);
  sim.step(FIXED_STEP);
  const before = sim.snapshot()!;
  for (const alter of [
    (saved: typeof before) => { saved.cars[0].speed = -1; },
    (saved: typeof before) => { saved.cars[0].driverId = "unknown"; },
    (saved: typeof before) => { saved.cars[0].latchedToId = 999; },
    (saved: typeof before) => { saved.cars[0].aiBrakeUntil = -1; },
    (saved: typeof before) => { saved.cars[0].aiBrakeDecisionAt = NaN; },
    (saved: typeof before) => { saved.cars[0].lateral = 20; },
    (saved: typeof before) => { saved.randomState = -1; },
    (saved: typeof before) => { saved.cars.pop(); },
  ]) {
    const invalid = structuredClone(before);
    alter(invalid);
    assert.equal(sim.restore(invalid), false);
    assert.deepEqual(sim.snapshot(), before);
  }
});

test("race checkpoints from before AI braking restore without losing race progress", () => {
  const original = simulation();
  original.start(true);
  for (let tick = 0; tick < 1200; tick++) original.step(FIXED_STEP);
  const old = JSON.parse(JSON.stringify(original.snapshot()));
  for (const car of old.cars) {
    delete car.aiBrakeUntil;
    delete car.aiBrakeDecisionAt;
  }
  const restored = simulation();
  assert.ok(restored.restore(old));
  assert.equal(restored.elapsed, original.elapsed);
  assert.deepEqual(restored.cars.map((car) => [car.progress, car.speed, car.latchedToId]),
    original.cars.map((car) => [car.progress, car.speed, car.latchedToId]));
  assert.ok(restored.cars.every((car) => car.aiBrakeUntil === 0 && !car.braking));
});

test("completed legacy seasons are archived once and kept intact across new seasons and backup round trips", () => {
  const completed = seasonWithRounds(10);
  const game = createGame(completed);
  assert.equal(game.archives.length, 1);
  assert.equal(archiveCompletedSeason(game), game);
  let next = nextSeason(game, 999);
  assert.equal(next.current.number, 2);
  assert.equal(next.current.season.playerDriverId, null);
  assert.deepEqual(next.archives[0].season, completed);
  next.current.season = seasonWithRounds(10, true);
  next = archiveCompletedSeason(next);
  assert.equal(next.archives.length, 2);
  const restored = parseGame(JSON.stringify(next))!;
  assert.deepEqual(restored, next);
  assert.equal(archiveCompletedSeason(restored), restored);
  assert.equal(nextSeason(restored, 8).current.number, 3);
  assert.throws(() => nextSeason(createGame(seasonWithRounds(1)), 8));
});

test("career records combine archived and current races with no double count and award titles only at completion", () => {
  const first = createGame(seasonWithRounds(10));
  let second = nextSeason(first, 333);
  second.current.season = seasonWithRounds(2, true);
  let drivers = careerRecords(second, "drivers");
  let teams = careerRecords(second, "teams");
  assert.equal(drivers.reduce((sum, row) => sum + row.wins, 0), 12);
  assert.equal(drivers.reduce((sum, row) => sum + row.podiums, 0), 36);
  assert.equal(drivers.reduce((sum, row) => sum + row.championships, 0), 1);
  assert.equal(teams.reduce((sum, row) => sum + row.championships, 0), 1);
  assert.equal(drivers.find((row) => row.id === DRIVERS[0].id)!.wins, 10);
  assert.equal(drivers.find((row) => row.id === DRIVERS[15].id)!.wins, 2);
  second.current.season = seasonWithRounds(10, true);
  const unarchived = careerRecords(second, "drivers");
  second = archiveCompletedSeason(second);
  drivers = careerRecords(second, "drivers");
  teams = careerRecords(second, "teams");
  assert.deepEqual(drivers, unarchived);
  assert.equal(drivers.reduce((sum, row) => sum + row.wins, 0), 20);
  assert.equal(drivers.reduce((sum, row) => sum + row.podiums, 0), 60);
  assert.equal(teams.reduce((sum, row) => sum + row.championships, 0), 2);
  assert.equal(teams.reduce((sum, row) => sum + row.podiums, 0), 60);
  assert.ok(drivers.every((row) => row.starts === 20));
});

test("full game backups validate both the current checkpoint and every archived season", () => {
  const game = nextSeason(createGame(seasonWithRounds(10)), 173);
  game.current.season = seasonWithRounds(0);
  const sim = simulation();
  sim.start(true);
  for (let i = 0; i < 600; i++) sim.step(FIXED_STEP);
  game.current.race = sim.snapshot();
  assert.deepEqual(parseGame(JSON.stringify(game)), game);
  for (const alter of [
    (saved: typeof game) => { saved.archives[0].season.results.pop(); },
    (saved: typeof game) => { saved.archives.push(saved.archives[0]); },
    (saved: typeof game) => { saved.current.race!.cars[0].speed = -1; },
    (saved: typeof game) => { saved.savedAt = "invalid"; },
    (saved: typeof game) => { saved.archives[0].id = "<script>"; },
  ]) {
    const invalid = structuredClone(game);
    alter(invalid);
    assert.equal(parseGame(JSON.stringify(invalid)), null);
  }
  assert.equal(parseGame("{"), null);
  assert.equal(parseGame(null), null);
});
