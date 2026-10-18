import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { DEFAULT_CONFIG } from "../../src/game/config.ts";
import type { RaceSimulation as Simulation } from "../../src/game/simulation.ts";
import type { RaceRenderer } from "../../src/game/renderer.ts";

interface CarDrawing {
  number: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
interface CameraFrame {
  player: CarDrawing;
  cars: CarDrawing[];
  labels: string[];
  carCount: number;
  physicsUnchanged: boolean;
  canvasWidth: number;
}
interface CameraHarness {
  sim: Simulation;
  renderer: RaceRenderer;
  setup: (rearGap: number, frontGap?: number) => void;
  capture: (sim?: Simulation) => CameraFrame;
}
declare global {
  interface Window {
    cameraHarness: CameraHarness;
  }
}

async function createHarness(page: Page, width: number, height: number) {
  await page.setViewportSize({ width: width + 40, height: height + 70 });
  await page.route("**/camera-test", (route) =>
    route.fulfill({
      contentType: "text/html",
      body:
        '<!doctype html><meta charset="utf-8"><style>body{margin:20px;background:#edf1ee}canvas{display:block;width:' +
        width +
        "px;height:" +
        height +
        'px}</style><canvas id="track"></canvas>',
    }),
  );
  await page.goto("/camera-test");
  await page.evaluate(async () => {
    const simulationPath = "/src/game/simulation.ts";
    const rendererPath = "/src/game/renderer.ts";
    const { RaceSimulation } = (await import(
      simulationPath
    )) as typeof import("../../src/game/simulation.ts");
    const { RaceRenderer } = (await import(
      rendererPath
    )) as typeof import("../../src/game/renderer.ts");
    const sim = new RaceSimulation();
    const canvas = document.querySelector<HTMLCanvasElement>("#track")!;
    const renderer = new RaceRenderer(canvas);
    const ctx = canvas.getContext("2d")!;
    let drawings: CarDrawing[] = [],
      labels: string[] = [];
    let x = 0,
      y = 0,
      bodyWidth = 0,
      bodyHeight = 0;
    const translate = ctx.translate.bind(ctx);
    ctx.translate = (nextX, nextY) => {
      x = nextX;
      y = nextY;
      translate(nextX, nextY);
    };
    const roundRect = ctx.roundRect.bind(ctx);
    ctx.roundRect = (
      ...args: Parameters<CanvasRenderingContext2D["roundRect"]>
    ) => {
      if (Array.isArray(args[4])) {
        bodyWidth = args[2];
        bodyHeight = args[3];
      }
      roundRect(...args);
    };
    const fillText = ctx.fillText.bind(ctx);
    ctx.fillText = (
      ...args: Parameters<CanvasRenderingContext2D["fillText"]>
    ) => {
      labels.push(args[0]);
      if (/^\d{2}$/.test(args[0]))
        drawings.push({
          number: args[0],
          x,
          y,
          width: bodyWidth,
          height: bodyHeight,
        });
      fillText(...args);
    };
    const capture = (race = sim): CameraFrame => {
      drawings = [];
      labels = [];
      const before = JSON.stringify(race.cars);
      renderer.draw(race);
      return {
        player: drawings.find((car) => car.number === race.player.number)!,
        cars: drawings,
        labels: labels.filter((label) => /ahead|behind/.test(label)),
        carCount: race.cars.length,
        physicsUnchanged: before === JSON.stringify(race.cars),
        canvasWidth: canvas.clientWidth,
      };
    };
    const setup = (rearGap: number, frontGap = 40) => {
      sim.cars.forEach((car, i) => {
        car.progress = car.previousProgress = 500 - i * 50;
        car.lateral = car.targetLateral = -4.8;
        car.decisionAt = Infinity;
      });
      sim.player.progress = sim.player.previousProgress = 2000;
      sim.player.lateral = sim.player.targetLateral = -1.6;
      sim.cars[0].progress = sim.cars[0].previousProgress = 2000 + frontGap;
      sim.cars[0].lateral = sim.cars[0].targetLateral = -1.6;
      sim.cars[1].progress = sim.cars[1].previousProgress = 2000 - rearGap;
      sim.cars[1].lateral = sim.cars[1].targetLateral = 1.6;
      sim.updateDrafts();
    };
    window.cameraHarness = { sim, renderer, setup, capture };
  });
}

for (const [label, width, height] of [
  ["desktop", 1066, 485],
  ["phone", 368, 340],
] as const) {
  test(
    label +
      " camera keeps car shape and player position stable as cars separate or go offscreen",
    async ({ page }, testInfo) => {
      await createHarness(page, width, height);
      const frames = await page.evaluate(() => {
        const d = window.cameraHarness;
        return [16, 35, 50, 61.99, 62.01, 80, 140].map((gap) => {
          d.setup(gap);
          return { gap, ...d.capture() };
        });
      });
      await testInfo.attach("controlled-camera-frames", {
        body: JSON.stringify(frames, null, 2),
        contentType: "application/json",
      });
      const baseline = frames[0].player;
      for (const frame of frames) {
        expect(frame.player.x).toBeCloseTo(baseline.x, 8);
        expect(frame.player.width).toBeCloseTo(baseline.width, 8);
        expect(frame.player.height).toBeCloseTo(baseline.height, 8);
        expect(frame.player.width / frame.player.height).toBeCloseTo(
          DEFAULT_CONFIG.carLength / DEFAULT_CONFIG.carWidth,
          8,
        );
        expect(frame.carCount).toBe(16);
        expect(frame.physicsUnchanged).toBe(true);
      }

      const offscreen = await page.evaluate(() => {
        const d = window.cameraHarness;
        d.setup(140, 140);
        const before = d.sim.cars.map((car) => car.progress);
        d.sim.start(true);
        for (let tick = 0; tick < 1200; tick++) d.sim.step(1 / 120);
        return {
          ...d.capture(),
          movements: d.sim.cars.map((car, i) => car.progress - before[i]),
          rearGap: d.sim.player.progress - d.sim.cars[1].progress,
        };
      });
      expect(offscreen.labels.some((text) => text.includes("ahead"))).toBe(
        true,
      );
      expect(offscreen.labels.some((text) => text.includes("behind"))).toBe(
        true,
      );
      expect(offscreen.cars).toHaveLength(1);
      expect(offscreen.carCount).toBe(16);
      expect(offscreen.rearGap).toBeCloseTo(140, 6);
      expect(offscreen.movements.every((distance) => distance > 780)).toBe(
        true,
      );
      await page.screenshot({
        path: ".local/screenshots/camera-" + label + "-offscreen.png",
      });

      const resizedWidth = width === 1066 ? 700 : 320;
      await page.setViewportSize({
        width: resizedWidth + 40,
        height: height + 70,
      });
      await page.locator("#track").evaluate((canvas, nextWidth) => {
        canvas.style.width = nextWidth + "px";
      }, resizedWidth);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const resized = await page.evaluate(() => window.cameraHarness.capture());
      expect(resized.canvasWidth).toBe(resizedWidth);
      expect(resized.player.x).toBeCloseTo(resizedWidth * 0.28, 8);
      expect(resized.player.width / resized.player.height).toBeCloseTo(
        DEFAULT_CONFIG.carLength / DEFAULT_CONFIG.carWidth,
        8,
      );
    },
  );

  test(
    label +
      " camera stays steady through the ninety-second race replays that exposed the jumps",
    async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await createHarness(page, width, height);
      const summaries = await page.evaluate(async () => {
        const simulationPath = "/src/game/simulation.ts";
        const seasonPath = "/src/game/season.ts";
        const { RaceSimulation } = (await import(
          simulationPath
        )) as typeof import("../../src/game/simulation.ts");
        const { createSeason, startingGrid } = (await import(
          seasonPath
        )) as typeof import("../../src/game/season.ts");
        const d = window.cameraHarness;
        const season = createSeason("alex-rivera", 173);
        const summaries = [];
        for (const scenario of ["no-steering", "separating-from-train"]) {
          const sim = new RaceSimulation({ miles: 6 }, 173 ^ season.gridSeed, {
            playerDriverId: season.playerDriverId!,
            grid: startingGrid(season),
          });
          sim.start(true);
          let previousX: number | null = null,
            maxJump = 0,
            minWidth = Infinity,
            maxWidth = 0,
            minHeight = Infinity,
            maxHeight = 0;
          let maxSpread = 0,
            minDrawnCars = 16,
            physicsUnchanged = true,
            crossingEvents = 0;
          let previousNearby = "";
          for (let frame = 0; frame <= 2700; frame++) {
            const time = frame / 30;
            if (frame)
              for (let tick = 0; tick < 4; tick++) {
                const steer =
                  scenario === "separating-from-train"
                    ? time >= 3 && time < 4.5
                      ? -1
                      : time >= 18 && time < 19
                        ? 1
                        : time >= 45 && time < 46.5
                          ? 1
                          : 0
                    : 0;
                sim.step(1 / 120, steer);
              }
            const row = d.capture(sim);
            minWidth = Math.min(minWidth, row.player.width);
            maxWidth = Math.max(maxWidth, row.player.width);
            minHeight = Math.min(minHeight, row.player.height);
            maxHeight = Math.max(maxHeight, row.player.height);
            if (previousX !== null)
              maxJump = Math.max(maxJump, Math.abs(row.player.x - previousX));
            previousX = row.player.x;
            maxSpread = Math.max(
              maxSpread,
              Math.max(...sim.cars.map((car) => car.progress)) -
                Math.min(...sim.cars.map((car) => car.progress)),
            );
            minDrawnCars = Math.min(minDrawnCars, row.cars.length);
            physicsUnchanged &&= row.physicsUnchanged;
            const nearby = sim.cars
              .filter(
                (car) => Math.abs(car.progress - sim.player.progress) < 62,
              )
              .map((car) => car.id)
              .join(",");
            if (frame && nearby !== previousNearby) crossingEvents++;
            previousNearby = nearby;
          }
          summaries.push({
            scenario,
            maxJump,
            minWidth,
            maxWidth,
            minHeight,
            maxHeight,
            maxSpread,
            minDrawnCars,
            physicsUnchanged,
            crossingEvents,
            carCount: sim.cars.length,
          });
        }
        return summaries;
      });
      await testInfo.attach("ninety-second-replays", {
        body: JSON.stringify(summaries, null, 2),
        contentType: "application/json",
      });
      for (const summary of summaries) {
        expect(summary.maxJump).toBeLessThan(0.001);
        expect(summary.maxWidth - summary.minWidth).toBeLessThan(0.001);
        expect(summary.maxHeight - summary.minHeight).toBeLessThan(0.001);
        expect(summary.maxSpread).toBeGreaterThan(100);
        expect(summary.minDrawnCars).toBeLessThan(16);
        expect(summary.crossingEvents).toBeGreaterThan(0);
        expect(summary.physicsUnchanged).toBe(true);
        expect(summary.carCount).toBe(16);
      }
      expect(errors).toEqual([]);
      await page.screenshot({
        path: ".local/screenshots/camera-" + label + "-replay.png",
      });
    },
  );
}
