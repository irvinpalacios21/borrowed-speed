import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createSeason, recordRace, SEASON_SCHEDULE, SEASON_STORAGE_KEY } from "../../src/game/season.ts";
import { GAME_STORAGE_KEY, parseGame, createGame, nextSeason, archiveCompletedSeason } from "../../src/game/save.ts";
import { DRIVERS } from "../../src/game/teams.ts";

function completedSeason(reverse = false) {
  let season = createSeason("hana-park", 173);
  for (const race of SEASON_SCHEDULE) season = recordRace(season, {
    raceId: race.id,
    finishes: (reverse ? [...DRIVERS].reverse() : DRIVERS).map((driver, i) => ({ driverId: driver.id, time: 100 + i })),
  });
  return season;
}

test("a mid-race save reloads at the same position and time, paused and ready to resume", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.clock.install();
  await page.locator("#driver-select").selectOption("hana-park");
  await page.locator("#start-race").click();
  await page.clock.runFor(17000);
  await page.keyboard.down("ArrowDown");
  await page.clock.runFor(500);
  await page.keyboard.up("ArrowDown");
  await page.locator("#show-saves").click();
  const time = await page.locator("#race-time").textContent();
  const position = await page.locator("#position").textContent();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), GAME_STORAGE_KEY);
  expect(saved.current.race.elapsed).toBeGreaterThan(10);
  expect(saved.current.race.cars).toHaveLength(16);
  await expect(page.locator("#save-summary")).toContainText("Race saved in progress");
  await page.locator("#save-now").click();
  await expect(page.locator("#game-save-status")).toContainText("Game saved on this device");
  await page.reload();
  await expect(page.locator(".race-app")).toHaveAttribute("data-phase", "paused");
  await expect(page.locator("#race-time")).toHaveText(time!);
  await expect(page.locator("#position")).toHaveText(position!);
  const restored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), GAME_STORAGE_KEY);
  expect(restored.current.race).toEqual(saved.current.race);
  await page.locator("#resume-race").click();
  await page.clock.runFor(2000);
  await expect(page.locator("#race-time")).not.toHaveText(time!);
  expect(errors).toEqual([]);
});

test("the existing completed season migrates, survives new seasons and reloads, and counts once", async ({ page }) => {
  await page.addInitScript(({ key, season }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(season));
  }, { key: SEASON_STORAGE_KEY, season: completedSeason() });
  await page.goto("/");
  await page.locator("#show-records").click();
  await expect(page.locator("#record-season option")).toHaveCount(1);
  await expect(page.locator(".record-champions")).toContainText("Luca Moretti");
  await expect(page.locator(".record-champions")).toContainText("Apex Union");
  await expect(page.getByRole("table", { name: "Season race podiums", exact: true }).locator("tbody tr")).toHaveCount(10);
  await page.locator("#records-drivers-tab").click();
  const luca = page.locator('[data-career-id="luca-moretti"]');
  await expect(luca.locator('[data-stat="championships"]')).toHaveText("1");
  await expect(luca.locator('[data-stat="wins"]')).toHaveText("10");
  await expect(luca.locator('[data-stat="podiums"]')).toHaveText("10");
  await page.locator("#records-back").click();
  await page.locator("#new-season").click();
  await expect(page.locator("#driver-select")).toBeVisible();
  await page.reload();
  await page.locator("#show-records").click();
  await expect(page.locator("#record-season option")).toHaveCount(1);
  await page.locator("#records-teams-tab").click();
  const apex = page.locator('[data-career-id="apex-union"]');
  await expect(apex.locator('[data-stat="championships"]')).toHaveText("1");
  await expect(apex.locator('[data-stat="wins"]')).toHaveText("10");
  await expect(apex.locator('[data-stat="podiums"]')).toHaveText("20");
});

test("a downloaded backup restores the race and full record book after preview; invalid files leave them intact", async ({ page }) => {
  const first = createGame(completedSeason());
  let second = nextSeason(first, 999);
  second.current.season = completedSeason(true);
  second = archiveCompletedSeason(second);
  await page.goto("/");
  await page.locator("#show-saves").click();
  const input = page.locator("#import-save");
  await input.setInputFiles({ name: "career.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(second)) });
  await expect(page.locator("#import-summary")).toContainText("2 completed seasons");
  await expect(page.locator("#save-summary")).toContainText("0 completed seasons");
  await page.locator("#restore-save").click();
  await expect(page.locator(".champion-note")).toContainText("Maya Chen");
  await page.locator("#show-saves").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-save").click();
  const download = await downloadPromise;
  const path = test.info().outputPath("backup.json");
  await download.saveAs(path);
  const backup = await readFile(path, "utf8");
  expect(parseGame(backup)!.archives).toHaveLength(2);
  await page.locator("#saves-back").click();
  await page.locator("#new-season").click();
  await page.locator("#show-saves").click();
  await expect(page.locator("#save-summary")).toContainText("Season 3");
  await input.setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from('{"version":1}') });
  await expect(page.locator("#import-status")).toContainText("not a valid Borrowed Speed backup");
  await expect(page.locator("#import-preview")).toBeHidden();
  await expect(page.locator("#save-summary")).toContainText("Season 3");
  await input.setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await page.locator("#restore-save").click();
  await page.reload();
  await page.locator("#show-records").click();
  await expect(page.locator("#record-season option")).toHaveCount(2);
  await page.locator("#record-season").selectOption(first.current.id);
  await expect(page.locator(".record-champions")).toContainText("Luca Moretti");
  await page.locator("#record-season").selectOption(second.current.id);
  await expect(page.locator(".record-champions")).toContainText("Maya Chen");
  await page.locator("#records-drivers-tab").click();
  await expect(page.locator('[data-career-id="luca-moretti"] [data-stat="championships"]')).toHaveText("1");
  await expect(page.locator('[data-career-id="maya-chen"] [data-stat="championships"]')).toHaveText("1");
  await page.screenshot({ path: ".local/screenshots/records-desktop.png", fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const tab of ["seasons", "drivers", "teams"]) {
      await page.locator(`#records-${tab}-tab`).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator("#show-saves").click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("#show-records").click();
  }
  await page.locator("#records-seasons-tab").click();
  await page.screenshot({ path: ".local/screenshots/records-phone.png", fullPage: true });
});

test("storage write failures are visible and a backup still downloads", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await page.goto("/");
  await page.locator("#start-race").click();
  await page.locator("#show-saves").click();
  await expect(page.locator("#game-save-status")).toContainText("Could not save");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#export-save").click();
  const download = await downloadPromise;
  const path = test.info().outputPath("unsaved-backup.json");
  await download.saveAs(path);
  expect(parseGame(await readFile(path, "utf8"))!.current.season.playerDriverId).not.toBeNull();
});

test("an unreadable stored game stays untouched until a valid backup is restored", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "unreadable-original"), GAME_STORAGE_KEY);
  await page.goto("/");
  await page.locator("#show-saves").click();
  await expect(page.locator("#game-save-status")).toContainText("kept untouched");
  expect(await page.evaluate((key) => localStorage.getItem(key), GAME_STORAGE_KEY)).toBe("unreadable-original");
});
