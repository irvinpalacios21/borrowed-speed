import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createSeason, SEASON_STORAGE_KEY } from "../../src/game/season.ts";

declare global {
  interface Window {
    __raceAudioProbe: {
      outputs: AnalyserNode[];
      sources: AudioBufferSourceNode[];
      oscillators: OscillatorNode[];
    };
  }
}

async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const probe = (window.__raceAudioProbe = {
      outputs: [] as AnalyserNode[],
      sources: [] as AudioBufferSourceNode[],
      oscillators: [] as OscillatorNode[],
    });
    // Observe native output without replacing decoding, playback, or gain behavior.
    AudioNode.prototype.connect = new Proxy(AudioNode.prototype.connect, {
      apply(connect, node, args) {
        const result = Reflect.apply(connect, node, args);
        if (args[0] instanceof AudioDestinationNode) {
          const analyser = node.context.createAnalyser();
          analyser.fftSize = 2048;
          Reflect.apply(connect, node, [analyser]);
          probe.outputs.push(analyser);
        }
        return result;
      },
    });
    const createSource = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = createSource.call(this);
      probe.sources.push(source);
      return source;
    };
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = createOscillator.call(this);
      probe.oscillators.push(oscillator);
      return oscillator;
    };
  });
}

async function outputLevel(page: Page) {
  return page.evaluate(() =>
    Math.max(
      0,
      ...window.__raceAudioProbe.outputs.map((analyser) => {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        return Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
      }),
    ),
  );
}

async function toggleAudio(page: Page, control: "music" | "sound") {
  const button = page.locator("#" + control);
  if (!(await button.isVisible())) await page.locator("#audio-toggle").click();
  await button.click();
}

async function startRacing(page: Page) {
  await page.getByRole("button", { name: "Start season", exact: true }).click();
  await expect(page.locator(".race-app")).toHaveAttribute("data-phase", "racing", {
    timeout: 7000,
  });
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
}

test("local recorded audio loads on demand, plays in races, and respects pause, mute, and finish", async ({ page }) => {
  await observeAudio(page);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: SEASON_STORAGE_KEY,
    value: JSON.stringify(createSeason(null, 173)),
  });
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/audio/")) requests.push(request.url());
  });
  // Register the game loop with the clock before the page creates its timers.
  await page.clock.install();
  await page.goto("/");
  const sound = page.locator("#sound");
  await expect(sound).toHaveText("Sound off");
  expect(await outputLevel(page)).toBe(0);
  expect(requests).toEqual([]);

  const response = page.waitForResponse((r) => r.url().endsWith("/audio/engine-loop.wav"));
  await toggleAudio(page, "sound");
  const asset = await response;
  expect(asset.status()).toBe(200);
  expect((await asset.body()).subarray(0, 4).toString()).toBe("RIFF");
  await expect(sound).toHaveAttribute("aria-pressed", "true");
  expect(await outputLevel(page)).toBeLessThan(0.0001);
  const decoded = await page.evaluate(() => window.__raceAudioProbe.sources.map((source) => ({
    duration: source.buffer?.duration,
    loop: source.loop,
  })));
  expect(decoded).toHaveLength(1);
  expect(decoded[0].duration).toBeCloseTo(0.864, 2);
  expect(decoded.every((source) => source.loop)).toBe(true);

  await startRacing(page);
  await page.locator("#pause").click();
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
  await page.getByRole("button", { name: "Resume race", exact: true }).click();
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
  await toggleAudio(page, "sound");
  await expect(sound).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
  await toggleAudio(page, "sound");
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => window.__raceAudioProbe.sources.length)).toBe(1);

  await page.clock.runFor(135000);
  await test.info().attach("race-after-clock-advance", {
    body: JSON.stringify(await page.evaluate(() => ({
      phase: document.querySelector(".race-app")?.getAttribute("data-phase"),
      time: document.querySelector("#race-time")?.textContent,
      remaining: document.querySelector("#remaining")?.textContent,
    }))),
    contentType: "application/json",
  });
  await expect(page.locator(".race-app")).toHaveAttribute("data-phase", "finished");
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
  expect(errors).toEqual([]);
});

test("losing focus fades racing audio and pauses the game", async ({ page }) => {
  await observeAudio(page);
  await page.goto("/");
  await toggleAudio(page, "sound");
  await expect(page.locator("#sound")).toHaveText("Sound on");
  await startRacing(page);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect(page.locator(".race-app")).toHaveAttribute("data-phase", "paused");
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
});

for (const failure of ["missing", "corrupt"] as const) {
  test(`${failure} engine file keeps synthesized fallback and mute working`, async ({ page }) => {
    await observeAudio(page);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/audio/engine-loop.wav", (route) => route.fulfill({
      status: failure === "missing" ? 404 : 200,
      contentType: "audio/wav",
      body: failure === "missing" ? "" : "invalid audio data",
    }));
    await page.goto("/");
    await toggleAudio(page, "sound");
    await expect(page.locator("#sound")).toHaveText("Sound on");
    expect(await page.evaluate(() => window.__raceAudioProbe.oscillators.length)).toBe(1);
    await startRacing(page);
    await toggleAudio(page, "sound");
    await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
    expect(errors).toEqual([]);
  });
}

test("music plays a local loop independently of effects and respects pause, mute, and focus", async ({ page }) => {
  await observeAudio(page);
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("/audio/")) requests.push(request.url());
  });
  await page.goto("/");
  const music = page.locator("#music");
  const sound = page.locator("#sound");
  await expect(music).toHaveText("Music off");
  expect(requests).toEqual([]);
  await toggleAudio(page, "music");
  await expect(music).toHaveText("Music on");
  await expect(music).toHaveAttribute("aria-pressed", "true");
  await expect(sound).toHaveText("Sound off");
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
  expect(requests).toEqual(["http://127.0.0.1:5173/audio/pixel-sprinter-loop.ogg"]);
  const track = await page.evaluate(() => {
    const source = window.__raceAudioProbe.sources[0];
    return { duration: source.buffer?.duration, loop: source.loop, rate: source.playbackRate.value };
  });
  expect(track.duration).toBeGreaterThan(10);
  expect(track.loop).toBe(true);
  expect(track.rate).toBe(1);

  await toggleAudio(page, "music");
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
  await toggleAudio(page, "music");
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => window.__raceAudioProbe.sources.length)).toBe(1);

  await startRacing(page);
  await page.locator("#pause").click();
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
  await page.getByRole("button", { name: "Resume race", exact: true }).click();
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
  await toggleAudio(page, "sound");
  await expect(sound).toHaveText("Sound on");
  await toggleAudio(page, "music");
  await expect(music).toHaveText("Music off");
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
  await toggleAudio(page, "sound");
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
  await toggleAudio(page, "music");
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
  expect(errors).toEqual([]);
});

for (const failure of ["missing", "corrupt"] as const) {
  test(`${failure} music can be retried without enabling engine effects`, async ({ page }) => {
    await observeAudio(page);
    let fail = true;
    await page.route("**/audio/pixel-sprinter-loop.ogg", (route) => fail
      ? route.fulfill({
        status: failure === "missing" ? 404 : 200,
        contentType: "audio/ogg",
        body: "invalid audio data",
      })
      : route.continue());
    await page.goto("/");
    await toggleAudio(page, "music");
    await expect(page.locator("#music")).toHaveText("Retry music");
    await expect(page.locator("#music")).toHaveAttribute("aria-pressed", "false");
    expect(await outputLevel(page)).toBeLessThan(0.0001);
    fail = false;
    await toggleAudio(page, "music");
    await expect(page.locator("#music")).toHaveText("Music on");
    await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
    await expect(page.locator("#sound")).toHaveText("Sound off");
  });
}

test("music controls fit on a phone and menu music silences on focus loss", async ({ page }) => {
  await observeAudio(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await toggleAudio(page, "music");
  await expect(page.locator("#music")).toHaveText("Music on");
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: ".local/screenshots/music-phone.png", fullPage: true });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await expect.poll(() => outputLevel(page)).toBeLessThan(0.0001);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => outputLevel(page)).toBeGreaterThan(0.003);
});
