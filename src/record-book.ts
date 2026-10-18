import { careerRecords, racePodiums } from "./game/save.ts";
import type { GameSave } from "./game/save.ts";
import { driverStandings, teamStandings, SEASON_SCHEDULE } from "./game/season.ts";
import { driverById, teamById } from "./game/teams.ts";

export class RecordBook {
  private game!: GameSave;
  private mode: "seasons" | "drivers" | "teams" = "seasons";
  private selectedId: string | null = null;
  constructor(private container: HTMLElement) {
    container.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-record-mode]");
      if (!button) return;
      this.mode = button.dataset.recordMode as typeof this.mode;
      this.render();
      this.container.querySelector<HTMLButtonElement>(`[data-record-mode="${this.mode}"]`)?.focus();
    });
    container.addEventListener("change", (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      this.selectedId = event.target.value;
      this.render();
      this.container.querySelector<HTMLSelectElement>("select")?.focus();
    });
  }
  update(game: GameSave) {
    this.game = game;
    this.render();
  }
  private render() {
    this.container.innerHTML = `
      <div class="overview-tabs" role="tablist" aria-label="Record book">
        ${([ ["seasons", "Seasons"], ["drivers", "Driver careers"], ["teams", "Team careers"] ] as const).map(([mode, label]) => `<button id="records-${mode}-tab" role="tab" aria-selected="${mode === this.mode}" aria-controls="records-content" data-record-mode="${mode}">${label}</button>`).join("")}
      </div>
      <div id="records-content" class="overview-pane" role="tabpanel" aria-labelledby="records-${this.mode}-tab">
        ${this.mode === "seasons" ? this.seasons() : this.careers(this.mode)}
      </div>`;
  }
  private seasons() {
    const archives = [...this.game.archives].sort((a, b) => b.number - a.number);
    if (!archives.length) return `<div class="records-empty"><h3>No completed seasons yet</h3><p>Finish all ten races to add this season to the record book. Race wins and podiums already count in Driver careers and Team careers.</p></div>`;
    const selected = archives.find((entry) => entry.id === this.selectedId) ?? archives[0];
    const drivers = driverStandings(selected.season);
    const teams = teamStandings(selected.season);
    return `<div class="record-season-picker"><label for="record-season">Completed season</label><select id="record-season">${archives.map((entry) => `<option value="${entry.id}" ${entry.id === selected.id ? "selected" : ""}>Season ${entry.number}</option>`).join("")}</select><span>${new Date(selected.completedAt).toLocaleDateString()}</span></div>
      <div class="record-champions"><div><span>Driver champion</span><strong>${drivers[0].driver.name}</strong><small>${drivers[0].points} points · ${drivers[0].wins} wins</small></div><div><span>Team champion</span><strong>${teams[0].team.name}</strong><small>${teams[0].points} points · ${teams[0].wins} wins</small></div></div>
      <p class="record-player">Played as ${driverById(selected.season.playerDriverId!).name} · Season ${selected.number} · 10 races</p>
      <h3>Final driver standings</h3><div class="record-table-wrap"><table class="championship-table" aria-label="Archived driver standings"><thead><tr><th>Pos</th><th>Driver</th><th>Wins</th><th>Podiums</th><th>Points</th></tr></thead><tbody>${drivers.map((row, i) => `<tr data-driver-id="${row.driver.id}"><td>${i + 1}</td><th scope="row">${row.driver.name}</th><td>${row.wins}</td><td>${row.finishes.slice(0, 3).reduce((a, b) => a + b, 0)}</td><td>${row.points}</td></tr>`).join("")}</tbody></table></div>
      <h3>Final team standings</h3><div class="record-table-wrap"><table class="championship-table" aria-label="Archived team standings"><thead><tr><th>Pos</th><th>Team</th><th>Wins</th><th>Podiums</th><th>Points</th></tr></thead><tbody>${teams.map((row, i) => `<tr data-team-id="${row.team.id}"><td>${i + 1}</td><th scope="row">${row.team.name}</th><td>${row.wins}</td><td>${row.finishes.slice(0, 3).reduce((a, b) => a + b, 0)}</td><td>${row.points}</td></tr>`).join("")}</tbody></table></div>
      <h3>Race podiums</h3><div class="record-table-wrap"><table class="championship-table podium-table" aria-label="Season race podiums"><thead><tr><th>Race</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead><tbody>${racePodiums(selected.season).map((podium) => `<tr><th scope="row">${SEASON_SCHEDULE.find((race) => race.id === podium.raceId)!.name}</th>${podium.drivers.map((driver) => `<td>${driver.name}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  private careers(mode: "drivers" | "teams") {
    const rows = careerRecords(this.game, mode);
    return `<h3>${mode === "drivers" ? "Driver" : "Team"} career records</h3><p class="record-player">Includes completed races in the current season. Titles count after the season ends. A podium is a race finish in the top three.</p><div class="record-table-wrap"><table class="championship-table career-table" aria-label="${mode === "drivers" ? "Driver" : "Team"} career records"><thead><tr><th>${mode === "drivers" ? "Driver" : "Team"}</th><th>Titles</th><th>Wins</th><th>Podiums</th><th>Starts</th><th>Points</th></tr></thead><tbody>${rows.map((row) => `<tr data-career-id="${row.id}"><th scope="row">${mode === "drivers" ? driverById(row.id).name : teamById(row.id).name}</th><td data-stat="championships">${row.championships}</td><td data-stat="wins">${row.wins}</td><td data-stat="podiums">${row.podiums}</td><td data-stat="starts">${row.starts}</td><td data-stat="points">${row.points}</td></tr>`).join("")}</tbody></table></div>${mode === "teams" ? '<p class="scoring-note">Team starts, wins, and podiums combine both drivers.</p>' : ""}`;
  }
}
