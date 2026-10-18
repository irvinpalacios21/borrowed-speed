import { championshipHistory } from "./game/history.ts";
import type { HistoryMode, HistorySeries } from "./game/history.ts";
import { SEASON_SCHEDULE } from "./game/season.ts";
import type { SeasonState } from "./game/season.ts";
import { driverById } from "./game/teams.ts";

type Metric = "points" | "position";

export class PointsHistory {
  private mode: HistoryMode = "teams";
  private metric: Metric = "points";
  private series: HistorySeries[] = [];
  private round = 0;
  private focused: string | null = null;
  private season!: SeasonState;
  private chart: HTMLDivElement;
  private raceSelect: HTMLSelectElement;
  private plot = { left: 44, width: 700, first: 0, last: 0 };

  constructor(private root: HTMLElement) {
    root.innerHTML = `
      <div class="history-heading"><div><h3>Points history</h3><p>Follow the championship after each completed race.</p></div></div>
      <div class="history-controls">
        <div class="history-switch" role="group" aria-label="History competitors"><button type="button" data-mode="teams" aria-pressed="true">Teams</button><button type="button" data-mode="drivers" aria-pressed="false">Drivers</button></div>
        <div class="history-switch" role="group" aria-label="Chart measure"><button type="button" data-metric="points" aria-pressed="true">Total points</button><button type="button" data-metric="position" aria-pressed="false">Position</button></div>
      </div>
      <div class="history-empty" hidden><h4>No race results yet</h4><p>Finish the opening race to start your points history. Each completed race adds driver and team totals here.</p></div>
      <div class="history-results">
        <p class="history-help" id="history-help">Hover or tap a race to inspect it. Select a name below to follow its line.</p>
        <div class="history-chart"></div>
        <div class="history-inspector"><label for="history-race">After race <select id="history-race"></select></label><button type="button" class="history-reset" disabled>Show all lines</button></div>
        <p class="history-note">Both teammates contribute to team totals. Dashed driver lines mark the second teammate. Position changes use championship tie-breaks.</p>
        <table class="championship-table history-table"><caption></caption><thead><tr><th scope="col">Pos / change</th><th scope="col" class="history-name-heading">Team</th><th scope="col">Race pts</th><th scope="col">Total pts</th></tr></thead><tbody></tbody></table>
      </div>`;
    this.chart = root.querySelector<HTMLDivElement>(".history-chart")!;
    this.raceSelect = root.querySelector<HTMLSelectElement>("#history-race")!;
    root.addEventListener("click", (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>("button");
      if (!button) return;
      if (button.dataset.mode) {
        this.mode = button.dataset.mode as HistoryMode;
        this.focused = null;
        this.series = championshipHistory(this.season, this.mode);
        this.render();
      } else if (button.dataset.metric) {
        this.metric = button.dataset.metric as Metric;
        this.round = Math.max(this.metric === "position" ? 1 : 0, this.round);
        this.render();
      } else if (button.dataset.series) {
        this.focused = this.focused === button.dataset.series ? null : button.dataset.series;
        this.updateFocus();
      } else if (button.classList.contains("history-reset")) {
        this.focused = null;
        this.updateFocus();
      }
    });
    this.raceSelect.addEventListener("change", () => this.selectRound(Number(this.raceSelect.value)));
    for (const event of ["pointermove", "pointerup"])
      this.chart.addEventListener(event, (event) => {
        const pointer = event as PointerEvent;
        // Touch scrolling should not scrub the chart until the finger is released.
        if (pointer.pointerType === "touch" && event.type === "pointermove") return;
        const bounds = this.chart.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (pointer.clientX - bounds.left - this.plot.left) / this.plot.width));
        this.selectRound(Math.round(this.plot.first + fraction * (this.plot.last - this.plot.first)));
      });
    new ResizeObserver(() => {
      if (this.series.length && this.chart.clientWidth) this.drawChart();
    }).observe(this.chart);
  }

  update(season: SeasonState) {
    this.season = season;
    this.round = season.results.length;
    this.focused = null;
    this.series = championshipHistory(season, this.mode);
    this.render();
  }

  private render() {
    const count = this.season.results.length;
    this.root.querySelector<HTMLElement>(".history-empty")!.hidden = count > 0;
    this.root.querySelector<HTMLElement>(".history-results")!.hidden = count === 0;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-mode], [data-metric]"))
      button.setAttribute("aria-pressed", String(button.dataset.mode ? button.dataset.mode === this.mode : button.dataset.metric === this.metric));
    if (!count) return;
    const first = this.metric === "position" ? 1 : 0;
    this.raceSelect.innerHTML = Array.from({ length: count + 1 - first }, (_, i) => {
      const round = i + first;
      return `<option value="${round}">${round ? `${round}. ${SEASON_SCHEDULE[round - 1].name}` : "Start of season"}</option>`;
    }).join("");
    this.raceSelect.value = String(this.round);
    this.root.querySelector(".history-name-heading")!.textContent = this.mode === "teams" ? "Team" : "Driver";
    this.drawChart();
    this.drawTable();
  }

  private selectRound(round: number) {
    if (round === this.round || !this.season.results.length) return;
    this.round = round;
    this.raceSelect.value = String(round);
    this.drawChart();
    this.drawTable();
  }

  private drawChart() {
    const count = this.season.results.length;
    if (!count) return;
    const width = this.chart.clientWidth || 780;
    const height = 310, left = 44, right = width - 18, top = 32, bottom = 268;
    const first = this.metric === "position" ? 1 : 0;
    this.plot = { left, width: right - left, first, last: count };
    const x = (round: number) => count === first ? (left + right) / 2 : left + (round - first) / (count - first) * (right - left);
    const maxPoints = Math.max(...this.series.map((entry) => entry.values[count].points));
    const roughStep = maxPoints / 5;
    const magnitude = 10 ** Math.floor(Math.log10(roughStep));
    const step = [1, 2, 5, 10].map((n) => n * magnitude).find((n) => n >= roughStep)!;
    const ceiling = Math.ceil(maxPoints / step) * step;
    const y = (value: number) => this.metric === "points"
      ? bottom - value / ceiling * (bottom - top)
      : top + (value - 1) / (this.series.length - 1) * (bottom - top);
    const ticks = this.metric === "points"
      ? Array.from({ length: Math.round(ceiling / step) + 1 }, (_, i) => i * step)
      : this.mode === "teams" ? [1, 2, 4, 6, 8] : [1, 4, 8, 12, 16];
    this.chart.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="history-chart-title" aria-describedby="history-chart-desc">
      <title id="history-chart-title">${this.mode === "teams" ? "Team" : "Driver"} championship ${this.metric === "points" ? "cumulative points" : "positions"} by race</title>
      <desc id="history-chart-desc">${this.metric === "points" ? "Crossing lines show changes in points order. Equal points can be separated by tie-breaks." : "First place is at the top. Crossing lines show changes in championship position."} Exact totals and position changes for the selected race are in the table below.</desc>
      <text x="${left}" y="15" class="history-axis-title">${this.metric === "points" ? "Total points" : "Championship position"}</text>
      ${ticks.map((tick) => `<line x1="${left}" x2="${right}" y1="${y(tick)}" y2="${y(tick)}" class="history-grid"/><text x="${left - 9}" y="${y(tick) + 4}" text-anchor="end" class="history-axis">${tick}</text>`).join("")}
      ${Array.from({ length: count + 1 - first }, (_, i) => i + first).map((round) => `<text x="${x(round)}" y="${bottom + 22}" text-anchor="middle" class="history-axis">${round || "Start"}</text>`).join("")}
      <text x="${right}" y="${height - 2}" text-anchor="end" class="history-axis">Race</text>
      ${this.series.map((entry) => `<path data-trace="${entry.id}" class="history-line" stroke="${entry.color}" ${entry.dashed ? 'stroke-dasharray="7 5"' : ""} d="${entry.values.slice(first).map((point, i) => `${i ? "L" : "M"}${x(point.round).toFixed(2)},${y(this.metric === "points" ? point.points : point.position!).toFixed(2)}`).join(" ")}"/>`).join("")}
      <line x1="${x(this.round)}" x2="${x(this.round)}" y1="${top}" y2="${bottom}" class="history-cursor"/>
      ${this.series.map((entry) => {
        const point = entry.values[this.round];
        return `<circle data-trace="${entry.id}" class="history-dot" cx="${x(this.round)}" cy="${y(this.metric === "points" ? point.points : point.position!)}" r="4" fill="${entry.color}"/>`;
      }).join("")}
    </svg>`;
    this.updateFocus();
  }

  private drawTable() {
    const round = this.round;
    this.root.querySelector("caption")!.textContent = round
      ? `After race ${round}: ${SEASON_SCHEDULE[round - 1].name}`
      : "Start of season: everyone has zero points";
    this.root.querySelector("tbody")!.innerHTML = [...this.series]
      .sort((a, b) => (a.values[round].position ?? 0) - (b.values[round].position ?? 0))
      .map((entry) => {
        const point = entry.values[round];
        const change = point.change;
        const movement = change === null ? "No previous ranking" : change > 0 ? `Up ${change} places` : change < 0 ? `Down ${-change} places` : "No position change";
        const you = this.mode === "drivers" ? entry.id === this.season.playerDriverId : entry.teamId === (this.season.playerDriverId ? driverById(this.season.playerDriverId).teamId : null);
        return `<tr data-history-id="${entry.id}" class="${you ? "your-team" : ""}"><td><span>${point.position ?? "–"}</span><small class="history-change ${change && change > 0 ? "is-up" : change && change < 0 ? "is-down" : ""}" aria-label="${movement}" title="${movement}">${change === null ? "–" : change > 0 ? `↑${change}` : change < 0 ? `↓${-change}` : "="}</small></td><th scope="row"><button type="button" class="history-name" data-series="${entry.id}" aria-pressed="false"><svg width="23" height="10" viewBox="0 0 23 10" aria-hidden="true"><line x1="1" x2="22" y1="5" y2="5" stroke="${entry.color}" stroke-width="3" ${entry.dashed ? 'stroke-dasharray="5 3"' : ""}/></svg><span>${entry.number ? `<small>#${entry.number}</small> ` : ""}${entry.name}${you ? '<span class="you-label">You</span>' : ""}</span></button></th><td>+${point.earned}</td><td class="history-total">${point.points}</td></tr>`;
      }).join("");
    this.updateFocus();
  }

  private updateFocus() {
    for (const line of this.chart.querySelectorAll<SVGElement>("[data-trace]")) {
      line.classList.toggle("is-muted", this.focused !== null && line.dataset.trace !== this.focused);
      line.classList.toggle("is-focused", line.dataset.trace === this.focused);
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-series]"))
      button.setAttribute("aria-pressed", String(button.dataset.series === this.focused));
    this.root.querySelector<HTMLButtonElement>(".history-reset")!.disabled = this.focused === null;
  }
}
