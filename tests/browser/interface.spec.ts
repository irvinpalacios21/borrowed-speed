import { test, expect } from "@playwright/test";

test("Season preserves the paused race and ignores race shortcuts until returning", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.clock.install();
  await page.locator("#start-race").click();
  await page.clock.runFor(5000);
  await page.locator("#teams-tab").click();
  const canvasBefore = await page.locator("canvas").boundingBox();
  await page.locator("#show-season").click();
  await expect(page.locator("#race-view")).toBeHidden();
  await expect(page.locator("#season-heading")).toBeFocused();
  await expect(page.locator(".race-app")).toHaveAttribute("data-phase", "paused");
  const time = await page.locator("#race-time").textContent();
  const position = await page.locator("#position").textContent();
  const grid = await page.locator("#grid-note").textContent();
  await page.keyboard.press("Space");
  await page.keyboard.press("KeyR");
  await page.keyboard.down("ArrowDown");
  await page.clock.runFor(8000);
  await page.keyboard.up("ArrowDown");
  await expect(page.locator("#race-time")).toHaveText(time!);
  await expect(page.locator("#position")).toHaveText(position!);
  await page.locator("#overview-history-tab").click();
  await expect(page.locator("#overview-history")).toBeVisible();
  await page.locator("#back-to-race").click();
  await expect(page.locator("#season-view")).toBeHidden();
  await expect(page.locator("#resume-race")).toBeFocused();
  await expect(page.locator("#teams-tab")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#grid-note")).toHaveText(grid!);
  const canvasAfter = await page.locator("canvas").boundingBox();
  expect(canvasAfter?.width).toBe(canvasBefore?.width);
  expect(canvasAfter?.height).toBe(canvasBefore?.height);
  await page.locator("#resume-race").click();
  await page.clock.runFor(2000);
  await expect(page.locator("#race-time")).not.toHaveText(time!);
  expect(errors).toEqual([]);
});

test("fullscreen enters, exits, and follows browser fullscreen changes", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), "Fullscreen is unavailable in this browser");
  const size = await page.locator("canvas").boundingBox();
  await page.locator("#fullscreen").click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === document.documentElement)).toBe(true);
  await expect(page.locator("#fullscreen")).toHaveText("Exit full screen");
  await expect(page.locator("#fullscreen")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#display-status")).toBeHidden();
  await page.screenshot({ path: ".local/screenshots/interface-fullscreen.png", fullPage: true });
  await page.locator("#show-season").click();
  await expect(page.locator("#season-view")).toBeVisible();
  await page.locator("#fullscreen").click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
  await expect(page.locator("#fullscreen")).toHaveText("Full screen");
  await page.locator("#back-to-race").click();
  const restored = await page.locator("canvas").boundingBox();
  expect(restored?.width).toBe(size?.width);
  expect(restored?.height).toBe(size?.height);
  await page.locator("#fullscreen").click();
  await expect(page.locator("#fullscreen")).toHaveText("Exit full screen");
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator("#fullscreen")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#fullscreen")).toHaveText("Full screen");
});

test("a rejected fullscreen request gives feedback and keeps the game usable", async ({ page }) => {
  await page.goto("/");
  test.skip(!(await page.evaluate(() => document.fullscreenEnabled)), "Fullscreen is unavailable in this browser");
  await page.evaluate(() => {
    document.documentElement.requestFullscreen = () => Promise.reject(new Error("Unavailable"));
  });
  await page.locator("#fullscreen").click();
  await expect(page.locator("#display-status")).toHaveText("Full screen is unavailable in this browser window.");
  await expect(page.locator("#fullscreen")).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#start-race")).toBeVisible();
});

test("Audio opens from the keyboard and Escape dismisses it without pausing", async ({ page }) => {
  await page.goto("/");
  await page.clock.install();
  await page.locator("#start-race").click();
  await page.clock.runFor(5000);
  await page.locator("#audio-toggle").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#music")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.locator("#music")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#audio-options")).toBeHidden();
  await expect(page.locator("#audio-toggle")).toBeFocused();
  await expect(page.locator(".race-app")).toHaveAttribute("data-phase", "racing");
  await page.locator("#audio-toggle").click();
  await page.locator("#race-canvas").click();
  await expect(page.locator("#audio-options")).toBeHidden();
});

test("compact controls and both views fit desktop, tablet, and narrow phones", async ({ page }) => {
  await page.goto("/");
  for (const width of [1844, 1440, 1024, 800, 600, 390, 320]) {
    await page.setViewportSize({ width, height: 1047 });
    await expect(page.locator("#race-view")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const canvas = await page.locator("canvas").boundingBox();
    expect(canvas!.height).toBeGreaterThanOrEqual(310);
    if (width >= 1440) expect(canvas!.width).toBe(1066);
    await page.locator("#audio-toggle").click();
    const audio = await page.locator("#audio-options").boundingBox();
    expect(audio!.x).toBeGreaterThanOrEqual(0);
    expect(audio!.x + audio!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    if (width === 1844 || width === 390) {
      await page.screenshot({ path: `.local/screenshots/interface-race-${width}.png`, fullPage: true });
    }
    await page.locator("#show-season").click();
    await page.locator("#overview-calendar-tab").click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1844 || width === 390) {
      await page.screenshot({ path: `.local/screenshots/interface-season-${width}.png`, fullPage: true });
    }
    await page.locator("#back-to-race").click();
  }
});
