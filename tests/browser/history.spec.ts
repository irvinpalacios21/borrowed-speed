import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createSeason, recordRace, SEASON_SCHEDULE, SEASON_STORAGE_KEY } from "../../src/game/season.ts";
import { DRIVERS } from "../../src/game/teams.ts";

async function openHistory(page: Page, rounds: number) {
  let season = createSeason(rounds ? "maya-chen" : null, 173);
  for (let round = 0; round < rounds; round++) {
    const order = round ? [...DRIVERS].reverse() : DRIVERS;
    season = recordRace(season, {
      raceId: SEASON_SCHEDULE[round].id,
      finishes: order.map((driver, index) => ({ driverId: driver.id, time: 100 + index })),
    });
  }
  await page.addInitScript(({ key, season }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(season));
  }, { key: SEASON_STORAGE_KEY, season });
  await page.goto("/");
  await page.getByRole("button", { name: "Season standings", exact: true }).click();
  await page.locator("#overview-history-tab").click();
  return page.locator("#overview-history");
}

test("a fresh season explains when points history becomes available", async ({ page }) => {
  const history = await openHistory(page, 0);
  await expect(history.getByText("No race results yet", { exact: true })).toBeVisible();
  await expect(history.locator(".history-chart")).toBeHidden();
  await history.getByRole("button", { name: "Drivers", exact: true }).click();
  await history.getByRole("button", { name: "Position", exact: true }).click();
  await expect(history.getByText("No race results yet", { exact: true })).toBeVisible();
});

test("saved history exposes cumulative points, race gains, overtakes, and driver lines", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const history = await openHistory(page, 3);
  await expect(history.locator(".history-line")).toHaveCount(8);
  await expect(history.locator("#history-race option")).toHaveCount(4);
  const tideway = history.locator('[data-history-id="tideway"]');
  const apex = history.locator('[data-history-id="apex-union"]');
  await expect(tideway.locator(".history-total")).toHaveText("97");
  await history.locator("#history-race").selectOption("1");
  await expect(apex.locator(".history-total")).toHaveText("47");
  await expect(tideway.locator(".history-total")).toHaveText("3");
  await history.locator("#history-race").selectOption("2");
  await expect(tideway.locator(".history-total")).toHaveText("50");
  await expect(tideway.locator(".history-change")).toHaveAttribute("aria-label", "Up 7 places");
  await expect(history.locator("tbody tr").first()).toHaveAttribute("data-history-id", "tideway");
  await tideway.getByRole("button").click();
  await expect(history.locator(".history-line.is-muted")).toHaveCount(7);
  await expect(tideway.getByRole("button")).toBeFocused();
  await history.getByRole("button", { name: "Position", exact: true }).click();
  await expect(history.locator("#history-race option")).toHaveCount(3);
  await expect(history.locator(".history-chart > svg")).toHaveAccessibleName("Team championship positions by race");
  // Inspect a past race directly on the chart, using the visible plot geometry.
  const chart = (await history.locator(".history-chart").boundingBox())!;
  await page.mouse.move(chart.x + 45, chart.y + 100);
  await expect(history.locator("#history-race")).toHaveValue("1");
  await expect(apex.locator(".history-total")).toHaveText("47");
  await history.getByRole("button", { name: "Show all lines", exact: true }).click();
  await expect(history.locator(".history-line.is-muted")).toHaveCount(0);
  await history.getByRole("button", { name: "Drivers", exact: true }).click();
  await expect(history.locator(".history-line")).toHaveCount(16);
  await expect(history.locator(".history-line[stroke-dasharray]")).toHaveCount(8);
  await history.locator("#history-race").selectOption("2");
  const maya = history.locator('[data-history-id="maya-chen"]');
  await expect(maya.locator(".history-total")).toHaveText("26");
  await expect(maya.locator(".history-change")).toHaveAttribute("aria-label", "Up 15 places");
  await maya.getByRole("button").click();
  await expect(history.locator(".history-line.is-focused")).toHaveAttribute("data-trace", "maya-chen");
  await page.locator("#season-details").screenshot({ path: ".local/screenshots/history-desktop.png" });
  await page.reload();
  await page.getByRole("button", { name: "Season standings", exact: true }).click();
  await page.locator("#overview-history-tab").click();
  await expect(history.locator('[data-history-id="tideway"] .history-total')).toHaveText("97");
  expect(errors).toEqual([]);
});

test("full-season charts fit a phone and support race selection and touch inspection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const history = await openHistory(page, 10);
  await expect(history.locator("#history-race option")).toHaveCount(11);
  await history.locator("#history-race").focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(history.locator("#history-race")).toHaveValue("0");
  await expect(history.locator("tbody tr").first().locator(".history-total")).toHaveText("0");
  await history.getByRole("button", { name: "Position", exact: true }).click();
  await expect(history.locator("#history-race")).toHaveValue("1");
  await history.getByRole("button", { name: "Drivers", exact: true }).click();
  await expect(history.locator("tbody tr")).toHaveCount(16);
  const box = (await history.locator(".history-chart").boundingBox())!;
  await page.dispatchEvent(".history-chart", "pointerup", { clientX: box.x + box.width - 20, pointerType: "touch" });
  await expect(history.locator("#history-race")).toHaveValue("10");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.locator("#season-details").screenshot({ path: ".local/screenshots/history-phone.png" });
});
