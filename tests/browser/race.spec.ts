import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import {
  createSeason,
  POINTS,
  recordRace,
  SEASON_SCHEDULE,
  SEASON_STORAGE_KEY,
  startingGrid,
} from "../../src/game/season.ts";
import { DRIVERS } from "../../src/game/teams.ts";

async function seed(page: Page, rounds = 0) {
  let season = createSeason(rounds ? "hana-park" : null, 173);
  for (const race of SEASON_SCHEDULE.slice(0, rounds))
    season = recordRace(season, {
      raceId: race.id,
      finishes: DRIVERS.map((d, i) => ({ driverId: d.id, time: 100 + i })),
    });
  await page.addInitScript(
    ({ key, value }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      localStorage.setItem("slipstream-season-v1", "original-eight-car-save");
    },
    { key: SEASON_STORAGE_KEY, value: JSON.stringify(season) },
  );
  return season;
}

test("sixteen-driver selection, identity lock, steering, feedback, pause and restart work", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:5173/"))
      external.push(request.url());
  });
  await seed(page);
  await page.goto("/");
  await expect(page.locator("#standings li")).toHaveCount(16);
  await expect(page.locator("#driver-select option")).toHaveCount(16);
  await page.locator("#driver-select").selectOption("hana-park");
  await expect(page.locator("#driver-profile")).toContainText("Hana Park");
  await expect(page.locator(".teammate-note")).toContainText("Noah Bennett");
  await expect(page.locator("body")).not.toContainText("\u00c2");
  await expect(page.locator("#start-race")).toContainText("\u2197");
  await page.screenshot({
    path: ".local/screenshots/drivers-desktop-selection.png",
    fullPage: true,
  });
  await page.clock.install();
  const gridBefore = await page.locator("#grid-note").textContent();
  await page.getByRole("button", { name: "Start season", exact: true }).click();
  await page.clock.runFor(4500);
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "racing",
  );
  await page.keyboard.down("ArrowDown");
  await page.clock.runFor(600);
  await page.keyboard.up("ArrowDown");
  await page.clock.runFor(3500);
  await expect(page.locator("#closing-readout")).not.toBeEmpty();
  await expect(page.locator("#player-identity")).toContainText("#42 Hana Park");
  await page.screenshot({
    path: ".local/screenshots/drivers-desktop-racing.png",
    fullPage: true,
  });
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("heading", { name: "Race paused" }),
  ).toBeVisible();
  const time = await page.locator("#race-time").textContent();
  await page.clock.runFor(5000);
  await expect(page.locator("#race-time")).toHaveText(time!);
  await page.getByRole("button", { name: "Resume race", exact: true }).click();
  await page.keyboard.press("KeyR");
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "countdown",
  );
  await expect(page.locator("#grid-note")).toHaveText(gridBefore!);
  await page.reload();
  await expect(page.locator("#driver-select")).toHaveCount(0);
  await expect(page.locator("#resume-race")).toBeVisible();
  await expect(page.locator("#player-identity")).toContainText("Hana Park");
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).playerDriverId,
      SEASON_STORAGE_KEY,
    ),
  ).toBe("hana-park");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("a complete race scores sixteen drivers, sums both teammates, and advances to the saved reverse grid", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await page.clock.install();
  await page.locator("#driver-select").selectOption("hana-park");
  await page.getByRole("button", { name: "Start season", exact: true }).click();
  await page.clock.runFor(135000);
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "finished",
  );
  await expect(
    page.getByText("Race 1 complete", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#remaining")).toHaveText("0.00");
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    SEASON_STORAGE_KEY,
  );
  expect(saved.results).toHaveLength(1);
  expect(saved.results[0].finishes).toHaveLength(16);
  const position = saved.results[0].finishes.findIndex(
    (f: { driverId: string }) => f.driverId === "hana-park",
  );
  const matePosition = saved.results[0].finishes.findIndex(
    (f: { driverId: string }) => f.driverId === "noah-bennett",
  );
  await page
    .getByRole("button", { name: "View season standings", exact: true })
    .click();
  await expect(page.locator("#driver-table tr")).toHaveCount(16);
  await expect(
    page.locator('#driver-table [data-driver-id="hana-park"] .driver-points'),
  ).toHaveText(String(POINTS[position]));
  await page.locator("#overview-teams-tab").click();
  await expect(page.locator("#team-table tr")).toHaveCount(8);
  await expect(
    page.locator('#team-table [data-team-id="blue-harbor"] .team-points'),
  ).toHaveText(String(POINTS[position] + POINTS[matePosition]));
  await page.locator("#overview-history-tab").click();
  await expect(page.locator("#history-race option")).toHaveCount(2);
  await expect(
    page.locator('#overview-history [data-history-id="blue-harbor"] .history-total'),
  ).toHaveText(String(POINTS[position] + POINTS[matePosition]));
  await page.locator('#overview-history [data-mode="drivers"]').click();
  await expect(
    page.locator('#overview-history [data-history-id="hana-park"] .history-total'),
  ).toHaveText(String(POINTS[position]));
  await page.getByRole("button", { name: "Back to race", exact: true }).click();
  await page.screenshot({
    path: ".local/screenshots/drivers-first-result.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next race", exact: true }).click();
  await expect(page.locator("#round-label")).toHaveText("Race 2 of 10");
  await expect(page.locator("#setting-label")).toHaveText("Night");
  const order = await page
    .locator("#standings li")
    .evaluateAll((rows) =>
      rows.map((row) => (row as HTMLElement).dataset.driverId),
    );
  expect(order).toEqual(startingGrid(saved));
  await expect(page.locator("#grid-note")).toContainText(
    "Reverse driver standings",
  );
  await page.reload();
  await expect(page.locator("#driver-select")).toHaveCount(0);
  await expect(page.locator("#driver-profile")).toContainText("Hana Park");
  await expect(
    page.getByRole("button", { name: "Start race 2", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).results,
      SEASON_STORAGE_KEY,
    ),
  ).toEqual(saved.results);
});

test("completed season restores both champions and a fresh season unlocks selection without deleting the old save", async ({
  page,
}) => {
  await seed(page, 10);
  await page.goto("/");
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "season-complete",
  );
  await expect(page.locator("#remaining")).toHaveText("0.00");
  await expect(page.locator("#speed")).toHaveText("0");
  await expect(page.locator("#race-time")).toHaveText("1:45.0");
  await page.locator("#race-tab").click();
  await expect(page.locator("#table-title")).toHaveText("Final race");
  await expect(page.locator("#standings li").first()).toHaveAttribute(
    "data-driver-id",
    "luca-moretti",
  );
  await expect(
    page.locator("#standings li").first().locator(".gap"),
  ).toHaveText("Leader");
  await expect(page.locator(".champion-note")).toContainText("Luca Moretti");
  await expect(page.locator(".champion-note")).toContainText("Apex Union");
  await page
    .getByRole("button", { name: "View final standings", exact: true })
    .click();
  await expect(page.locator("#completed-count")).toHaveText(
    "10 of 10 complete",
  );
  await expect(
    page.locator(
      '#driver-table [data-driver-id="luca-moretti"] .driver-points',
    ),
  ).toHaveText("250");
  await page.locator("#overview-teams-tab").click();
  await expect(
    page.locator('#team-table [data-team-id="apex-union"] .team-points'),
  ).toHaveText("470");
  await page.screenshot({
    path: ".local/screenshots/drivers-season-complete.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to race", exact: true }).click();
  await page
    .getByRole("button", { name: "Start a new season", exact: true })
    .click();
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "selection",
  );
  await expect(page.locator("#driver-select")).toBeVisible();
  const reset = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    SEASON_STORAGE_KEY,
  );
  expect(reset.playerDriverId).toBeNull();
  expect(reset.results).toHaveLength(0);
  expect(
    await page.evaluate(() => localStorage.getItem("slipstream-season-v1")),
  ).toBe("original-eight-car-save");
});

test("phone selection, touch steering, and driver/team/calendar views fit without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seed(page);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Steer up", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/screenshots/drivers-phone-selection.png",
    fullPage: true,
  });
  await page.clock.install();
  await page.getByRole("button", { name: "Start season", exact: true }).click();
  await page.clock.runFor(4000);
  const box = (await page
    .getByRole("button", { name: "Steer down", exact: true })
    .boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(700);
  await page.mouse.up();
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "racing",
  );
  await page.screenshot({
    path: ".local/screenshots/drivers-phone-racing.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Season standings", exact: true })
    .click();
  await expect(page.locator(".race-app")).toHaveAttribute(
    "data-phase",
    "paused",
  );
  await expect(
    page.getByRole("heading", { name: "Driver championship", exact: true }),
  ).toBeVisible();
  await page.locator("#overview-teams-tab").click();
  await expect(
    page.getByRole("heading", { name: "Team championship", exact: true }),
  ).toBeVisible();
  await page.locator("#overview-calendar-tab").click();
  await expect(page.locator("#season-schedule li")).toHaveCount(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/screenshots/drivers-phone-calendar.png",
    fullPage: true,
  });
});

for (const [rounds, setting] of [
  [0, "Coastal"],
  [1, "Night"],
  [2, "Desert"],
  [3, "Forest"],
] as const) {
  test(
    setting + " race setting renders a playable sixteen-car grid",
    async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await seed(page, rounds);
      await page.goto("/");
      await page.clock.install();
      await expect(page.locator("#setting-label")).toHaveText(setting);
      await page.locator("#start-race").click();
      await page.clock.runFor(4500);
      await expect(page.locator(".race-app")).toHaveAttribute(
        "data-phase",
        "racing",
      );
      await expect(page.locator("#standings li")).toHaveCount(16);
      await page.screenshot({
        path: ".local/screenshots/setting-" + setting.toLowerCase() + ".png",
        fullPage: true,
      });
      expect(errors).toEqual([]);
    },
  );
}
