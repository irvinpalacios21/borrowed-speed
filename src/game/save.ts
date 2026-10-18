import { createSeason, parseSeason, driverStandings, teamStandings, startingGrid, SEASON_SCHEDULE } from "./season.ts";
import type { SeasonState } from "./season.ts";
import { RaceSimulation } from "./simulation.ts";
import type { RaceSnapshot } from "./simulation.ts";
import { DRIVERS, TEAMS, driverById } from "./teams.ts";

// Keep the original key so Borrowed Speed loads games saved before the rename.
export const GAME_STORAGE_KEY = "slipstream-game-v1";
export interface SavedSeason {
  id: string;
  number: number;
  season: SeasonState;
}
export interface ArchivedSeason extends SavedSeason {
  completedAt: string;
}
export interface GameSave {
  version: 1;
  savedAt: string;
  current: SavedSeason & { race: RaceSnapshot | null };
  archives: ArchivedSeason[];
}
const timestamp = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value);
const cloneSeason = (season: SeasonState) => parseSeason(JSON.stringify(season))!;

export function createGame(season = createSeason()): GameSave {
  return archiveCompletedSeason({
    version: 1, savedAt: new Date().toISOString(),
    current: { id: crypto.randomUUID(), number: 1, season: cloneSeason(season), race: null },
    archives: [],
  });
}

export function archiveCompletedSeason(game: GameSave): GameSave {
  if (game.current.season.results.length !== SEASON_SCHEDULE.length ||
    game.archives.some((entry) => entry.id === game.current.id)) return game;
  return {
    ...game,
    archives: [...game.archives, {
      id: game.current.id, number: game.current.number,
      completedAt: new Date().toISOString(), season: cloneSeason(game.current.season),
    }],
  };
}

export function nextSeason(game: GameSave, gridSeed: number): GameSave {
  if (game.current.season.results.length !== SEASON_SCHEDULE.length)
    throw new Error("Complete this season before starting the next one.");
  const archived = archiveCompletedSeason(game);
  return {
    ...archived, current: {
      id: crypto.randomUUID(), number: game.current.number + 1,
      season: createSeason(null, gridSeed), race: null,
    },
  };
}

// A backup is accepted only when its entire career and current race validate.
// Never partially import it and silently lose some of the record book.
export function parseGame(raw: string | null): GameSave | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as GameSave;
    if (!value || value.version !== 1 || !timestamp(value.savedAt) ||
      !value.current || !validId(value.current.id) ||
      !Number.isSafeInteger(value.current.number) || value.current.number < 1 ||
      !Array.isArray(value.archives)) return null;
    const season = parseSeason(JSON.stringify(value.current.season));
    if (!season) return null;
    const ids = new Set<string>();
    const numbers = new Set<number>();
    const archives: ArchivedSeason[] = [];
    for (const entry of value.archives) {
      if (!entry || !validId(entry.id) || ids.has(entry.id) ||
        !Number.isSafeInteger(entry.number) || entry.number < 1 ||
        entry.number > value.current.number || numbers.has(entry.number) ||
        !timestamp(entry.completedAt)) return null;
      const archived = parseSeason(JSON.stringify(entry.season));
      if (!archived || archived.results.length !== SEASON_SCHEDULE.length ||
        ((entry.id === value.current.id) !== (entry.number === value.current.number)) ||
        (entry.id === value.current.id && JSON.stringify(archived) !== JSON.stringify(season))) return null;
      ids.add(entry.id);
      numbers.add(entry.number);
      archives.push({ id: entry.id, number: entry.number, completedAt: entry.completedAt, season: archived });
    }
    let race: RaceSnapshot | null = null;
    if (value.current.race !== null) {
      const event = SEASON_SCHEDULE[season.results.length];
      if (!event || !season.playerDriverId) return null;
      const sim = new RaceSimulation({ miles: event.miles }, (event.seed ^ season.gridSeed) >>> 0, {
        grid: startingGrid(season), playerDriverId: season.playerDriverId, setting: event.setting,
      });
      if (!sim.restore(value.current.race)) return null;
      race = sim.snapshot();
    }
    return archiveCompletedSeason({
      version: 1, savedAt: value.savedAt,
      current: { id: value.current.id, number: value.current.number, season, race }, archives,
    });
  } catch {
    return null;
  }
}

export interface CareerRecord {
  id: string;
  starts: number;
  wins: number;
  podiums: number;
  championships: number;
  points: number;
}
export function careerRecords(game: GameSave, mode: "drivers" | "teams"): CareerRecord[] {
  const records = (mode === "drivers" ? DRIVERS : TEAMS).map((entry) => ({
    id: entry.id, starts: 0, wins: 0, podiums: 0, championships: 0, points: 0,
  }));
  const seasons = game.archives.map((entry) => entry.season);
  if (!game.archives.some((entry) => entry.id === game.current.id)) seasons.push(game.current.season);
  for (const season of seasons) {
    const standings = mode === "drivers"
      ? driverStandings(season).map((row) => ({ ...row, id: row.driver.id }))
      : teamStandings(season).map((row) => ({ ...row, id: row.team.id }));
    standings.forEach((standing, position) => {
      const record = records.find((row) => row.id === standing.id)!;
      record.starts += season.results.length * (mode === "teams" ? 2 : 1);
      record.points += standing.points;
      record.wins += standing.wins;
      record.podiums += standing.finishes.slice(0, 3).reduce((sum, count) => sum + count, 0);
      if (position === 0 && season.results.length === SEASON_SCHEDULE.length) record.championships++;
    });
  }
  return records.sort((a, b) => b.championships - a.championships || b.wins - a.wins ||
    b.podiums - a.podiums || b.points - a.points);
}

export function racePodiums(season: SeasonState) {
  return season.results.map((result) => ({
    raceId: result.raceId,
    drivers: result.finishes.slice(0, 3).map((finish) => driverById(finish.driverId)),
  }));
}
