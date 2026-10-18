import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createSeason,
  chooseDriver,
  parseSeason,
  POINTS,
  recordRace,
  SEASON_SCHEDULE,
  driverStandings,
  teamStandings,
  startingGrid,
} from "../src/game/season.ts";
import type { RaceResult } from "../src/game/season.ts";
import { DRIVERS, TEAMS, teamById } from "../src/game/teams.ts";
import { RaceSimulation } from "../src/game/simulation.ts";
import { FIXED_STEP } from "../src/game/config.ts";
import { championshipHistory } from "../src/game/history.ts";

const ids = DRIVERS.map((d) => d.id);
const result = (index: number, order = ids): RaceResult => ({
  raceId: SEASON_SCHEDULE[index].id,
  finishes: order.map((driverId, place) => ({ driverId, time: 100 + place })),
});
const fresh = () => createSeason("hana-park", 147);

test("history starts at zero without assigning a championship position before racing", () => {
  for (const mode of ["drivers", "teams"] as const) {
    const history = championshipHistory(createSeason(), mode);
    assert.equal(history.length, mode === "drivers" ? 16 : 8);
    assert.ok(history.every((entry) => entry.values.length === 1));
    assert.deepEqual(history[0].values[0], {
      round: 0, points: 0, earned: 0, position: null, change: null,
    });
  }
});

test("points history records overtakes and uses tie-breaks for equal totals", () => {
  let season = recordRace(fresh(), result(0));
  season = recordRace(season, result(1, [...ids].reverse()));
  const saved = JSON.stringify(season);
  const drivers = championshipHistory(season, "drivers");
  const luca = drivers.find((entry) => entry.id === "luca-moretti")!;
  const maya = drivers.find((entry) => entry.id === "maya-chen")!;
  assert.deepEqual(luca.values.map((point) => point.points), [0, 25, 26]);
  assert.deepEqual(maya.values.map((point) => point.points), [0, 1, 26]);
  assert.deepEqual(maya.values.map((point) => point.position), [null, 16, 1]);
  assert.equal(maya.values[2].earned, 25);
  assert.equal(maya.values[2].change, 15);
  assert.equal(luca.values[2].position, 2);
  assert.equal(luca.values[2].change, -1);
  assert.equal(luca.values[1].change, null);
  assert.equal(maya.dashed, true);
  assert.equal(luca.dashed, false);
  const teams = championshipHistory(season, "teams");
  const apex = teams.find((entry) => entry.id === "apex-union")!;
  const tideway = teams.find((entry) => entry.id === "tideway")!;
  assert.deepEqual(apex.values.map((point) => point.points), [0, 47, 50]);
  assert.deepEqual(tideway.values.map((point) => point.points), [0, 3, 50]);
  assert.equal(apex.values[2].position, 2);
  assert.equal(tideway.values[2].position, 1);
  assert.equal(tideway.values[2].change, 7);
  assert.equal(tideway.values[2].earned, 47);
  assert.equal(JSON.stringify(season), saved);
  assert.deepEqual(championshipHistory(parseSeason(saved)!, "teams"), teams);
});

test("full-season history conserves points at every round and ends at the championship totals", () => {
  let season = fresh();
  for (let round = 0; round < SEASON_SCHEDULE.length; round++)
    season = recordRace(season, result(round, round % 2 ? [...ids].reverse() : ids));
  const drivers = championshipHistory(season, "drivers");
  const teams = championshipHistory(season, "teams");
  for (let round = 1; round <= 10; round++) {
    for (const history of [drivers, teams])
      assert.equal(history.reduce((sum, entry) => sum + entry.values[round].points, 0), round * 173);
    for (const team of teams)
      assert.equal(team.values[round].points, drivers.filter((entry) => entry.teamId === team.id).reduce((sum, entry) => sum + entry.values[round].points, 0));
  }
  for (const row of driverStandings(season))
    assert.equal(drivers.find((entry) => entry.id === row.driver.id)!.values[10].points, row.points);
  for (const row of teamStandings(season))
    assert.equal(teams.find((entry) => entry.id === row.team.id)!.values[10].points, row.points);
});

test("sixteen unique drivers belong to eight two-driver teams; the ten races have varied distances and four settings", () => {
  assert.equal(new Set(ids).size, 16);
  assert.equal(new Set(DRIVERS.map((d) => d.number)).size, 16);
  assert.equal(TEAMS.length, 8);
  for (const team of TEAMS)
    assert.equal(DRIVERS.filter((d) => d.teamId === team.id).length, 2);
  assert.equal(SEASON_SCHEDULE.length, 10);
  assert.ok(new Set(SEASON_SCHEDULE.map((r) => r.miles)).size >= 6);
  assert.equal(new Set(SEASON_SCHEDULE.map((r) => r.setting)).size, 4);
  assert.equal(POINTS.length, 16);
  assert.equal(POINTS[15], 1);
  assert.ok(POINTS.every((n, i) => n > 0 && (!i || n < POINTS[i - 1])));
});
test("the player chooses one driver and locks that identity before any race result", () => {
  const season = createSeason();
  assert.equal(season.playerDriverId, null);
  assert.throws(() => recordRace(season, result(0)));
  const chosen = chooseDriver(season, "elena-voss");
  assert.equal(chooseDriver(chosen, "elena-voss"), chosen);
  assert.throws(() => chooseDriver(chosen, "maya-chen"));
  assert.throws(() => chooseDriver(season, "unknown"));
  assert.equal(
    parseSeason(JSON.stringify(chosen))!.playerDriverId,
    "elena-voss",
  );
});
test("the opening draw is reproducible, includes all drivers, and does not depend on the chosen player", () => {
  const a = startingGrid(createSeason(null, 527));
  assert.equal(new Set(a).size, 16);
  assert.deepEqual([...a].sort(), [...ids].sort());
  assert.deepEqual(startingGrid(createSeason("zoe-hart", 527)), a);
  assert.notDeepEqual(startingGrid(createSeason(null, 528)), a);
});
test("all sixteen finishers earn points and each team combines both drivers", () => {
  const first = result(0);
  const season = recordRace(fresh(), first);
  assert.deepEqual(
    driverStandings(season).map((row) => row.points),
    [...POINTS],
  );
  const teams = teamStandings(season);
  for (const row of teams) {
    const expected = ids.reduce(
      (sum, id, i) => sum + (DRIVERS[i].teamId === row.team.id ? POINTS[i] : 0),
      0,
    );
    assert.equal(row.points, expected);
  }
  assert.equal(teams[0].points, 47);
  assert.equal(recordRace(season, first), season);
  assert.throws(() => recordRace(season, result(0, [...ids].reverse())));
});
test("subsequent grids reverse individual championship rank, including its tie-breakers", () => {
  let season = recordRace(fresh(), result(0));
  assert.deepEqual(startingGrid(season), [...ids].reverse());
  season = recordRace(season, result(1, [...ids].reverse()));
  // A and P each have 26 points, both have a win and a last place. P ranks ahead on the latest finish.
  const table = driverStandings(season);
  assert.equal(table.find((r) => r.driver.id === ids[0])!.points, 26);
  assert.equal(table.find((r) => r.driver.id === ids[15])!.points, 26);
  assert.ok(
    table.findIndex((r) => r.driver.id === ids[0]) >
      table.findIndex((r) => r.driver.id === ids[15]),
  );
  assert.deepEqual(
    startingGrid(season),
    table.map((r) => r.driver.id).reverse(),
  );
  assert.equal(
    startingGrid(season).indexOf(ids[0]) <
      startingGrid(season).indexOf(ids[15]),
    true,
  );
});
test("a selected driver can occupy any grid slot; starts have two columns and eight rows", () => {
  const grid = startingGrid(fresh());
  for (const driver of DRIVERS) {
    const sim = new RaceSimulation({}, 173, {
      playerDriverId: driver.id,
      grid,
    });
    assert.equal(sim.cars.filter((car) => car.player).length, 1);
    assert.equal(sim.player.driverId, driver.id);
    assert.equal(sim.player.gridPosition, grid.indexOf(driver.id) + 1);
    assert.equal(new Set(sim.cars.map((car) => car.lateral)).size, 2);
    const rows = sim.cars.filter((car) => car.lateral < 0);
    assert.equal(rows.length, 8);
    assert.equal(new Set(rows.map((car) => car.progress)).size, 8);
    assert.deepEqual(
      sim.standings.map((car) => car.driverId),
      grid,
    );
    assert.ok(sim.cars.every((car, i) => car.id === i && teamById(car.teamId)));
  }
});
test("partial fields, duplicate drivers, impossible times, and out-of-order races cannot score", () => {
  assert.throws(() =>
    recordRace(fresh(), {
      ...result(0),
      finishes: result(0).finishes.slice(1),
    }),
  );
  const duplicate = result(0);
  duplicate.finishes[15].driverId = duplicate.finishes[0].driverId;
  assert.throws(() => recordRace(fresh(), duplicate));
  assert.throws(() => recordRace(fresh(), result(1)));
  for (const time of [-1, NaN, Infinity, 1]) {
    const invalid = result(0);
    invalid.finishes[15].time = time;
    assert.throws(() => recordRace(fresh(), invalid));
  }
});
test("version two saves round-trip; old or incomplete saves do not load as the new format", () => {
  const season = recordRace(fresh(), result(0));
  assert.deepEqual(parseSeason(JSON.stringify(season)), season);
  assert.deepEqual(
    parseSeason(JSON.stringify(createSeason(null, 0))),
    createSeason(null, 0),
  );
  const { gridSeed: _seed, ...missingSeed } = season;
  const { playerDriverId: _driver, ...missingDriver } = season;
  for (const value of [
    null,
    "{",
    "{}",
    JSON.stringify({ version: 1, results: [] }),
    JSON.stringify(missingSeed),
    JSON.stringify(missingDriver),
    JSON.stringify({ ...season, playerDriverId: null }),
    JSON.stringify({ ...season, gridSeed: -1 }),
    JSON.stringify({ ...season, playerDriverId: "<script>" }),
  ]) {
    assert.equal(parseSeason(value), null);
  }
});
test("ten actual sixteen-driver races complete with reverse grids, both championships, and conserved points", () => {
  let season = fresh();
  for (const race of SEASON_SCHEDULE) {
    const sim = new RaceSimulation(
      { miles: race.miles },
      race.seed ^ season.gridSeed,
      {
        playerDriverId: season.playerDriverId!,
        grid: startingGrid(season),
        setting: race.setting,
      },
    );
    sim.start(true);
    for (let tick = 0; tick < 30000 && sim.phase !== "finished"; tick++)
      sim.step(FIXED_STEP);
    assert.equal(sim.phase, "finished");
    season = recordRace(season, {
      raceId: race.id,
      finishes: sim.standings.map((car) => ({
        driverId: car.driverId,
        time: car.finishTime!,
      })),
    });
  }
  assert.equal(season.results.length, 10);
  for (const table of [driverStandings(season), teamStandings(season)]) {
    assert.equal(
      table.reduce((sum, row) => sum + row.points, 0),
      10 * POINTS.reduce((a, b) => a + b, 0),
    );
    assert.equal(
      table.reduce((sum, row) => sum + row.wins, 0),
      10,
    );
  }
  assert.ok(
    driverStandings(season).every(
      (row) => row.finishes.reduce((a, b) => a + b, 0) === 10,
    ),
  );
  assert.ok(
    teamStandings(season).every(
      (row) => row.finishes.reduce((a, b) => a + b, 0) === 20,
    ),
  );
  assert.deepEqual(parseSeason(JSON.stringify(season)), season);
  assert.throws(() => recordRace(season, { ...result(0), raceId: "race-11" }));
});
