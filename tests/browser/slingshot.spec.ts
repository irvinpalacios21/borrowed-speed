import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { RaceSimulation } from "../../src/game/simulation.ts";

declare global {
  interface Window {
    __slingshotSim: RaceSimulation;
    __slingshotTarget: number;
  }
}

async function setup(page: Page) {
  await page.goto("/");
  await page.evaluate(async () => {
    const path = performance.getEntriesByType("resource").map((entry) => entry.name)
      .find((url) => new URL(url).pathname === "/src/game/simulation.ts")!;
    const { RaceSimulation } = await import(path) as typeof import("../../src/game/simulation.ts");
    const original = RaceSimulation.prototype.start;
    RaceSimulation.prototype.start = function (...args) {
      window.__slingshotSim = this;
      return original.apply(this, args);
    };
  });
  await page.clock.install();
  await page.getByRole("button", { name: "Start season", exact: true }).click();
}

async function arrange(page: Page, mode: "approach" | "latched" | "leader") {
  await page.evaluate((mode) => {
    const sim = window.__slingshotSim;
    sim.phase = "racing";
    sim.elapsed = 0;
    sim.countdown = 0;
    sim.cars.forEach((car, index) => {
      Object.assign(car, {
        progress: -200 - index * 50,
        previousProgress: -200 - index * 50,
        lateral: 4.8, targetLateral: 4.8, decisionAt: 1e9,
        speed: sim.config.baseSpeed, draftBonus: 0, slipstreamBonus: 0,
        slingshotBonus: 0, slingshotInitialBonus: 0, pushBonus: 0,
        latchedToId: null, finishTime: null,
      });
    });
    sim.player.progress = sim.player.previousProgress = 0;
    sim.player.lateral = sim.player.targetLateral = 0;
    const target = sim.cars.find((car) => !car.player)!;
    window.__slingshotTarget = target.id;
    target.lateral = target.targetLateral = 0;
    target.progress = mode === "leader" ? -23 : sim.config.carLength + (mode === "latched" ? 0.45 : 28);
    target.previousProgress = target.progress;
    sim.updateDrafts();
  }, mode);
}

test("the approach cue leads into a real keyboard slingshot and fading on-track momentum", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setup(page);
  await arrange(page, "approach");
  await page.clock.runFor(2200);
  await expect(page.locator("#slingshot-indicator")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#slingshot-label")).toHaveText("Pull out now");
  await expect(page.locator("#draft-state")).toHaveText("Slingshot ready");
  expect(Number(await page.getByRole("meter", { name: "Slingshot momentum" }).getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  await page.screenshot({ path: ".local/screenshots/slingshot-ready-desktop.png", fullPage: true });
  await page.keyboard.down("ArrowDown");
  await page.clock.runFor(1000);
  await page.keyboard.up("ArrowDown");
  await expect(page.locator("#slingshot-indicator")).toHaveAttribute("data-state", "carrying");
  const before = Number(await page.locator("#slingshot-meter").getAttribute("aria-valuenow"));
  await page.screenshot({ path: ".local/screenshots/slingshot-carrying-desktop.png", fullPage: true });
  await page.clock.runFor(5000);
  const passed = await page.evaluate(() => {
    const sim = window.__slingshotSim;
    return sim.player.progress > sim.cars[window.__slingshotTarget].progress + sim.config.carLength;
  });
  expect(passed).toBe(true);
  expect(Number(await page.locator("#slingshot-meter").getAttribute("aria-valuenow"))).toBeLessThan(before);
  await page.keyboard.press("Space");
  const frozen = await page.locator("#slingshot-meter").getAttribute("aria-valuenow");
  await page.clock.runFor(2000);
  await expect(page.locator("#slingshot-meter")).toHaveAttribute("aria-valuenow", frozen!);
  expect(errors).toEqual([]);
});

test("latched following has no slingshot, and a leader's speed gain is identified as a push", async ({ page }) => {
  await setup(page);
  await arrange(page, "latched");
  await page.clock.runFor(3000);
  await expect(page.locator("#slingshot-label")).toHaveText("Latched · run spent");
  await expect(page.locator("#slingshot-meter")).toHaveAttribute("aria-valuenow", "0");
  await expect(page.locator("#draft-hint")).toContainText("Drop back");
  await page.keyboard.down("ArrowDown");
  await page.clock.runFor(1000);
  await page.keyboard.up("ArrowDown");
  await expect(page.locator("#slingshot-indicator")).toHaveAttribute("data-state", "idle");
  expect(await page.evaluate(() => window.__slingshotSim.player.slingshotBonus)).toBe(0);
  await arrange(page, "leader");
  await page.clock.runFor(1200);
  await expect(page.locator("#draft-state")).toHaveText("Leading in open air");
  expect(await page.evaluate(() => window.__slingshotSim.player.speed)).toBe(79);
  await page.evaluate(() => {
    const sim = window.__slingshotSim;
    sim.cars[window.__slingshotTarget].progress = sim.player.progress - sim.config.carLength - sim.config.contactGap;
    sim.updateDrafts();
  });
  await page.clock.runFor(3000);
  await expect(page.locator("#draft-state")).toHaveText("Pushed by the train");
  await expect(page.locator("#draft-gain")).toContainText("Push +");
  expect(await page.evaluate(() => window.__slingshotSim.player.draftBonus)).toBe(0);
});

test("the cue and touch maneuver fit phone screens, including the final-mile flag", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await arrange(page, "approach");
  await page.clock.runFor(2200);
  await expect(page.locator("#slingshot-label")).toHaveText("Pull out now");
  const down = page.getByRole("button", { name: "Steer down", exact: true });
  await down.scrollIntoViewIfNeeded();
  const box = (await down.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(1000);
  await page.mouse.up();
  await expect(page.locator("#slingshot-indicator")).toHaveAttribute("data-state", "carrying");
  await page.evaluate(() => {
    const sim = window.__slingshotSim;
    const shift = sim.finishDistance - 1000 - sim.player.progress;
    sim.cars.forEach((car) => { car.progress += shift; car.previousProgress += shift; });
  });
  await page.clock.runFor(120);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.clock.runFor(120);
    await expect(page.locator("#final-mile")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cue = (await page.locator("#slingshot-indicator").boundingBox())!;
    const flag = (await page.locator("#final-mile").boundingBox())!;
    expect(cue.x + cue.width).toBeLessThan(flag.x);
    await page.screenshot({ path: `.local/screenshots/slingshot-phone-${width}.png`, fullPage: true });
  }
});
