import { driverStandings, teamStandings } from "./season.ts";
import type { SeasonState } from "./season.ts";
import { DRIVERS, TEAMS, teamById } from "./teams.ts";

export type HistoryMode = "drivers" | "teams";
export interface HistoryPoint {
  round: number;
  points: number;
  earned: number;
  position: number | null;
  change: number | null;
}
export interface HistorySeries {
  id: string;
  name: string;
  teamId: string;
  color: string;
  number: string | null;
  dashed: boolean;
  values: HistoryPoint[];
}

// Use the same standings and tie-breaks as the championship at every round.
// History is derived from results, so existing saves need no migration.
export function championshipHistory(
  season: SeasonState,
  mode: HistoryMode,
): HistorySeries[] {
  const series: HistorySeries[] = mode === "drivers"
    ? DRIVERS.map((driver) => ({
        id: driver.id,
        name: driver.name,
        teamId: driver.teamId,
        color: teamById(driver.teamId).color,
        number: driver.number,
        dashed: driver.seat === 1,
        values: [],
      }))
    : TEAMS.map((team) => ({
        id: team.id,
        name: team.name,
        teamId: team.id,
        color: team.color,
        number: null,
        dashed: false,
        values: [],
      }));

  for (const entry of series)
    entry.values.push({ round: 0, points: 0, earned: 0, position: null, change: null });

  for (let round = 1; round <= season.results.length; round++) {
    const partial = { ...season, results: season.results.slice(0, round) };
    const standings = mode === "drivers"
      ? driverStandings(partial).map((row) => ({ id: row.driver.id, points: row.points }))
      : teamStandings(partial).map((row) => ({ id: row.team.id, points: row.points }));
    standings.forEach((row, index) => {
      const entry = series.find((item) => item.id === row.id)!;
      const previous = entry.values[round - 1];
      entry.values.push({
        round,
        points: row.points,
        earned: row.points - previous.points,
        position: index + 1,
        change: previous.position === null ? null : previous.position - index - 1,
      });
    });
  }
  return series;
}
