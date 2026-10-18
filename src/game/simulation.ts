import { DEFAULT_CONFIG, METERS_PER_MILE, RACING_LINES } from "./config.ts";
import type { RaceConfig } from "./config.ts";
import { DEFAULT_DRIVER_ID, DRIVERS, driverById, teamById } from "./teams.ts";
import type { SettingId } from "./settings.ts";

export type Phase =
  "ready" | "countdown" | "racing" | "finishing" | "paused" | "finished";
export interface Car {
  id: number;
  driverId: string;
  driverName: string;
  shortName: string;
  seat: 0 | 1;
  gridPosition: number;
  teamId: string;
  teamName: string;
  number: string;
  color: string;
  player: boolean;
  progress: number;
  previousProgress: number;
  lateral: number;
  speed: number;
  targetLateral: number;
  decisionAt: number;
  frontId: number | null;
  rearId: number | null;
  trainSize: number;
  draftBonus: number;
  slipstreamBonus: number;
  latchedToId: number | null;
  pushBonus: number;
  slingshotBonus: number;
  slingshotInitialBonus: number;
  braking: boolean;
  aiBrakeUntil: number;
  aiBrakeDecisionAt: number;
  finishTime: number | null;
}

export type SlingshotState = "idle" | "building" | "ready" | "blocked" | "latched" | "carrying";
export interface SlingshotFeedback {
  state: SlingshotState;
  strength: number;
  closingSpeed: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const approach = (value: number, target: number, amount: number) =>
  value + clamp(target - value, -amount, amount);
const AI_STEER_SPEED = 2.2;

export interface RaceSetup {
  playerDriverId?: string;
  grid?: readonly string[];
  setting?: SettingId;
}

const savedCarFields = [
  "progress", "previousProgress", "lateral", "speed", "targetLateral",
  "decisionAt", "draftBonus", "slipstreamBonus", "pushBonus",
  "slingshotBonus", "slingshotInitialBonus",
] as const;
const savedBrakeFields = ["aiBrakeUntil", "aiBrakeDecisionAt"] as const;
type RunningPhase = "countdown" | "racing" | "finishing";
export interface RaceSnapshot {
  version: 1;
  phase: RunningPhase;
  elapsed: number;
  countdown: number;
  randomState: number;
  cars: (Pick<Car, typeof savedCarFields[number] | "driverId" | "latchedToId" | "finishTime"> &
    Partial<Pick<Car, typeof savedBrakeFields[number]>>)[];
}

export function trainSpeedBonus(size: number, config: RaceConfig) {
  if (config.bonusPerCar <= 0 || config.maxDraftBonus <= 0) return 0;
  const linearCars = Math.min(4, config.maxDraftBonus / config.bonusPerCar);
  const cars = Math.max(0, size - 1);
  const linear = Math.min(cars, linearCars) * config.bonusPerCar;
  const remaining = config.maxDraftBonus - linear;
  return cars <= linearCars || remaining <= 0
    ? linear
    : linear +
        remaining *
          (1 -
            Math.exp((-(cars - linearCars) * config.bonusPerCar) / remaining));
}

export class RaceSimulation {
  readonly config: RaceConfig;
  readonly setting: SettingId;
  cars: Car[] = [];
  phase: Phase = "ready";
  elapsed = 0;
  countdown = 3;
  steeringBlocked = false;
  braking = false;
  brakeBlocked = false;
  private pausedPhase: Phase = "racing";
  private randomState: number;

  constructor(
    config: Partial<RaceConfig> = {},
    seed = 173,
    setup: RaceSetup = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (
      !Number.isInteger(this.config.carCount) ||
      this.config.carCount < 2 ||
      this.config.carCount > DRIVERS.length
    )
      throw new Error("Car count must be between 2 and 16.");
    if (!(this.config.miles > 0))
      throw new Error("Race distance must be positive.");
    this.randomState = seed >>> 0;
    this.setting = setup.setting ?? "coastal";
    const playerDriver = driverById(setup.playerDriverId ?? DEFAULT_DRIVER_ID);
    if (!playerDriver) throw new Error("Unknown player driver.");
    const roster =
      this.config.carCount === DRIVERS.length
        ? [...DRIVERS]
        : [
            ...DRIVERS.filter((driver) => driver.id !== playerDriver.id).slice(
              0,
              this.config.carCount - 1,
            ),
            playerDriver,
          ];
    const grid = setup.grid ?? roster.map((driver) => driver.id);
    if (
      grid.length !== roster.length ||
      new Set(grid).size !== roster.length ||
      grid.some((id) => !roster.some((driver) => driver.id === id))
    )
      throw new Error(
        "The grid must contain each participating driver exactly once.",
      );
    for (let i = 0; i < this.config.carCount; i++) {
      const driver = roster[i];
      const player = driver.id === playerDriver.id;
      const team = teamById(driver.teamId);
      const slot = grid.indexOf(driver.id);
      const progress =
        (Math.floor((this.config.carCount - 1) / 2) - Math.floor(slot / 2)) *
          7 +
        (slot % 2 === 0 ? 0.45 : 0);
      this.cars.push({
        id: i,
        driverId: driver.id,
        driverName: driver.name,
        shortName: driver.shortName,
        seat: driver.seat,
        gridPosition: slot + 1,
        teamId: team.id,
        teamName: team.name,
        number: driver.number,
        color: team.color,
        player,
        progress,
        previousProgress: progress,
        lateral: slot % 2 === 0 ? -1.6 : 1.6,
        speed: this.config.baseSpeed,
        targetLateral: slot % 2 === 0 ? -1.6 : 1.6,
        decisionAt: 1.5 + this.random() * 5,
        frontId: null,
        rearId: null,
        trainSize: 1,
        draftBonus: 0,
        slipstreamBonus: 0,
        latchedToId: null,
        pushBonus: 0,
        slingshotBonus: 0,
        slingshotInitialBonus: 0,
        braking: false,
        aiBrakeUntil: 0,
        aiBrakeDecisionAt: 8 + slot * 0.5,
        finishTime: null,
      });
    }
    this.updateDrafts();
  }

  get player() {
    return this.cars.find((car) => car.player)!;
  }
  get finishDistance() {
    return this.config.miles * METERS_PER_MILE;
  }
  get remainingMiles() {
    return Math.max(
      0,
      (this.finishDistance - this.player.progress) / METERS_PER_MILE,
    );
  }
  get position() {
    return this.standings.findIndex((car) => car.player) + 1;
  }

  get standings() {
    return [...this.cars].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null)
        return a.finishTime - b.finishTime || a.id - b.id;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.progress - a.progress || a.id - b.id;
    });
  }

  /** Check body positions independently of draft links. */
  brakeBlocker(car = this.player): Car | null {
    let blocker: Car | null = null;
    for (const other of this.cars) {
      const distance = car.progress - other.progress;
      if (other.id === car.id || distance <= 0 ||
        distance > this.config.carLength + this.config.brakeFollowerGap ||
        Math.abs(car.lateral - other.lateral) >= this.config.carWidth + 0.16) continue;
      if (blocker === null || other.progress > blocker.progress) blocker = other;
    }
    return blocker;
  }

  canBrake(car = this.player) {
    return (this.phase === "racing" || this.phase === "finishing") &&
      car.finishTime === null && this.brakeBlocker(car) === null;
  }

  private wantsAIBrake(car: Car) {
    if (car.aiBrakeUntil <= this.elapsed) return false;
    const front = car.frontId === null ? null : this.cars[car.frontId];
    if (!front || !this.canBrake(car) ||
      front.progress - car.progress - this.config.carLength >= this.config.latchResetGap + 2 ||
      this.finishDistance - car.progress <= 1000) {
      car.aiBrakeUntil = 0;
      return false;
    }
    return true;
  }

  slingshot(car = this.player): SlingshotFeedback {
    const front = car.frontId === null ? null : this.cars[car.frontId];
    const closingSpeed = front ? car.speed - front.speed : 0;
    let state: SlingshotState = "idle";
    let strength = 0;
    if (car.finishTime === null && !car.braking) {
      if (car.latchedToId !== null && front?.id === car.latchedToId) state = "latched";
      else if (front) {
        strength = clamp(closingSpeed / Math.max(1, this.config.maxSlipstreamBonus), 0, 1);
        const reserve = Math.max(0, car.speed - this.config.baseSpeed);
        const frontGain = Math.max(0, front.speed - this.config.baseSpeed);
        const release = this.config.slipstreamReleaseSeconds;
        const passTime = frontGain > 0 && reserve > frontGain
          ? Math.min(6, release * Math.log(reserve / frontGain)) : 6;
        const availableRun = reserve * release * (1 - Math.exp(-passTime / release)) - frontGain * passTime;
        state = closingSpeed >= this.config.slingshotMinClosingSpeed &&
          availableRun > front.progress - car.progress + this.config.carLength &&
          front.progress - car.progress - this.config.carLength > this.config.latchGap
          ? "ready" : "building";
        if (state === "ready" && !this.passingSpace(car)) state = "blocked";
      } else if (car.slingshotBonus > 0.4) {
        state = "carrying";
        strength = clamp(car.slingshotBonus / car.slingshotInitialBonus, 0, 1);
      }
    }
    return { state, strength, closingSpeed };
  }

  private passingSpace(car: Car) {
    const limit = this.config.roadHalfWidth - this.config.carWidth / 2 - 0.3;
    const clearance = this.config.carWidth + 0.2;
    return [-clearance, clearance].some((offset) => {
      const target = car.lateral + offset;
      return Math.abs(target) <= limit && this.canMoveLaterally(car, target);
    });
  }

  start(skipCountdown = false) {
    if (this.phase !== "ready") return;
    this.phase = skipCountdown ? "racing" : "countdown";
  }

  togglePause() {
    this.braking = this.brakeBlocked = false;
    for (const car of this.cars) car.braking = false;
    if (this.phase === "paused") this.phase = this.pausedPhase;
    else if (
      this.phase === "racing" ||
      this.phase === "countdown" ||
      this.phase === "finishing"
    ) {
      this.pausedPhase = this.phase;
      this.phase = "paused";
    }
  }

  snapshot(): RaceSnapshot | null {
    const phase = this.phase === "paused" ? this.pausedPhase : this.phase;
    if (phase !== "countdown" && phase !== "racing" && phase !== "finishing") return null;
    return {
      version: 1, phase, elapsed: this.elapsed, countdown: this.countdown,
      randomState: this.randomState,
      cars: this.cars.map((car) => ({
        driverId: car.driverId, latchedToId: car.latchedToId, finishTime: car.finishTime,
        ...Object.fromEntries(savedCarFields.map((key) => [key, car[key]])),
        ...Object.fromEntries(savedBrakeFields.map((key) => [key, car[key]])),
      } as RaceSnapshot["cars"][number])),
    };
  }

  // Validate the entire snapshot before changing the simulation. Identity and
  // grid come from the season; only race dynamics are restored from the file.
  restore(value: unknown): boolean {
    if (!value || typeof value !== "object") return false;
    const saved = value as RaceSnapshot;
    if (saved.version !== 1 || !["countdown", "racing", "finishing"].includes(saved.phase) ||
      !Number.isFinite(saved.elapsed) || saved.elapsed < 0 ||
      !Number.isFinite(saved.countdown) || saved.countdown < 0 || saved.countdown > 3 ||
      !Number.isInteger(saved.randomState) || saved.randomState < 0 || saved.randomState > 0xffffffff ||
      !Array.isArray(saved.cars) || saved.cars.length !== this.cars.length) return false;
    const lateralLimit = this.config.roadHalfWidth - this.config.carWidth / 2;
    for (let i = 0; i < saved.cars.length; i++) {
      const car = saved.cars[i];
      if (!car || car.driverId !== this.cars[i].driverId ||
        savedCarFields.some((key) => !Number.isFinite(car[key])) ||
        savedBrakeFields.some((key) => car[key] !== undefined &&
          (!Number.isFinite(car[key]) || car[key]! < 0)) ||
        car.progress < -1000 || car.previousProgress < -1000 || car.speed < 0 || car.speed > 1000 ||
        Math.abs(car.lateral) > lateralLimit + 0.001 || Math.abs(car.targetLateral) > lateralLimit + 0.001 ||
        car.decisionAt < 0 || [car.draftBonus, car.slipstreamBonus, car.pushBonus, car.slingshotBonus, car.slingshotInitialBonus].some((bonus) => bonus < 0 || bonus > 1000) ||
        (car.latchedToId !== null && (!Number.isInteger(car.latchedToId) || car.latchedToId < 0 || car.latchedToId >= this.cars.length || car.latchedToId === i)) ||
        (car.finishTime !== null && (!Number.isFinite(car.finishTime) || car.finishTime <= 0 || car.finishTime > saved.elapsed || car.progress < this.finishDistance))) return false;
    }
    const player = saved.cars[this.player.id];
    if (saved.cars.every((car) => car.finishTime !== null) ||
      (saved.phase === "finishing") !== (player.finishTime !== null) ||
      (saved.phase === "countdown" && (saved.elapsed !== 0 || saved.cars.some((car) => car.finishTime !== null)))) return false;
    saved.cars.forEach((car, i) => {
      for (const key of savedCarFields) this.cars[i][key] = car[key];
      this.cars[i].latchedToId = car.latchedToId;
      this.cars[i].finishTime = car.finishTime;
      this.cars[i].braking = false;
      this.cars[i].aiBrakeUntil = car.aiBrakeUntil ?? 0;
      this.cars[i].aiBrakeDecisionAt = car.aiBrakeDecisionAt ?? saved.elapsed + 8 + i * 0.5;
    });
    this.elapsed = saved.elapsed;
    this.countdown = saved.countdown;
    this.randomState = saved.randomState;
    this.pausedPhase = saved.phase;
    this.phase = "paused";
    this.braking = this.brakeBlocked = this.steeringBlocked = false;
    this.updateDrafts();
    return true;
  }

  private random() {
    this.randomState =
      (Math.imul(1664525, this.randomState) + 1013904223) >>> 0;
    return this.randomState / 4294967296;
  }

  updateDrafts() {
    const { carLength, draftGap, draftAlignment } = this.config;
    const fronts = new Map<number, Car>();
    const rears = new Map<number, Car>();
    for (const car of this.cars) {
      car.frontId = car.rearId = null;
      car.trainSize = 1;
      for (const other of this.cars) {
        if (
          other.id === car.id ||
          Math.abs(other.lateral - car.lateral) > draftAlignment
        )
          continue;
        const gap = other.progress - car.progress;
        if (
          gap >= carLength &&
          gap <= carLength + draftGap &&
          (!fronts.has(car.id) ||
            gap < fronts.get(car.id)!.progress - car.progress)
        )
          fronts.set(car.id, other);
        if (
          -gap >= carLength &&
          -gap <= carLength + draftGap &&
          (!rears.has(car.id) ||
            -gap < car.progress - rears.get(car.id)!.progress)
        )
          rears.set(car.id, other);
      }
    }
    // Reciprocal nearest neighbors form a chain; a car cannot have two followers.
    for (const car of this.cars) {
      const front = fronts.get(car.id);
      if (front && rears.get(front.id)?.id === car.id) {
        car.frontId = front.id;
        front.rearId = car.id;
      }
    }
    const seen = new Set<number>();
    for (const car of this.cars) {
      if (seen.has(car.id)) continue;
      const train: Car[] = [];
      const queue = [car];
      while (queue.length) {
        const member = queue.pop()!;
        if (seen.has(member.id)) continue;
        seen.add(member.id);
        train.push(member);
        for (const id of [member.frontId, member.rearId])
          if (id !== null) queue.push(this.cars[id]);
      }
      for (const member of train) member.trainSize = train.length;
    }
  }

  private chooseLine(car: Car) {
    if (this.wantsAIBrake(car)) {
      const front = this.cars[car.frontId!];
      const limit = this.config.roadHalfWidth - this.config.carWidth / 2 - 0.3;
      car.targetLateral = clamp(front.lateral, -limit, limit);
      return;
    }
    // A ready approach can disappear before the next ordinary line decision.
    // An explicitly disabled decision timer also disables reactive moves.
    if (car.decisionAt === Infinity) return;
    const exit = this.passExit(car);
    if (exit !== null) {
      car.targetLateral = exit;
      car.decisionAt = Math.max(car.decisionAt, this.elapsed + 4);
      return;
    }
    if (this.elapsed < car.decisionAt) return;
    car.decisionAt = this.elapsed + 1.8 + this.random() * 3.4;
    // Only a settled tail car initiates a short drop-back. Cooldowns and the
    // final-distance limit keep this a setup for another approach, not stalling.
    if (car.frontId !== null && car.latchedToId === car.frontId &&
      car.rearId === null && this.canBrake(car) &&
      this.elapsed >= car.aiBrakeDecisionAt && this.finishDistance - car.progress > 1000) {
      car.aiBrakeDecisionAt = this.elapsed + 12 + this.random() * 8;
      if (this.random() < 0.35) {
        car.aiBrakeUntil = this.elapsed + 3.5;
        car.targetLateral = car.lateral;
        return;
      }
    }
    const candidates: number[] = [car.targetLateral, ...RACING_LINES];
    const mateLinked = [car.frontId, car.rearId].some(
      (id) => id !== null && this.cars[id].teamId === car.teamId,
    );
    let best = car.targetLateral;
    let bestScore = -Infinity;
    for (const line of candidates) {
      let score = -Math.abs(line - car.lateral) * 0.45;
      if (Math.abs(line - car.targetLateral) < 0.2) score += 0.75;
      const ahead = this.cars
        .filter(
          (other) =>
            other.id !== car.id &&
            Math.abs(other.lateral - line) < 1 &&
            other.progress > car.progress,
        )
        .sort((a, b) => a.progress - b.progress)[0];
      const behind = this.cars
        .filter(
          (other) =>
            other.id !== car.id &&
            Math.abs(other.lateral - line) < 1 &&
            other.progress < car.progress,
        )
        .sort((a, b) => b.progress - a.progress)[0];
      if (ahead) {
        const gap = ahead.progress - car.progress - this.config.carLength;
        if (gap < 36)
          score +=
            4.5 * (1 - Math.max(0, gap) / 45) +
            Math.min(3, ahead.trainSize * 0.45);
        if (gap < 3 && ahead.speed < car.speed + 0.2) score -= 3.5;
        if (gap < 1) score -= 2;
      }
      if (behind && car.progress - behind.progress < 23) score += 2.3;
      if (ahead?.teamId === car.teamId && ahead.progress - car.progress < 36)
        score += 3.4;
      if (behind?.teamId === car.teamId && car.progress - behind.progress < 25)
        score += 2.6;
      if (mateLinked && Math.abs(line - car.lateral) < 0.2) score += 2;
      if (car.rearId !== null && Math.abs(line - car.lateral) < 0.2) score += 1;
      if (!this.canMoveLaterally(car, line)) score -= 12;
      score += this.random() * 0.8;
      if (score > bestScore) {
        bestScore = score;
        best = line;
      }
    }
    car.targetLateral = best;
  }

  private passExit(car: Car): number | null {
    if (this.slingshot(car).state !== "ready" ||
      Math.abs(car.targetLateral - car.lateral) > 0.2) return null;
    const front = this.cars[car.frontId!];
    const gap = front.progress - car.progress - this.config.carLength;
    const closingSpeed = car.speed - front.speed;
    // The car has to leave the wake before it reaches the latch gap.
    if ((gap - this.config.latchGap) / closingSpeed <=
      this.config.draftAlignment / AI_STEER_SPEED) return null;

    let best: number | null = null;
    let bestClearance = -Infinity;
    for (const line of RACING_LINES) {
      const shift = Math.abs(line - car.lateral);
      if (shift < this.config.carWidth + 0.2 || shift > 3.5 ||
        !this.canMoveLaterally(car, line)) continue;
      const moveTime = shift / AI_STEER_SPEED;
      let clearance = Infinity;
      for (const other of this.cars) {
        if (other.id === car.id ||
          Math.abs(other.lateral - line) >= this.config.carWidth + 0.16) continue;
        const projectedGap = other.progress - car.progress +
          (other.speed - car.speed) * moveTime;
        clearance = Math.min(clearance,
          Math.abs(projectedGap) - this.config.carLength - this.config.contactGap);
      }
      if (clearance < 2) continue;
      if (clearance > bestClearance) {
        best = line;
        bestClearance = clearance;
      }
    }
    return best;
  }

  private canMoveLaterally(car: Car, target: number) {
    const separation = this.config.carWidth + 0.16;
    return !this.cars.some(
      (other) =>
        other.id !== car.id &&
        Math.abs(other.progress - car.progress) <
          this.config.carLength + this.config.contactGap &&
        Math.min(car.lateral, target) < other.lateral + separation &&
        Math.max(car.lateral, target) > other.lateral - separation,
    );
  }

  private moveLaterally(car: Car, change: number) {
    if (Math.abs(change) < 1e-9) return;
    const limit = this.config.roadHalfWidth - this.config.carWidth / 2 - 0.3;
    let next = clamp(car.lateral + change, -limit, limit);
    const separation = this.config.carWidth + 0.16;
    for (const other of this.cars) {
      if (
        other.id === car.id ||
        Math.abs(other.progress - car.progress) >=
          this.config.carLength + this.config.contactGap - 1e-6
      )
        continue;
      if (car.lateral < other.lateral)
        next = Math.min(next, other.lateral - separation);
      else next = Math.max(next, other.lateral + separation);
    }
    next = clamp(next, -limit, limit);
    if (car.player && Math.abs(next - (car.lateral + change)) > 0.001)
      this.steeringBlocked = true;
    car.lateral = next;
  }

  step(dt: number, steering = 0, brake = false) {
    this.braking = this.brakeBlocked = false;
    for (const car of this.cars) car.braking = false;
    if (this.phase === "countdown") {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown <= 1e-8) this.phase = "racing";
      return;
    }
    if (this.phase !== "racing" && this.phase !== "finishing") return;
    this.steeringBlocked = false;
    // Capture the approach before steering breaks a wake. Only actual closing
    // speed can be carried out; a settled follower has no passing reserve.
    const approaches = this.cars.map((car) => {
      const front = car.frontId === null ? null : this.cars[car.frontId];
      return {
        lateral: car.lateral,
        eligible: front !== null && car.latchedToId === null &&
          front.progress - car.progress - this.config.carLength > this.config.latchGap &&
          car.speed - front.speed >= this.config.slingshotMinClosingSpeed &&
          car.draftBonus + car.slipstreamBonus > 0,
      };
    });
    for (const car of this.cars) {
      car.previousProgress = car.progress;
      if (!car.player) this.chooseLine(car);
      const move = car.player
        ? (car.finishTime === null ? clamp(steering, -1, 1) : 0) *
          this.config.steerSpeed *
          dt
        : clamp(car.targetLateral - car.lateral,
          -AI_STEER_SPEED * dt, AI_STEER_SPEED * dt);
      this.moveLaterally(car, move);
    }
    this.updateDrafts();
    // Evaluate every request from the same positions, after lateral movement.
    // A held brake takes effect only once the car is physically clear behind.
    for (const car of this.cars) {
      const requested = car.player ? brake : this.wantsAIBrake(car);
      car.braking = requested && this.canBrake(car);
    }
    this.braking = this.player.braking;
    this.brakeBlocked = brake && this.player.finishTime === null && this.brakeBlocker() !== null;
    const targets: number[] = [];
    for (const car of this.cars) {
      const front = car.frontId === null ? null : this.cars[car.frontId];
      const gap = front ? front.progress - car.progress - this.config.carLength : Infinity;
      if (car.latchedToId !== front?.id || gap > this.config.latchResetGap)
        car.latchedToId = null;
      if (front && gap <= this.config.latchGap) {
        if (car.latchedToId !== front.id) car.speed = Math.min(car.speed, front.speed);
        car.latchedToId = front.id;
      }
      if (car.latchedToId !== null || car.braking) {
        car.slingshotBonus = car.slingshotInitialBonus = 0;
        car.slipstreamBonus = 0;
      } else if (approaches[car.id].eligible && front === null &&
        Math.abs(car.lateral - approaches[car.id].lateral) > 1e-8) {
        car.slingshotBonus = car.slingshotInitialBonus = Math.max(0, car.speed - this.config.baseSpeed);
      }
      // Air resistance returns as soon as the wake is left. Only an earned
      // approach gets the slower release; train pace is never banked as boost.
      const benefit = front ? trainSpeedBonus(car.trainSize, this.config) : 0;
      car.draftBonus = front
        ? car.draftBonus + (benefit - car.draftBonus) * (1 - Math.exp(-dt / 0.65))
        : 0;
      const wakeStrength = front
        ? 1 -
          0.4 *
            clamp(
              (front.progress - car.progress - this.config.carLength) /
                this.config.draftGap,
              0,
              1,
            )
        : 0;
      const followingBenefit = car.latchedToId === null
        ? this.config.maxSlipstreamBonus * wakeStrength : 0;
      car.slipstreamBonus = front
        ? car.slipstreamBonus + (followingBenefit - car.slipstreamBonus) * (1 - Math.exp(-dt / 0.5))
        : 0;
      if (front) car.slingshotBonus = car.slingshotInitialBonus = 0;
      else car.slingshotBonus *= Math.exp(-dt / this.config.slipstreamReleaseSeconds);
      if (car.slingshotBonus < 0.01) car.slingshotBonus = car.slingshotInitialBonus = 0;
      car.pushBonus = 0;
      targets[car.id] = this.config.baseSpeed + car.draftBonus + car.slipstreamBonus + car.slingshotBonus;
    }
    // A close follower transfers its available propulsion through the train.
    // Average across the cars being pushed, so the exposed leader receives no
    // independent aerodynamic bonus and distant followers cannot push it.
    const coupled = new Set<number>();
    for (const car of this.cars) {
      if (coupled.has(car.id)) continue;
      const group: Car[] = [];
      const queue = [car];
      while (queue.length) {
        const member = queue.pop()!;
        if (coupled.has(member.id)) continue;
        coupled.add(member.id);
        group.push(member);
        for (const id of [member.frontId, member.rearId]) {
          if (id === null) continue;
          const other = this.cars[id];
          if (Math.abs(other.progress - member.progress) - this.config.carLength <= this.config.pushGap &&
            !member.braking && !other.braking) queue.push(other);
        }
      }
      if (group.length < 2) continue;
      const target = group.reduce((sum, member) => sum + targets[member.id], 0) / group.length;
      for (const member of group) {
        member.pushBonus = Math.max(0, target - targets[member.id]);
        targets[member.id] = target;
      }
    }
    for (const car of this.cars) {
      const desired = targets[car.id];
      // Braking overrides automatic acceleration, including a growing draft benefit.
      car.speed =
        car.braking
          ? Math.max(0, car.speed - this.config.brakeDeceleration * dt)
          : approach(
              car.speed,
              desired,
              (desired > car.speed ? 3.6 : 2.7) * dt,
            );
      car.progress += car.speed * dt;
    }
    // Resolve front to back so a blocked train never overlaps or tunnels.
    const ordered = [...this.cars].sort(
      (a, b) => b.progress - a.progress || a.id - b.id,
    );
    for (let i = 1; i < ordered.length; i++) {
      const car = ordered[i];
      for (let j = 0; j < i; j++) {
        const front = ordered[j];
        if (
          Math.abs(front.lateral - car.lateral) >=
          this.config.carWidth + 0.06
        )
          continue;
        const maximum =
          front.progress - this.config.carLength - this.config.contactGap;
        if (car.progress > maximum) {
          car.progress = maximum;
          car.speed = Math.min(car.speed, front.speed);
          car.latchedToId = front.id;
          car.slipstreamBonus = car.slingshotBonus = car.slingshotInitialBonus = 0;
        }
      }
    }
    for (const car of this.cars) {
      if (car.finishTime === null && car.progress >= this.finishDistance) {
        const movement = car.progress - car.previousProgress;
        car.finishTime =
          this.elapsed +
          dt *
            clamp(
              (this.finishDistance - car.previousProgress) / movement,
              0,
              1,
            );
      }
    }
    this.elapsed += dt;
    for (const car of this.cars) if (car.finishTime !== null) car.braking = false;
    this.braking = this.player.braking;
    if (this.player.finishTime !== null) this.brakeBlocked = false;
    this.updateDrafts();
    if (this.cars.every((car) => car.finishTime !== null))
      this.phase = "finished";
    else if (this.player.finishTime !== null) this.phase = "finishing";
  }
}
