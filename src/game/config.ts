export const METERS_PER_MILE = 1609.344;
export const MPH_PER_MPS = 2.2369362921;
export const FIXED_STEP = 1 / 120;

export interface RaceConfig {
  carCount: number;
  miles: number;
  baseSpeed: number;
  maxDraftBonus: number;
  maxSlipstreamBonus: number;
  slipstreamReleaseSeconds: number;
  latchGap: number;
  latchResetGap: number;
  pushGap: number;
  slingshotMinClosingSpeed: number;
  bonusPerCar: number;
  draftGap: number;
  draftAlignment: number;
  carLength: number;
  carWidth: number;
  contactGap: number;
  roadHalfWidth: number;
  steerSpeed: number;
  brakeDeceleration: number;
  brakeFollowerGap: number;
}

export const DEFAULT_CONFIG: Readonly<RaceConfig> = Object.freeze({
  carCount: 16,
  miles: 7.5,
  baseSpeed: 79,
  maxDraftBonus: 18,
  maxSlipstreamBonus: 8,
  slipstreamReleaseSeconds: 12,
  latchGap: 2,
  latchResetGap: 10,
  pushGap: 0.8,
  slingshotMinClosingSpeed: 1,
  bonusPerCar: 2.8,
  draftGap: 36,
  draftAlignment: 0.85,
  carLength: 5.2,
  carWidth: 1.9,
  contactGap: 0.45,
  roadHalfWidth: 7.2,
  steerSpeed: 3.2,
  brakeDeceleration: 3,
  brakeFollowerGap: 8,
});

export const RACING_LINES = [-4.8, -1.6, 1.6, 4.8] as const;
