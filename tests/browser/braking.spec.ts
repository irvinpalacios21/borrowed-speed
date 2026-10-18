import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createSeason, SEASON_STORAGE_KEY } from "../../src/game/season.ts";
import { DEFAULT_CONFIG, MPH_PER_MPS } from "../../src/game/config.ts";
import type { RaceSimulation } from "../../src/game/simulation.ts";

declare global {
  interface Window {
    __brakingProbe: { y: number | null };
    __restrictedBrakingSim: RaceSimulation;
    __restrictedBrakingOrder: number[];
  }
}
async function setup(page: Page) {
  await page.addInitScript(
    ({ key, season }) => {
      localStorage.setItem(key, season);
      window.__brakingProbe = { y: null };
      const original = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (
        this: CanvasRenderingContext2D,
        ...args: Parameters<CanvasRenderingContext2D["fillText"]>
      ) {
        if (args[0] === "You") window.__brakingProbe.y = this.getTransform().f;
        original.apply(this, args);
      };
    },
    {
      key: SEASON_STORAGE_KEY,
      season: JSON.stringify(createSeason(null, 173)),
    },
  );
  await page.goto("/");
  await expect(page.locator("#brake")).toBeDisabled();
  await page.clock.install();
  await page.getByRole("button", { name: "Start season", exact: true }).click();
  await page.clock.runFor(4200);
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "racing",
  );
}
const speed = async (page: Page) =>
  Number(await page.locator("#speed").textContent());

async function controlledSetup(page: Page, slot: number) {
  await page.goto("/");
  await page.evaluate(async () => {
    const path = performance.getEntriesByType("resource").map((entry) => entry.name)
      .find((url) => new URL(url).pathname === "/src/game/simulation.ts")!;
    const { RaceSimulation } = await import(path) as typeof import("../../src/game/simulation.ts");
    const original = RaceSimulation.prototype.start;
    RaceSimulation.prototype.start = function (...args) {
      window.__restrictedBrakingSim = this;
      return original.apply(this, args);
    };
  });
  await page.clock.install();
  await page.getByRole("button", { name: "Start season", exact: true }).click();
  await page.evaluate((slot) => {
    const sim = window.__restrictedBrakingSim;
    sim.phase = "racing";
    sim.countdown = sim.elapsed = 0;
    sim.cars.forEach((car, index) => {
      Object.assign(car, {
        progress: -200 - index * 35, previousProgress: -200 - index * 35,
        lateral: 4.8, targetLateral: 4.8, decisionAt: 1e9,
        speed: sim.config.baseSpeed, draftBonus: 0, slipstreamBonus: 0,
        slingshotBonus: 0, slingshotInitialBonus: 0, pushBonus: 0,
        latchedToId: null, finishTime: null, braking: false,
        aiBrakeUntil: 0, aiBrakeDecisionAt: 1e9,
      });
    });
    const others = sim.cars.filter((car) => !car.player).slice(0, 2);
    const order = [...others.slice(0, slot), sim.player, ...others.slice(slot)];
    order.forEach((car, index) => {
      car.progress = car.previousProgress = 500 - index * (sim.config.carLength + sim.config.contactGap);
      car.lateral = car.targetLateral = 0;
    });
    window.__restrictedBrakingOrder = order.map((car) => car.id);
    sim.updateDrafts();
  }, slot);
  await page.clock.runFor(150);
}

for (const [width, slot] of [[1440, 0], [320, 1]] as const) {
  test(`${width}px controls explain blocked ${slot === 0 ? "leader" : "middle-car"} braking and allow it after pulling clear`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 320 ? 844 : 1000 });
    await controlledSetup(page, slot);
    await expect(page.locator("#brake-availability")).toHaveText("Car close behind · braking unavailable");
    await expect(page.locator("#brake")).toHaveAttribute("aria-disabled", "true");
    let heldByTouch = false;
    if (width === 320) {
      const brake = page.getByRole("button", { name: "Brake", exact: true });
      await expect(brake).toContainText("Blocked");
      await brake.scrollIntoViewIfNeeded();
      const box = (await brake.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      heldByTouch = true;
    } else await page.keyboard.down("ArrowLeft");
    const before = await page.evaluate(() => window.__restrictedBrakingSim.player.speed);
    await page.clock.runFor(500);
    await expect(page.locator("#draft-state")).toHaveText("Braking unavailable");
    await expect(page.locator("#brake-status")).toHaveText("Brake blocked");
    expect(await page.evaluate(() => window.__restrictedBrakingSim.player.speed)).toBeGreaterThanOrEqual(before);
    await expect(page.locator("#brake")).toHaveAttribute("aria-pressed", "false");
    await page.screenshot({ path: `.local/screenshots/braking-blocked-${width}.png`, fullPage: true });
    await page.keyboard.down("ArrowDown");
    await page.clock.runFor(850);
    await page.keyboard.up("ArrowDown");
    await expect(page.locator("#brake-availability")).toBeHidden();
    await expect(page.locator("#brake")).toHaveAttribute("aria-disabled", "false");
    await expect(page.locator("#brake")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#draft-state")).toHaveText("Braking");
    if (heldByTouch) await page.mouse.up();
    else await page.keyboard.up("ArrowLeft");
    await page.clock.runFor(150);
    await expect(page.locator("#brake-status")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("a distant linked follower permits braking, but a new close follower cancels a held brake", async ({ page }) => {
  await controlledSetup(page, 0);
  await page.evaluate(() => {
    const sim = window.__restrictedBrakingSim;
    const order = window.__restrictedBrakingOrder;
    sim.cars[order[1]].progress = sim.player.progress - sim.config.carLength - 25;
    sim.cars[order[2]].progress = sim.player.progress - 100;
    sim.updateDrafts();
  });
  await page.clock.runFor(150);
  await expect(page.locator("#brake-availability")).toBeHidden();
  expect(await page.evaluate(() => window.__restrictedBrakingSim.player.rearId)).not.toBeNull();
  await page.keyboard.down("ArrowLeft");
  await page.clock.runFor(500);
  await expect(page.locator("#draft-state")).toHaveText("Braking");
  await page.evaluate(() => {
    const sim = window.__restrictedBrakingSim;
    sim.cars[window.__restrictedBrakingOrder[1]].progress = sim.player.progress - sim.config.carLength - 4;
    sim.updateDrafts();
  });
  await page.clock.runFor(150);
  await expect(page.locator("#draft-state")).toHaveText("Braking unavailable");
  await expect(page.locator("#brake")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.press("Space");
  await expect(page.locator("#brake-status")).toBeHidden();
});

test("Left Arrow brakes without steering, release accelerates, and pause, blur, and restart clear braking", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setup(page);
  const initialSpeed = await speed(page);
  const initialY = await page.evaluate(() => window.__brakingProbe.y);
  expect(initialY).not.toBeNull();
  await page.keyboard.down("ArrowLeft");
  await page.clock.runFor(2000);
  const slowed = await speed(page);
  expect(slowed).toBeLessThan(initialSpeed - 8);
  expect(await page.evaluate(() => window.__brakingProbe.y)).toBe(initialY);
  await expect(page.locator("#draft-state")).toHaveText("Braking");
  await expect(page.locator("#brake-status")).toBeVisible();
  await expect(page.locator("#brake")).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: ".local/screenshots/braking-desktop.png",
    fullPage: true,
  });
  await page.keyboard.up("ArrowLeft");
  await page.clock.runFor(1500);
  expect(await speed(page)).toBeGreaterThan(slowed + 5);
  await expect(page.locator("#brake-status")).toBeHidden();

  await page.keyboard.down("ArrowLeft");
  await page.clock.runFor(300);
  await page.keyboard.press("Space");
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "paused",
  );
  await expect(page.locator("#brake")).toHaveAttribute("aria-pressed", "false");
  const pausedTime = await page.locator("#race-time").textContent();
  await page.clock.runFor(1000);
  await expect(page.locator("#race-time")).toHaveText(pausedTime!);
  await page.keyboard.up("ArrowLeft");
  await page.getByRole("button", { name: "Resume race", exact: true }).click();
  await page.clock.runFor(300);
  await expect(page.locator("#brake-status")).toBeHidden();

  await page.keyboard.down("ArrowLeft");
  await page.clock.runFor(300);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "paused",
  );
  await expect(page.locator("#brake")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("ArrowLeft");
  await page.getByRole("button", { name: "Resume race", exact: true }).click();
  await page.clock.runFor(300);
  await expect(page.locator("#brake-status")).toBeHidden();

  await page.keyboard.down("ArrowLeft");
  await page.clock.runFor(300);
  await page.keyboard.press("KeyR");
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
  await expect(page.locator("#brake")).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("ArrowLeft");
  await page.clock.runFor(3500);
  await expect(page.locator("#brake-status")).toBeHidden();
  expect(errors).toEqual([]);
});

test("the touch brake slows while held, supports steering, and releases after pointer cancellation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const brake = page.getByRole("button", { name: "Brake", exact: true });
  await expect(brake).toBeVisible();
  await expect(brake).toBeEnabled();
  const before = await speed(page);
  await brake.scrollIntoViewIfNeeded();
  const box = (await brake.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(1700);
  await page.keyboard.down("ArrowUp");
  await page.clock.runFor(300);
  await page.keyboard.up("ArrowUp");
  const slowed = await speed(page);
  expect(slowed).toBeLessThan(before - 8);
  await expect(brake).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(5, 5);
  await page.clock.runFor(200);
  await expect(brake).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: ".local/screenshots/braking-phone.png",
    fullPage: true,
  });
  await brake.dispatchEvent("pointercancel", {
    pointerId: 1,
    pointerType: "mouse",
  });
  await page.clock.runFor(300);
  await expect(brake).toHaveAttribute("aria-pressed", "false");
  await page.mouse.up();
  await page.clock.runFor(1500);
  const recovered = await speed(page);
  expect(recovered).toBeGreaterThan(slowed);
  // Leaving the tow can cap recovery at solo pace; releasing the brake must
  // not manufacture another drafting bonus just to exceed that speed.
  expect(recovered).toBeGreaterThanOrEqual(
    Math.min(Math.round(DEFAULT_CONFIG.baseSpeed * MPH_PER_MPS), slowed + 3),
  );
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const label of ["Steer up", "Brake", "Steer down"]) {
      const control = page.getByRole("button", { name: label, exact: true });
      await expect(control).toBeVisible();
      expect((await control.boundingBox())!.width).toBeGreaterThan(70);
    }
  }
});
