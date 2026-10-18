import { DEFAULT_CONFIG } from "./config.ts";

const ENGINE_URL = `${import.meta.env.BASE_URL}audio/engine-loop.wav`;
const MUSIC_URL = `${import.meta.env.BASE_URL}audio/pixel-sprinter-loop.ogg`;

export class RaceAudio {
  enabled = false;
  musicEnabled = false;
  private context?: AudioContext;
  private engine?: AudioBufferSourceNode;
  private fallback?: OscillatorNode;
  private engineGain?: GainNode;
  private initializing?: Promise<void>;
  private music?: AudioBufferSourceNode;
  private musicGain?: GainNode;
  private musicLoading?: Promise<void>;
  private musicActive = false;
  private speed = 0;
  private active = false;

  async toggle() {
    this.context ??= new AudioContext();
    // Resume inside the click gesture, before waiting for the asset request.
    await this.context.resume();
    this.initializing ??= this.initialize(this.context);
    await this.initializing;
    this.enabled = !this.enabled;
    this.applyMix();
    return this.enabled;
  }

  async toggleMusic() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (!this.music) {
      this.musicLoading ??= this.loadMusic(this.context).finally(() => {
        this.musicLoading = undefined;
      });
      await this.musicLoading;
    }
    this.musicEnabled = !this.musicEnabled;
    this.applyMix();
    return this.musicEnabled;
  }

  private async loadMusic(context: AudioContext) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(MUSIC_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`Music: ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      const music = context.createBufferSource();
      music.buffer = buffer;
      music.loop = true;
      const gain = context.createGain();
      gain.gain.value = 0;
      music.connect(gain).connect(context.destination);
      music.start();
      this.music = music;
      this.musicGain = gain;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private async initialize(context: AudioContext) {
    this.engineGain = context.createGain();
    this.engineGain.gain.value = 0;
    const engineFilter = context.createBiquadFilter();
    engineFilter.type = "lowpass";
    engineFilter.frequency.value = 1800;
    engineFilter.connect(this.engineGain).connect(context.destination);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(ENGINE_URL, { signal: controller.signal });
      if (!response.ok) throw new Error(`Engine audio: ${response.status}`);
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      this.engine = context.createBufferSource();
      this.engine.buffer = buffer;
      this.engine.loop = true;
      this.engine.connect(engineFilter);
      this.engine.start();
    } catch {
      // Keep optional sound usable if the file cannot load or decode.
      this.fallback = context.createOscillator();
      this.fallback.type = "sawtooth";
      this.fallback.connect(engineFilter);
      this.fallback.start();
    } finally {
      window.clearTimeout(timeout);
    }
  }

  update(speed: number, active: boolean, musicActive = active) {
    this.speed = speed;
    this.active = active;
    this.musicActive = musicActive;
    this.applyMix();
  }

  silence() {
    this.active = false;
    this.musicActive = false;
    this.applyMix();
  }

  private applyMix() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const speed = Math.max(0, Math.min(1.4, this.speed / DEFAULT_CONFIG.baseSpeed));
    const audible = this.enabled && this.active;
    // The game has a narrow speed range. Small pitch changes preserve the recording.
    this.engine?.playbackRate.setTargetAtTime(0.85 + speed * 0.25, now, 0.15);
    this.fallback?.frequency.setTargetAtTime(35 + this.speed * 0.55, now, 0.15);
    this.engineGain?.gain.setTargetAtTime(
      audible ? (this.fallback ? 0.025 : 0.14) : 0,
      now,
      0.05,
    );
    this.musicGain?.gain.setTargetAtTime(
      this.musicEnabled && this.musicActive ? 0.22 : 0,
      now,
      0.12,
    );
  }
}
