import { DRIVERS, TEAMS, driverById } from "./teams.ts";
import type { Driver, Team } from "./teams.ts";
import type { SettingId } from "./settings.ts";

// Keep the original key for season migration and compatibility copies.
export const SEASON_STORAGE_KEY = "slipstream-season-v2";
export const POINTS = [
  25, 22, 20, 18, 16, 14, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1,
] as const;
export const SEASON_SCHEDULE = [
  {
    id: "opening-run",
    name: "Opening run",
    miles: 6,
    seed: 173,
    setting: "coastal",
  },
  {
    id: "harbor-dash",
    name: "Harbor dash",
    miles: 7.5,
    seed: 281,
    setting: "night",
  },
  {
    id: "copper-classic",
    name: "Copper classic",
    miles: 8,
    seed: 409,
    setting: "desert",
  },
  {
    id: "pinecrest-sprint",
    name: "Pinecrest sprint",
    miles: 6.5,
    seed: 541,
    setting: "forest",
  },
  {
    id: "midseason-run",
    name: "Midseason run",
    miles: 9,
    seed: 653,
    setting: "night",
  },
  {
    id: "union-straight",
    name: "Union straight",
    miles: 7,
    seed: 787,
    setting: "desert",
  },
  {
    id: "coastal-challenge",
    name: "Coastal challenge",
    miles: 8.5,
    seed: 919,
    setting: "coastal",
  },
  {
    id: "ember-dash",
    name: "Ember dash",
    miles: 6,
    seed: 1031,
    setting: "desert",
  },
  {
    id: "silverline-cup",
    name: "Silverline cup",
    miles: 9.5,
    seed: 1153,
    setting: "forest",
  },
  {
    id: "season-finale",
    name: "Season finale",
    miles: 10,
    seed: 1297,
    setting: "night",
  },
] as const satisfies readonly {
  id: string;
  name: string;
  miles: number;
  seed: number;
  setting: SettingId;
}[];

export interface DriverFinish {
  driverId: string;
  time: number;
}
export interface RaceResult {
  raceId: string;
  finishes: DriverFinish[];
}
export interface SeasonState {
  version: 2;
  playerDriverId: string | null;
  gridSeed: number;
  results: RaceResult[];
}
interface StandingRecord {
  points: number;
  wins: number;
  finishes: number[];
  lastPosition: number;
}
export interface DriverStanding extends StandingRecord {
  driver: Driver;
}
export interface TeamStanding extends StandingRecord {
  team: Team;
}

export function createSeason(
  playerDriverId: string | null = null,
  gridSeed = 173,
): SeasonState {
  if (
    playerDriverId !== null &&
    !DRIVERS.some((driver) => driver.id === playerDriverId)
  )
    throw new Error("Unknown player driver.");
  if (!Number.isInteger(gridSeed) || gridSeed < 0 || gridSeed > 0xffffffff)
    throw new Error("Invalid season draw seed.");
  return { version: 2, playerDriverId, gridSeed, results: [] };
}

export function chooseDriver(
  season: SeasonState,
  driverId: string,
): SeasonState {
  if (!DRIVERS.some((driver) => driver.id === driverId))
    throw new Error("Unknown player driver.");
  if (season.playerDriverId === driverId) return season;
  if (season.playerDriverId !== null || season.results.length)
    throw new Error("The player driver is locked for this season.");
  return { ...season, playerDriverId: driverId };
}

function validResult(value: unknown, index: number): value is RaceResult {
  if (!value || typeof value !== "object") return false;
  const result = value as RaceResult;
  if (
    result.raceId !== SEASON_SCHEDULE[index]?.id ||
    !Array.isArray(result.finishes) ||
    result.finishes.length !== DRIVERS.length
  )
    return false;
  const seen = new Set<string>();
  let previousTime = 0;
  for (const finish of result.finishes) {
    if (
      !finish ||
      typeof finish !== "object" ||
      !DRIVERS.some((driver) => driver.id === finish.driverId) ||
      seen.has(finish.driverId) ||
      !Number.isFinite(finish.time) ||
      finish.time <= 0 ||
      finish.time < previousTime
    )
      return false;
    seen.add(finish.driverId);
    previousTime = finish.time;
  }
  return true;
}

export function parseSeason(raw: string | null): SeasonState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SeasonState;
    if (
      !value ||
      value.version !== 2 ||
      (value.playerDriverId !== null &&
        typeof value.playerDriverId !== "string") ||
      !Number.isInteger(value.gridSeed) ||
      value.gridSeed < 0 ||
      value.gridSeed > 0xffffffff ||
      !Array.isArray(value.results) ||
      value.results.length > SEASON_SCHEDULE.length ||
      (value.playerDriverId === null && value.results.length > 0) ||
      !value.results.every((result, index) => validResult(result, index))
    )
      return null;
    const clean = createSeason(value.playerDriverId, value.gridSeed);
    clean.results = value.results.map((result) => ({
      raceId: result.raceId,
      finishes: result.finishes.map((finish) => ({
        driverId: finish.driverId,
        time: finish.time,
      })),
    }));
    return clean;
  } catch {
    return null;
  }
}

export function recordRace(
  season: SeasonState,
  result: RaceResult,
): SeasonState {
  if (season.playerDriverId === null)
    throw new Error("Choose a player driver before racing.");
  const existing = season.results.find((race) => race.raceId === result.raceId);
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(result)) return season;
    throw new Error("A completed race cannot be scored again.");
  }
  if (!validResult(result, season.results.length))
    throw new Error(
      "A result must contain all sixteen drivers for the next scheduled race.",
    );
  return {
    ...season,
    results: [
      ...season.results,
      {
        raceId: result.raceId,
        finishes: result.finishes.map((finish) => ({ ...finish })),
      },
    ],
  };
}

function compareRecords(a: StandingRecord, b: StandingRecord) {
  if (a.points !== b.points) return b.points - a.points;
  for (let place = 0; place < DRIVERS.length; place++) {
    if (a.finishes[place] !== b.finishes[place])
      return b.finishes[place] - a.finishes[place];
  }
  return a.lastPosition - b.lastPosition;
}
const emptyRecord = (): StandingRecord => ({
  points: 0,
  wins: 0,
  finishes: Array<number>(DRIVERS.length).fill(0),
  lastPosition: DRIVERS.length + 1,
});

export function driverStandings(season: SeasonState): DriverStanding[] {
  const standings = DRIVERS.map((driver) => ({ driver, ...emptyRecord() }));
  for (const result of season.results)
    result.finishes.forEach((finish, position) => {
      const standing = standings.find(
        (row) => row.driver.id === finish.driverId,
      )!;
      standing.points += POINTS[position];
      standing.finishes[position]++;
      if (position === 0) standing.wins++;
      standing.lastPosition = position + 1;
    });
  return standings.sort(
    (a, b) =>
      compareRecords(a, b) ||
      DRIVERS.indexOf(a.driver) - DRIVERS.indexOf(b.driver),
  );
}

export function teamStandings(season: SeasonState): TeamStanding[] {
  const standings = TEAMS.map((team) => ({ team, ...emptyRecord() }));
  for (const result of season.results) {
    for (const row of standings) row.lastPosition = DRIVERS.length + 1;
    result.finishes.forEach((finish, position) => {
      const driver = driverById(finish.driverId);
      const standing = standings.find((row) => row.team.id === driver.teamId)!;
      standing.points += POINTS[position];
      standing.finishes[position]++;
      if (position === 0) standing.wins++;
      standing.lastPosition = Math.min(standing.lastPosition, position + 1);
    });
  }
  return standings.sort(
    (a, b) =>
      compareRecords(a, b) || TEAMS.indexOf(a.team) - TEAMS.indexOf(b.team),
  );
}

export function startingGrid(season: SeasonState): string[] {
  if (season.results.length)
    return driverStandings(season)
      .reverse()
      .map((row) => row.driver.id);
  const grid = DRIVERS.map((driver) => driver.id);
  let state = season.gridSeed >>> 0;
  for (let i = grid.length - 1; i > 0; i--) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const other = Math.floor((state / 4294967296) * (i + 1));
    [grid[i], grid[other]] = [grid[other], grid[i]];
  }
  return grid;
}
