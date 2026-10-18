import { METERS_PER_MILE } from "./config.ts";
import { clamp, RaceSimulation } from "./simulation.ts";
import type { Car } from "./simulation.ts";
import { SETTINGS } from "./settings.ts";
import type { RaceSetting, SettingId } from "./settings.ts";

export class RaceRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 1000;
  private height = 440;
  private resizeObserver: ResizeObserver;

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("This browser could not open the 2D race display.");
    this.ctx = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  draw(sim: RaceSimulation) {
    const { ctx, width: w, height: h } = this;
    const scale = clamp(w / 76, 7, 15);
    const center = h * 0.51;
    const roadTop = center - sim.config.roadHalfWidth * scale;
    const roadBottom = center + sim.config.roadHalfWidth * scale;
    // Keep framing independent of the field so separating packs cannot change zoom.
    // Both axes share one scale, preserving car shape as the viewport resizes.
    const playerX = w * 0.28;
    const offset = sim.player.progress * scale;
    const theme = SETTINGS[sim.setting];
    const xFor = (progress: number) =>
      playerX + (progress - sim.player.progress) * scale;

    ctx.clearRect(0, 0, w, h);
    this.drawSetting(sim.setting, theme, w, h, roadTop, roadBottom, offset);
    ctx.fillStyle = theme.wall;
    ctx.fillRect(0, roadTop - 19, w, 12);
    ctx.fillRect(0, roadBottom + 7, w, 12);
    ctx.fillStyle = theme.wallEdge;
    ctx.fillRect(0, roadTop - 8, w, 3);
    ctx.fillRect(0, roadBottom + 5, w, 3);
    ctx.fillStyle = theme.road;
    ctx.fillRect(0, roadTop, w, roadBottom - roadTop);
    ctx.fillStyle = theme.grain;
    for (let i = 0; i < 180; i++) {
      const x = (((i * 43.7 - offset) % w) + w) % w;
      const y = roadTop + ((i * 13.23) % (roadBottom - roadTop));
      ctx.fillRect(x, y, 2, 1);
    }
    const segment = 3.5 * scale;
    for (let x = -segment - (offset % (segment * 2)); x < w; x += segment * 2) {
      ctx.fillStyle = theme.curbLight;
      ctx.fillRect(x, roadTop, segment, 5);
      ctx.fillRect(x, roadBottom - 5, segment, 5);
      ctx.fillStyle = theme.curb;
      ctx.fillRect(x + segment, roadTop, segment, 5);
      ctx.fillRect(x + segment, roadBottom - 5, segment, 5);
    }
    ctx.save();
    ctx.strokeStyle = theme.marking;
    ctx.lineWidth = 1;
    ctx.setLineDash([scale * 3, scale * 4]);
    ctx.lineDashOffset = offset;
    for (const lateral of [-3.2, 0, 3.2]) {
      ctx.beginPath();
      ctx.moveTo(0, center + lateral * scale);
      ctx.lineTo(w, center + lateral * scale);
      ctx.stroke();
    }
    ctx.restore();
    const finishX = xFor(sim.finishDistance);
    if (finishX > -20 && finishX < w + 30) {
      const tile = 9;
      for (let row = 0; row < (roadBottom - roadTop) / tile; row++) {
        for (let col = 0; col < 3; col++) {
          ctx.fillStyle = (row + col) % 2 ? "#ecf0e7" : "#1a2d33";
          ctx.fillRect(
            finishX + col * tile,
            roadTop + row * tile,
            tile,
            Math.min(tile, roadBottom - roadTop - row * tile),
          );
        }
      }
    }

    const playerTrain = new Set<number>([sim.player.id]);
    const queue = [sim.player];
    while (queue.length) {
      const car = queue.pop()!;
      for (const id of [car.frontId, car.rearId]) {
        if (id !== null && !playerTrain.has(id)) {
          playerTrain.add(id);
          queue.push(sim.cars[id]);
        }
      }
    }
    for (const car of sim.cars) {
      if (car.frontId === null) continue;
      const front = sim.cars[car.frontId];
      const x1 = xFor(car.progress) + (sim.config.carLength * scale) / 2;
      const x2 = xFor(front.progress) - (sim.config.carLength * scale) / 2;
      const y1 = center + car.lateral * scale;
      const y2 = center + front.lateral * scale;
      const active = playerTrain.has(car.id);
      ctx.fillStyle = active ? "#7ee4df20" : "#c7d4d409";
      ctx.beginPath();
      ctx.moveTo(x1, y1 - 13);
      ctx.lineTo(x2, y2 - 7);
      ctx.lineTo(x2, y2 + 7);
      ctx.lineTo(x1, y1 + 13);
      ctx.closePath();
      ctx.fill();
      ctx.save();
      ctx.strokeStyle = active ? "#8eece1" : "#c7ded554";
      ctx.lineWidth = active ? 2.5 : 1.5;
      ctx.setLineDash([4, 5]);
      ctx.lineDashOffset = sim.elapsed * 20;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }
    for (const car of [...sim.cars].sort(
      (a, b) => Number(a.player) - Number(b.player),
    )) {
      const x = xFor(car.progress);
      if (x < -90 || x > w + 90) continue;
      this.drawCar(
        car,
        x,
        center + car.lateral * scale,
        scale,
        sim.config.carLength,
        sim.config.carWidth,
        car.teamId === sim.player.teamId && !car.player,
      );
    }
    const sling = sim.slingshot();
    if (["racing", "paused"].includes(sim.phase) &&
      ["ready", "blocked", "carrying"].includes(sling.state)) {
      const y = center + sim.player.lateral * scale + sim.config.carWidth * scale / 2 + 17;
      ctx.save();
      ctx.fillStyle = "#20333b";
      ctx.beginPath();
      ctx.roundRect(playerX - 41, y - 8, 82, 27, 4);
      ctx.fill();
      ctx.fillStyle = "#f4c76a";
      ctx.font = '700 10px "Segoe UI", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(sling.state === "ready" ? "Pull out" : sling.state === "blocked" ? "No opening" : "Momentum", playerX, y + 3);
      ctx.fillStyle = "#52605d";
      ctx.fillRect(playerX - 31, y + 9, 62, 3);
      ctx.fillStyle = "#f4c76a";
      ctx.fillRect(playerX - 31, y + 9, 62 * sling.strength, 3);
      ctx.restore();
    }
    const offscreen = sim.cars.filter(
      (car) => !car.player && xFor(car.progress) > w - 20,
    );
    if (offscreen.length) {
      ctx.fillStyle = "#ecf2e9";
      ctx.font = '600 12px "Segoe UI", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText(`${offscreen.length} ahead  ›`, w - 16, roadTop + 24);
    }

    const behind = sim.cars.filter(
      (car) => !car.player && xFor(car.progress) < 20,
    );
    if (behind.length) {
      ctx.fillStyle = "#ecf2e9";
      ctx.font = '600 12px "Segoe UI", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText("‹  " + behind.length + " behind", 16, roadBottom - 17);
    }

    ctx.fillStyle = theme.text;
    ctx.font = '600 11px "Segoe UI", sans-serif';
    ctx.textAlign = "left";
    ctx.fillText("Race progress", 22, h - 34);
    ctx.textAlign = "right";
    ctx.fillText(`${sim.config.miles} mi`, w - 22, h - 34);
    ctx.fillStyle = "#e6ecde";
    ctx.fillRect(22, h - 23, w - 44, 3);
    const progress = clamp(
      sim.player.progress / (sim.config.miles * METERS_PER_MILE),
      0,
      1,
    );
    ctx.fillStyle = "#147d89";
    ctx.fillRect(22, h - 23, (w - 44) * progress, 3);
    ctx.beginPath();
    ctx.arc(22 + (w - 44) * progress, h - 21.5, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawSetting(
    setting: SettingId,
    theme: RaceSetting,
    w: number,
    h: number,
    top: number,
    bottom: number,
    offset: number,
  ) {
    const ctx = this.ctx;
    ctx.fillStyle = theme.ground;
    ctx.fillRect(0, 0, w, h);
    const wrap = (x: number, span = w + 160) =>
      ((((x - offset * 0.65) % span) + span) % span) - 80;
    if (setting === "coastal") {
      ctx.fillStyle = "#7fb7bf";
      ctx.fillRect(0, 0, w, Math.max(10, top - 48));
      ctx.fillStyle = "#e1d5ae";
      ctx.fillRect(0, Math.max(10, top - 48), w, 23);
      ctx.strokeStyle = "#c4e1dd";
      for (let i = 0; i < 14; i++) {
        const x = wrap(i * 119);
        ctx.beginPath();
        ctx.moveTo(x, 14 + (i % 3) * 17);
        ctx.quadraticCurveTo(
          x + 19,
          8 + (i % 3) * 17,
          x + 46,
          14 + (i % 3) * 17,
        );
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const x = wrap(i * 171),
          y = bottom + 36 + (i % 2) * 16;
        ctx.strokeStyle = "#8c8d65";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 6, y + 9);
        ctx.lineTo(x, y - 6);
        ctx.stroke();
        ctx.strokeStyle = "#4e826a";
        ctx.lineWidth = 4;
        for (const dx of [-15, 15]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y);
          ctx.quadraticCurveTo(x + dx / 2, y - 17, x, y - 6);
          ctx.stroke();
        }
      }
    } else if (setting === "desert") {
      ctx.strokeStyle = "#c4a26c";
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        const x = wrap(i * 211),
          y = i % 2 ? bottom + 40 : top - 40;
        ctx.beginPath();
        ctx.ellipse(x, y, 100, 17, -0.1, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#6d8561";
        ctx.fillRect(x + 50, y - 18, 5, 26);
        ctx.fillRect(x + 40, y - 9, 22, 4);
        ctx.fillRect(x + 40, y - 18, 4, 10);
        ctx.fillRect(x + 59, y - 22, 4, 16);
        ctx.fillStyle = "#a8906b";
        ctx.beginPath();
        ctx.ellipse(x - 30, y + 4, 10, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (setting === "forest") {
      for (let i = 0; i < 30; i++) {
        const x = wrap(i * 137.3);
        const y = i % 2 ? bottom + 32 + (i % 3) * 16 : top - 35 - (i % 3) * 17;
        ctx.fillStyle = "#354e3c22";
        ctx.beginPath();
        ctx.ellipse(x + 8, y + 7, 20, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ["#4d7553", "#3b6549", "#5f8456"][i % 3];
        ctx.beginPath();
        ctx.arc(x, y, 16 + (i % 3) * 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#769269";
        ctx.beginPath();
        ctx.arc(x - 5, y - 5, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Steady floodlights and a dark infield provide a night race without flashes.
      ctx.fillStyle = "#263d49";
      ctx.fillRect(0, 0, w, Math.max(0, top - 28));
      for (let i = 0; i < Math.ceil(w / 150) + 2; i++) {
        const x = wrap(i * 150);
        for (const y of [top - 27, bottom + 28]) {
          ctx.fillStyle = "#c8e3db0c";
          ctx.beginPath();
          ctx.ellipse(x, y, 83, 30, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#77929c";
          ctx.fillRect(x, y - 9, 3, 21);
          ctx.fillStyle = "#e5f0db";
          ctx.fillRect(x - 14, y - 11, 30, 5);
        }
      }
    }
    ctx.lineWidth = 1;
    ctx.fillStyle = theme.detail;
    for (let i = 0; i < 45; i++) {
      const y = (i * 83.7) % h;
      if (y > top - 25 && y < bottom + 25) continue;
      ctx.fillRect(wrap(i * 181.1), y, 13, 2);
    }
  }

  private drawCar(
    car: Car,
    x: number,
    y: number,
    scale: number,
    length: number,
    width: number,
    teammate: boolean,
  ) {
    const ctx = this.ctx;
    const l = length * scale;
    const b = width * scale;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#16262c3d";
    ctx.beginPath();
    ctx.roundRect(-l / 2 + 3, -b / 2 + 5, l, b, 6);
    ctx.fill();
    if (car.player) {
      ctx.strokeStyle = "#d2fff6";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-l / 2 - 5, -b / 2 - 5, l + 10, b + 10, 9);
      ctx.stroke();
    }
    ctx.fillStyle = "#18292d";
    for (const side of [-1, 1])
      for (const axle of [-0.28, 0.26])
        ctx.fillRect(l * axle - l * 0.07, side * b * 0.48 - 3, l * 0.14, 6);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-l / 2, -b / 2, l, b, [3, 8, 8, 3]);
    ctx.fill();
    if (car.seat === 1) {
      ctx.fillStyle = "#f0f3e5b8";
      ctx.fillRect(-l * 0.46, b * 0.24, l * 0.78, Math.max(2, b * 0.1));
    }
    ctx.fillStyle = "#ffffff3c";
    ctx.fillRect(-l * 0.42, -b * 0.42, l * 0.78, b * 0.09);
    ctx.fillStyle = "#213c46";
    ctx.beginPath();
    ctx.moveTo(l * 0.1, -b * 0.39);
    ctx.lineTo(l * 0.23, -b * 0.29);
    ctx.lineTo(l * 0.23, b * 0.29);
    ctx.lineTo(l * 0.1, b * 0.39);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-l * 0.25, -b * 0.32, l * 0.12, b * 0.64);
    ctx.fillStyle = "#e7f1e4";
    ctx.fillRect(l * 0.41, -b * 0.37, 3, b * 0.2);
    ctx.fillRect(l * 0.41, b * 0.17, 3, b * 0.2);
    ctx.fillStyle = "#1c3138";
    ctx.fillRect(-l * 0.46, -b * 0.5, l * 0.06, b);
    if (car.braking) {
      ctx.fillStyle = "#ff8167";
      ctx.fillRect(-l * 0.48, -b * 0.38, Math.max(2, l * 0.05), b * 0.23);
      ctx.fillRect(-l * 0.48, b * 0.15, Math.max(2, l * 0.05), b * 0.23);
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.max(10, b * 0.53)}px Bahnschrift, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(car.number, -l * 0.025, 0.5);
    if (teammate) {
      ctx.fillStyle = "#d8e8df";
      ctx.font = '700 9px "Segoe UI", sans-serif';
      ctx.fillText("TM", 0, b / 2 + 11);
    }
    if (car.player) {
      ctx.fillStyle = "#ecfff4";
      ctx.font = '700 11px "Segoe UI", sans-serif';
      ctx.fillText("You", 0, -b / 2 - 21);
      ctx.beginPath();
      ctx.moveTo(-4, -b / 2 - 14);
      ctx.lineTo(4, -b / 2 - 14);
      ctx.lineTo(0, -b / 2 - 9);
      ctx.fill();
    }
    ctx.restore();
  }

  destroy() {
    this.resizeObserver.disconnect();
  }
}
