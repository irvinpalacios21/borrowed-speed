import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, FIXED_STEP } from "../src/game/config.ts";
import { RaceSimulation, trainSpeedBonus } from "../src/game/simulation.ts";

function train(count: number) {
  const sim = new RaceSimulation({ carCount: count, miles: 10 });
  sim.cars.forEach((car, index) => {
    car.progress = (count - index - 1) * 8;
    car.lateral = car.targetLateral = 0;
    car.decisionAt = Infinity;
  });
  sim.updateDrafts();
  sim.start(true);
  return sim;
}
function advance(sim: RaceSimulation, seconds: number, steering = 0) {
  for (let i = 0; i < Math.round(seconds / FIXED_STEP); i++)
    sim.step(FIXED_STEP, steering);
}

function brakingTrain(count: number, playerSlot: number, seed = 42) {
  const sim = new RaceSimulation({ carCount: count, miles: 10 }, seed);
  const others = sim.cars.filter((car) => !car.player);
  const order = [...others.slice(0, playerSlot), sim.player, ...others.slice(playerSlot)];
  order.forEach((car, index) => {
    car.progress = 200 - index * (sim.config.carLength + sim.config.contactGap);
    car.lateral = car.targetLateral = 0;
    car.decisionAt = Infinity;
  });
  sim.updateDrafts();
  sim.start(true);
  return { sim, order };
}

for (const slot of [0, 4]) {
  test(`a brake request cannot slow a closely followed ${slot === 0 ? "leader" : "middle car"} in a ten-car train`, () => {
    const { sim: braking } = brakingTrain(10, slot);
    const { sim: control } = brakingTrain(10, slot);
    advance(braking, 15);
    advance(control, 15);
    assert.equal(braking.canBrake(), false);
    for (let tick = 0; tick < 600; tick++) {
      braking.step(FIXED_STEP, 0, true);
      control.step(FIXED_STEP);
      assert.equal(braking.braking, false);
      assert.equal(braking.brakeBlocked, true);
      assert.deepEqual(braking.cars, control.cars);
    }
  });
}

test("the tail can brake without slowing the train ahead, then rebuild closing speed", () => {
  const { sim, order } = brakingTrain(5, 4);
  advance(sim, 15);
  assert.ok(sim.canBrake());
  const leaderSpeed = order[0].speed;
  for (let tick = 0; tick < 360; tick++) {
    sim.step(FIXED_STEP, 0, true);
    assert.equal(sim.braking, true);
  }
  assert.ok(order[0].speed > leaderSpeed - 2);
  assert.ok(sim.player.speed < order[3].speed - 5);
  assert.equal(sim.player.latchedToId, null);
  let rebuilt = false;
  for (let tick = 0; tick < 2400; tick++) {
    sim.step(FIXED_STEP);
    if (sim.slingshot().state === "ready") { rebuilt = true; break; }
  }
  assert.ok(rebuilt);
});

test("braking permission uses physical proximity, not a remote or laterally clear draft link", () => {
  const { sim, order } = brakingTrain(2, 0);
  const follower = order[1];
  follower.progress = sim.player.progress - sim.config.carLength - sim.config.brakeFollowerGap - 0.01;
  sim.updateDrafts();
  assert.equal(sim.player.rearId, follower.id);
  assert.ok(sim.canBrake(), "A distant tow must not lock the brake");
  follower.progress += 0.02;
  follower.lateral = 1.3;
  sim.updateDrafts();
  assert.equal(sim.player.rearId, null);
  assert.equal(sim.canBrake(), false, "An offset close follower still occupies the braking path");
  follower.lateral = sim.config.carWidth + 0.17;
  assert.ok(sim.canBrake(), "The car is clear in another racing line");
  follower.lateral = 0;
  follower.progress = sim.player.progress + 10;
  assert.ok(sim.canBrake(), "A car ahead does not block the brake");
});

test("a held brake becomes available after pulling clear and is blocked again by a new follower", () => {
  const { sim, order } = brakingTrain(3, 1);
  sim.step(FIXED_STEP, 0, true);
  assert.ok(sim.brakeBlocked);
  for (let tick = 0; tick < 120; tick++) sim.step(FIXED_STEP, 1, true);
  assert.ok(sim.braking);
  assert.equal(sim.brakeBlocked, false);
  const follower = order[2];
  follower.progress = sim.player.progress - sim.config.carLength - 4;
  follower.lateral = follower.targetLateral = sim.player.lateral;
  sim.updateDrafts();
  sim.step(FIXED_STEP, 0, true);
  assert.equal(sim.braking, false);
  assert.ok(sim.brakeBlocked);
  sim.togglePause();
  assert.equal(sim.brakeBlocked, false);
  assert.ok(sim.cars.every((car) => !car.braking));
});

test("an AI tail brakes briefly, releases, rebuilds a run, and preserves its maneuver across a checkpoint", () => {
  const { sim, order } = brakingTrain(3, 0);
  advance(sim, 15);
  const tail = order[2];
  tail.decisionAt = sim.elapsed;
  sim.step(FIXED_STEP);
  assert.ok(tail.braking, "A settled AI tail should sometimes choose to drop back");
  assert.equal(order[0].braking, false);
  assert.equal(order[1].braking, false);
  const startingSpeed = tail.speed;
  advance(sim, 1);
  assert.ok(Math.abs(tail.speed - (startingSpeed - sim.config.brakeDeceleration)) < 1e-7);
  assert.ok(sim.canBrake(tail));
  sim.cars.forEach((car) => { car.decisionAt = 1e9; });
  const restored = new RaceSimulation({ carCount: 3, miles: 10 }, 42);
  assert.ok(restored.restore(JSON.parse(JSON.stringify(sim.snapshot()))));
  assert.ok(restored.cars.every((car) => !car.braking));
  restored.togglePause();
  let released = false, rebuilt = false;
  for (let tick = 0; tick < 2400; tick++) {
    sim.step(FIXED_STEP);
    restored.step(FIXED_STEP);
    assert.deepEqual(restored.cars, sim.cars);
    released ||= !tail.braking;
    if (sim.slingshot(tail).state === "ready") { rebuilt = true; break; }
  }
  assert.ok(released);
  assert.ok(rebuilt, "The short brake maneuver must lead back to a genuine approach");
});

test("an AI cancels braking immediately when another car closes behind", () => {
  const { sim, order } = brakingTrain(3, 0);
  advance(sim, 15);
  const tail = order[2];
  tail.decisionAt = sim.elapsed;
  sim.step(FIXED_STEP);
  assert.ok(tail.braking);
  sim.player.progress = tail.progress - sim.config.carLength - 4;
  sim.player.lateral = tail.lateral;
  sim.updateDrafts();
  sim.step(FIXED_STEP);
  assert.equal(tail.braking, false);
  assert.equal(tail.aiBrakeUntil, 0);
  assert.equal(sim.canBrake(tail), false);
});

test("AI braking does not start during a final-kilometer run to the finish", () => {
  const { sim, order } = brakingTrain(3, 0);
  advance(sim, 15);
  const tail = order[2];
  const shift = sim.finishDistance - 900 - tail.progress;
  sim.cars.forEach((car) => { car.progress += shift; });
  tail.decisionAt = sim.elapsed;
  sim.updateDrafts();
  sim.step(FIXED_STEP);
  assert.equal(tail.braking, false);
  assert.equal(tail.aiBrakeUntil, 0);
});

test("a blocked brake request does not consume earned approach momentum", () => {
  const { sim: blocked } = brakingTrain(2, 0);
  const { sim: control } = brakingTrain(2, 0);
  for (const sim of [blocked, control]) {
    sim.player.slingshotBonus = sim.player.slingshotInitialBonus = 8;
    sim.player.speed = sim.config.baseSpeed + 8;
  }
  blocked.step(FIXED_STEP, 0, true);
  control.step(FIXED_STEP);
  assert.ok(blocked.brakeBlocked);
  assert.ok(blocked.player.slingshotBonus > 7.9);
  assert.deepEqual(blocked.cars, control.cars);
});

function approachTrain(count: number, gap = 28) {
  const sim = new RaceSimulation({ carCount: count, miles: 10 });
  sim.cars.filter((car) => !car.player).forEach((car, index) => {
    car.progress = (count - 2 - index) * 5.8 + gap + sim.config.carLength;
  });
  sim.player.progress = 0;
  sim.cars.forEach((car) => {
    car.lateral = car.targetLateral = 0;
    car.decisionAt = Infinity;
  });
  sim.updateDrafts();
  sim.start(true);
  return sim;
}

test("an exposed leader gets no immediate boost from a distant draft connection", () => {
  const sim = approachTrain(2);
  const leader = sim.cars[sim.player.frontId!];
  advance(sim, 1.5);
  assert.equal(leader.rearId, sim.player.id);
  assert.equal(leader.speed, sim.config.baseSpeed);
  assert.equal(leader.draftBonus, 0);
  assert.equal(leader.slipstreamBonus, 0);
  assert.equal(leader.pushBonus, 0);
  assert.ok(sim.player.speed > leader.speed + 4);
  advance(sim, 10);
  assert.ok(leader.pushBonus > 1 && leader.speed > sim.config.baseSpeed + 1);
  assert.equal(leader.draftBonus, 0);
  assert.equal(leader.slipstreamBonus, 0);
});

for (const count of [2, 5, 10, 16]) {
  test(`an approach to a ${count}-car field has a usable window and enough momentum to complete a pass`, () => {
    const sim = approachTrain(count);
    const target = sim.cars[sim.player.frontId!];
    for (let tick = 0; tick < 1800 && sim.slingshot().state !== "ready"; tick++) sim.step(FIXED_STEP);
    assert.equal(sim.slingshot().state, "ready");
    const waiting = approachTrain(count);
    let readyTicks = 0;
    for (let tick = 0; tick < 1800; tick++) {
      waiting.step(FIXED_STEP);
      if (waiting.slingshot().state === "ready") readyTicks++;
      if (waiting.slingshot().state === "latched") break;
    }
    assert.ok(readyTicks * FIXED_STEP >= 0.6, "The cue must leave time to react");
    advance(sim, 0.2);
    for (let tick = 0; tick < 120; tick++) {
      const previousSpeed = sim.player.speed;
      sim.step(FIXED_STEP, sim.player.lateral < 3.2 ? 1 : 0);
      assert.ok(sim.player.speed <= previousSpeed + 3.6 * FIXED_STEP + 1e-8);
    }
    assert.equal(sim.slingshot().state, "carrying");
    assert.equal(sim.player.draftBonus, 0);
    assert.equal(sim.player.slipstreamBonus, 0);
    let passed = false;
    for (let tick = 0; tick < 840; tick++) {
      sim.step(FIXED_STEP);
      if (sim.player.progress > target.progress + sim.config.carLength + sim.config.contactGap) {
        passed = true;
        break;
      }
    }
    assert.ok(passed, "The approaching car must clear the other car's whole body");
  });
}

for (const count of [2, 5, 16]) {
  test(`a settled second-place car in a ${count}-car train cannot bank a slingshot`, () => {
    const sim = approachTrain(count);
    const others = sim.cars.filter((car) => !car.player);
    others[0].progress = (count - 1) * 5.65;
    sim.player.progress = others[0].progress - 5.65;
    others.slice(1).forEach((car, index) => { car.progress = others[0].progress - (index + 2) * 5.65; });
    sim.updateDrafts();
    advance(sim, 20);
    assert.equal(sim.slingshot().state, "latched");
    assert.equal(sim.player.slipstreamBonus, 0);
    assert.equal(sim.player.slingshotBonus, 0);
    for (let tick = 0; tick < 1440; tick++) {
      sim.step(FIXED_STEP, sim.player.lateral < 3.2 ? 1 : 0);
      assert.equal(sim.player.slingshotBonus, 0);
      assert.ok(sim.player.progress < others[0].progress);
    }
  });
}

test("waiting until latching spends closing speed and removes the passing cue", () => {
  const sim = approachTrain(2);
  let wasReady = false;
  for (let tick = 0; tick < 1800 && sim.player.latchedToId === null; tick++) {
    sim.step(FIXED_STEP);
    wasReady ||= sim.slingshot().state === "ready";
  }
  assert.ok(wasReady);
  assert.equal(sim.slingshot().state, "latched");
  assert.equal(sim.player.slingshotBonus, 0);
  assert.equal(sim.player.slipstreamBonus, 0);
  const front = sim.cars[sim.player.frontId!];
  assert.ok(sim.player.speed <= front.speed + 0.04);
  advance(sim, 1, 1);
  assert.equal(sim.player.slingshotBonus, 0);
  assert.equal(sim.slingshot().state, "idle");
});

test("braking back from a settled train allows a fresh approach, and braking spends carried momentum", () => {
  const sim = train(2);
  advance(sim, 10);
  assert.equal(sim.slingshot().state, "latched");
  for (let tick = 0; tick < 360; tick++) sim.step(FIXED_STEP, 0, true);
  assert.equal(sim.player.latchedToId, null);
  for (let tick = 0; tick < 1800 && sim.slingshot().state !== "ready"; tick++) sim.step(FIXED_STEP);
  assert.equal(sim.slingshot().state, "ready");
  advance(sim, 0.8, 1);
  assert.equal(sim.slingshot().state, "carrying");
  const reserve = sim.player.slingshotBonus;
  sim.togglePause();
  advance(sim, 3);
  assert.equal(sim.player.slingshotBonus, reserve);
  sim.togglePause();
  advance(sim, 1);
  assert.ok(sim.player.slingshotBonus < reserve);
  sim.step(FIXED_STEP, 0, true);
  assert.equal(sim.player.slingshotBonus, 0);
});

test("the passing cue recognizes occupied sides and track boundaries", () => {
  const sim = approachTrain(4);
  const others = sim.cars.filter((car) => !car.player);
  sim.player.speed = sim.config.baseSpeed + 7;
  sim.player.draftBonus = 2;
  others[0].progress = 15;
  others[1].progress = others[2].progress = 0;
  others[1].lateral = -2.3;
  others[2].lateral = 2.3;
  sim.updateDrafts();
  assert.equal(sim.slingshot().state, "blocked");
  others[1].progress = -100;
  sim.updateDrafts();
  assert.equal(sim.slingshot().state, "ready");
  sim.player.lateral = -5.95;
  others[0].lateral = -5.95;
  others[2].lateral = -3.65;
  sim.updateDrafts();
  assert.equal(sim.slingshot().state, "blocked");
});

test("a checkpoint preserves earned momentum and latching without granting a fresh reserve", () => {
  for (const carrying of [false, true]) {
    const original = approachTrain(5);
    original.cars.forEach((car) => { car.decisionAt = 1e9; });
    if (carrying) {
      for (let tick = 0; tick < 1800 && original.slingshot().state !== "ready"; tick++) original.step(FIXED_STEP);
      advance(original, 1, 1);
      assert.equal(original.slingshot().state, "carrying");
    } else {
      advance(original, 15);
      assert.equal(original.slingshot().state, "latched");
    }
    const restored = new RaceSimulation({ carCount: 5, miles: 10 });
    assert.ok(restored.restore(JSON.parse(JSON.stringify(original.snapshot()))));
    assert.equal(restored.phase, "paused");
    restored.togglePause();
    assert.deepEqual(restored.cars, original.cars);
    advance(original, 1);
    advance(restored, 1);
    assert.deepEqual(restored.cars, original.cars);
    assert.deepEqual(restored.slingshot(), original.slingshot());
  }
});

test("a leader has no slipstream bonus, but close followers push longer trains faster", () => {
  const pair = train(2);
  const group = train(5);
  advance(pair, 8);
  advance(group, 8);
  assert.equal(pair.cars[0].frontId, null);
  assert.equal(pair.cars[0].rearId, 1);
  assert.equal(pair.cars[0].draftBonus, 0);
  assert.equal(pair.cars[0].slipstreamBonus, 0);
  assert.ok(pair.cars[0].pushBonus > 1);
  assert.ok(pair.cars[0].speed > DEFAULT_CONFIG.baseSpeed + 1);
  assert.ok(group.cars[0].speed > pair.cars[0].speed + 6);
  assert.ok(group.player.speed >= group.cars[0].speed);
});

test("drafting requires both alignment and the configured gap", () => {
  const sim = train(2);
  assert.equal(sim.player.trainSize, 2);
  sim.player.lateral = 1.1;
  sim.updateDrafts();
  assert.equal(sim.player.trainSize, 1);
  sim.player.lateral = 0;
  sim.cars[0].progress = sim.config.carLength + sim.config.draftGap + 0.1;
  sim.updateDrafts();
  assert.equal(sim.player.frontId, null);
});

test("followers let the leader of a longer train pass a shorter train", () => {
  const sim = new RaceSimulation({ carCount: 5, miles: 10 });
  const starts = [20, 12, 6, -2, 14];
  sim.cars.forEach((car, i) => {
    car.progress = starts[i];
    car.lateral = car.targetLateral = i < 2 ? -1.6 : 1.6;
    car.decisionAt = Infinity;
  });
  sim.updateDrafts();
  sim.start(true);
  assert.equal(sim.player.frontId, null);
  assert.notEqual(sim.player.rearId, null);
  assert.equal(sim.player.trainSize, 3);
  advance(sim, 10);
  assert.ok(sim.player.progress > sim.cars[0].progress);
  assert.equal(sim.position, 1);
});

test("splitting a train removes links and lets the speed benefit decay", () => {
  const sim = train(3);
  advance(sim, 8);
  const bonus = sim.player.draftBonus;
  sim.player.lateral = 4.8;
  sim.updateDrafts();
  assert.equal(sim.player.trainSize, 1);
  assert.equal(sim.player.frontId, null);
  advance(sim, 8);
  assert.ok(sim.player.draftBonus < bonus * 0.05);
  assert.ok(sim.player.speed < sim.cars[0].speed);
});

test("a car cannot steer through a car alongside it", () => {
  const sim = new RaceSimulation({ carCount: 2, miles: 10 });
  sim.cars.forEach((car) => {
    car.progress = 0;
    car.decisionAt = Infinity;
  });
  sim.start(true);
  advance(sim, 3, -1);
  assert.ok(
    sim.player.lateral - sim.cars[0].lateral >= sim.config.carWidth + 0.15,
  );
  assert.equal(sim.steeringBlocked, true);
});

test("a faster following car cannot overlap or travel through the leading car", () => {
  const sim = train(2);
  sim.cars[0].progress = 6;
  sim.cars[0].speed = 65;
  sim.player.speed = 95;
  for (let i = 0; i < 1200; i++) {
    sim.step(FIXED_STEP);
    assert.ok(
      sim.cars[0].progress - sim.player.progress >=
        sim.config.carLength + sim.config.contactGap - 1e-8,
    );
  }
});

test("finish order uses crossing time even when a later finisher travels farther within the step", () => {
  const sim = new RaceSimulation({ carCount: 2, miles: 0.1 });
  sim.cars[0].progress = sim.finishDistance - 0.2;
  sim.cars[0].speed = 96;
  sim.player.progress = sim.finishDistance - 0.1;
  sim.player.speed = 50;
  sim.cars.forEach((car) => {
    car.decisionAt = Infinity;
  });
  sim.start(true);
  sim.step(FIXED_STEP);
  assert.equal(sim.phase, "finished");
  assert.ok(sim.cars[0].progress > sim.player.progress);
  assert.ok(sim.player.finishTime! < sim.cars[0].finishTime!);
  assert.equal(sim.position, 1);
});

test("pause freezes countdown and race time, then resumes the correct phase", () => {
  const sim = new RaceSimulation();
  sim.start();
  advance(sim, 1);
  sim.togglePause();
  const remaining = sim.countdown;
  advance(sim, 10);
  assert.equal(sim.countdown, remaining);
  assert.equal(sim.elapsed, 0);
  sim.togglePause();
  advance(sim, 2.1);
  assert.equal(sim.phase, "racing");
  sim.togglePause();
  const elapsed = sim.elapsed;
  advance(sim, 5);
  assert.equal(sim.elapsed, elapsed);
  sim.togglePause();
  advance(sim, 1);
  assert.ok(sim.elapsed > elapsed + 0.99);
});

test("a full sixteen-driver race finishes with bounded speeds and no overlapping bodies", () => {
  const sim = new RaceSimulation();
  sim.start(true);
  const trainSizes = new Set<number>();
  for (let step = 0; step < 24000 && sim.phase !== "finished"; step++) {
    const steering =
      step % 2400 < 100 ? 1 : step % 2400 > 1300 && step % 2400 < 1400 ? -1 : 0;
    sim.step(FIXED_STEP, steering);
    if (step % 60 === 0) {
      for (const car of sim.cars) {
        trainSizes.add(car.trainSize);
        assert.ok(
          car.speed > 0 &&
            car.speed <=
              sim.config.baseSpeed +
                sim.config.maxDraftBonus +
                sim.config.maxSlipstreamBonus +
                1e-7,
        );
        assert.ok(
          Math.abs(car.lateral) <=
            sim.config.roadHalfWidth - sim.config.carWidth / 2,
        );
        for (const other of sim.cars) {
          if (other.id === car.id) continue;
          assert.ok(
            Math.abs(car.progress - other.progress) >=
              sim.config.carLength - 1e-6 ||
              Math.abs(car.lateral - other.lateral) >=
                sim.config.carWidth - 1e-6,
            `Cars ${car.id} and ${other.id} overlap`,
          );
        }
      }
    }
  }
  assert.equal(sim.phase, "finished");
  assert.equal(sim.cars.length, 16);
  assert.ok(sim.player.finishTime! > 120 && sim.player.finishTime! < 175);
  assert.ok(
    trainSizes.size > 2,
    "Opponent decisions should produce different train sizes.",
  );
});

test("a following car gains closing speed from the slipstream", () => {
  const sim = train(2);
  sim.cars[0].progress = 18;
  advance(sim, 1);
  assert.ok(sim.player.speed > sim.cars[0].speed + 0.5);
  assert.ok(sim.cars[0].progress - sim.player.progress < 17);
  assert.ok(sim.player.slipstreamBonus > 1);
  assert.equal(sim.cars[0].slipstreamBonus, 0);
});

test("a timed pullout carries earned approach speed into a pass without a manual boost", () => {
  const sim = train(2);
  sim.cars[0].progress = 18;
  for (
    let i = 0;
    i < 1200 && sim.slingshot().state !== "ready";
    i++
  )
    sim.step(FIXED_STEP);
  assert.equal(sim.slingshot().state, "ready");
  const exitSpeed = sim.player.speed;
  advance(sim, 0.9, 1);
  assert.equal(sim.player.frontId, null);
  assert.equal(sim.player.slipstreamBonus, 0);
  assert.equal(sim.player.draftBonus, 0);
  assert.ok(sim.player.slingshotBonus > 0);
  assert.ok(sim.player.speed <= exitSpeed + 1.1, "Pulling out must not grant a speed jump");
  advance(sim, 5);
  assert.ok(
    sim.player.progress > sim.cars[0].progress,
    "Momentum should make a timed slingshot pass possible.",
  );
});

test("a race waits for the complete field after the player finishes", () => {
  const sim = new RaceSimulation({ carCount: 2, miles: 0.01 });
  sim.player.progress = sim.finishDistance - 0.1;
  sim.cars[0].progress = 0;
  sim.cars.forEach((car) => {
    car.decisionAt = Infinity;
  });
  sim.start(true);
  sim.step(FIXED_STEP);
  assert.equal(sim.phase, "finishing");
  const time = sim.player.finishTime;
  advance(sim, 1);
  assert.equal(sim.phase, "finished");
  assert.equal(sim.player.finishTime, time);
  assert.ok(sim.cars.every((car) => car.finishTime !== null));
});

test("the same seed and steering sequence reproduce the same race", () => {
  const a = new RaceSimulation({}, 42);
  const b = new RaceSimulation({}, 42);
  a.start(true);
  b.start(true);
  for (let i = 0; i < 3600; i++) {
    const steering = i < 150 ? 1 : i > 1200 && i < 1400 ? -1 : 0;
    a.step(FIXED_STEP, steering);
    b.step(FIXED_STEP, steering);
  }
  assert.deepEqual(a.cars, b.cars);
});

test("every additional car in a train increases the available tow within the speed limit", () => {
  let previous = -1;
  for (let count = 1; count <= 16; count++) {
    const bonus = trainSpeedBonus(count, DEFAULT_CONFIG);
    assert.ok(bonus > previous && bonus <= DEFAULT_CONFIG.maxDraftBonus);
    previous = bonus;
  }
});
test("a driver prefers a nearby teammate's tow when both lines are useful", () => {
  function setup(teammate: boolean) {
    const sim = new RaceSimulation({}, 42);
    sim.cars.forEach((car, i) => {
      car.progress = -100 - i * 50;
      car.decisionAt = Infinity;
    });
    const car = sim.cars[0],
      mate = sim.cars[1],
      rival = sim.cars[4];
    car.progress = 0;
    car.lateral = car.targetLateral = -1.6;
    car.decisionAt = 0;
    mate.progress = 10;
    mate.lateral = mate.targetLateral = 1.6;
    rival.progress = 10;
    rival.lateral = rival.targetLateral = -1.6;
    if (!teammate) mate.teamId = "copperline";
    sim.updateDrafts();
    sim.start(true);
    sim.step(FIXED_STEP);
    return car.targetLateral;
  }
  assert.equal(setup(true), 1.6);
  assert.equal(setup(false), -1.6);
});
function readyAIPass(blockers: { lateral: number; gap: number }[] = []) {
  const sim = new RaceSimulation({ carCount: Math.max(2, blockers.length + 2) }, 42);
  const follower = sim.cars[0];
  const front = sim.player;
  sim.cars.forEach((car) => {
    car.progress = -200;
    car.lateral = car.targetLateral = 4.8;
    car.decisionAt = Infinity;
  });
  follower.progress = 100;
  follower.lateral = follower.targetLateral = -1.6;
  follower.speed = sim.config.baseSpeed + 8;
  follower.draftBonus = 2;
  follower.slipstreamBonus = 6;
  follower.decisionAt = 5;
  front.progress = 100 + sim.config.carLength + 15;
  front.lateral = front.targetLateral = -1.6;
  blockers.forEach((blocker, index) => {
    const car = sim.cars[index + 1];
    car.progress = follower.progress + blocker.gap;
    car.lateral = car.targetLateral = blocker.lateral;
  });
  sim.updateDrafts();
  sim.start(true);
  return { sim, follower };
}

test("an AI leaves a ready wake before its normal decision timer", () => {
  const { sim, follower } = readyAIPass();
  assert.equal(sim.slingshot(follower).state, "ready");
  sim.step(FIXED_STEP);
  assert.ok(Math.abs(follower.targetLateral - (-1.6)) > 2);
  assert.ok(sim.elapsed < 5);
  advance(sim, 0.8);
  assert.equal(sim.slingshot(follower).state, "carrying");
  advance(sim, 5);
  assert.ok(follower.progress > sim.player.progress,
    "The reactive exit should turn the earned run into a pass");
});

test("an AI chooses the exit with space at the time it arrives", () => {
  const { sim, follower } = readyAIPass([{ lateral: -4.8, gap: 12 }]);
  assert.equal(sim.slingshot(follower).state, "ready");
  sim.step(FIXED_STEP);
  assert.equal(follower.targetLateral, 1.6);
});

test("an AI keeps its wake when both exits are occupied", () => {
  const { sim, follower } = readyAIPass([
    { lateral: -4.8, gap: 0 },
    { lateral: 1.6, gap: 0 },
  ]);
  assert.equal(sim.slingshot(follower).state, "blocked");
  sim.step(FIXED_STEP);
  assert.equal(follower.targetLateral, -1.6);
});

test("team affiliation gives no extra physical speed bonus", () => {
  const a = train(3),
    b = train(3);
  b.cars.forEach((car) => {
    car.teamId = "same";
  });
  advance(a, 10);
  advance(b, 10);
  assert.deepEqual(
    a.cars.map((car) => [car.progress, car.speed]),
    b.cars.map((car) => [car.progress, car.speed]),
  );
});
test("race settings change scenery without changing physics or opponent decisions", () => {
  const coastal = new RaceSimulation({}, 42, { setting: "coastal" });
  const night = new RaceSimulation({}, 42, { setting: "night" });
  coastal.start(true);
  night.start(true);
  advance(coastal, 20);
  advance(night, 20);
  assert.deepEqual(coastal.cars, night.cars);
});

test("braking is gradual, does not steer, and releasing resumes automatic acceleration", () => {
  const sim = new RaceSimulation({ carCount: 2, miles: 10 });
  sim.cars.forEach((car) => {
    car.progress = 0;
    car.decisionAt = Infinity;
  });
  sim.start(true);
  const lateral = sim.player.lateral;
  for (let tick = 0; tick < 240; tick++) {
    const previous = sim.player.speed;
    sim.step(FIXED_STEP, 0, true);
    assert.ok(previous > sim.player.speed);
    assert.ok(
      previous - sim.player.speed <=
        sim.config.brakeDeceleration * FIXED_STEP + 1e-9,
    );
  }
  assert.ok(
    Math.abs(
      sim.player.speed -
        (sim.config.baseSpeed - 2 * sim.config.brakeDeceleration),
    ) < 1e-7,
  );
  assert.equal(sim.player.lateral, lateral);
  assert.equal(
    sim.cars.find((car) => !car.player)!.speed,
    sim.config.baseSpeed,
  );
  assert.equal(sim.braking, true);
  const slowed = sim.player.speed;
  advance(sim, 1);
  assert.ok(sim.player.speed > slowed + 3.5);
  assert.equal(sim.braking, false);
});

test("equal-speed cars can make a train by braking to fall behind and then merging", () => {
  const sim = new RaceSimulation({ carCount: 2, miles: 10 });
  sim.cars.forEach((car) => {
    car.progress = 0;
    car.decisionAt = Infinity;
  });
  const leader = sim.cars.find((car) => !car.player)!;
  sim.start(true);
  advance(sim, 4);
  assert.ok(Math.abs(leader.progress - sim.player.progress) < 1e-7);
  assert.equal(sim.player.trainSize, 1);
  for (let tick = 0; tick < 240; tick++) sim.step(FIXED_STEP, 0, true);
  assert.ok(
    leader.progress - sim.player.progress >=
      sim.config.carLength + sim.config.contactGap,
  );
  advance(sim, 1, -1);
  assert.equal(sim.player.frontId, leader.id);
  assert.equal(sim.player.trainSize, 2);
  advance(sim, 8);
  assert.equal(sim.player.frontId, leader.id);
  assert.equal(sim.player.trainSize, 2);
  assert.ok(sim.player.speed > sim.config.baseSpeed + 1);
});

test("braking and steering work together even while draft speed is growing", () => {
  const sim = train(2);
  const initial = sim.player.speed;
  for (let tick = 0; tick < 24; tick++) sim.step(FIXED_STEP, 1, true);
  assert.ok(sim.player.draftBonus > 0 && sim.player.slipstreamBonus > 0);
  assert.ok(sim.player.speed < initial - 0.5);
  assert.ok(sim.player.lateral > 0.6);
  assert.equal(sim.player.trainSize, 2);
});

test("holding the brake stops the player without reversing; release restarts movement", () => {
  const sim = new RaceSimulation({ carCount: 2, miles: 10 });
  sim.cars.forEach((car) => {
    car.progress = 0;
    car.decisionAt = Infinity;
  });
  sim.start(true);
  for (let tick = 0; tick < 4200; tick++) {
    const previous = sim.player.progress;
    sim.step(FIXED_STEP, 0, true);
    assert.ok(sim.player.speed >= 0 && sim.player.progress >= previous);
  }
  assert.equal(sim.player.speed, 0);
  const stoppedAt = sim.player.progress;
  advance(sim, 1);
  assert.ok(sim.player.speed > 3.5 && sim.player.progress > stoppedAt);
});

test("countdown, pause, and a locked finish do not accept braking", () => {
  const sim = new RaceSimulation({ carCount: 2 });
  sim.step(FIXED_STEP, 0, true);
  assert.equal(sim.braking, false);
  sim.start();
  for (let tick = 0; tick < 120; tick++) sim.step(FIXED_STEP, 0, true);
  assert.equal(sim.player.speed, sim.config.baseSpeed);
  assert.equal(sim.braking, false);
  sim.togglePause();
  const remaining = sim.countdown;
  sim.step(1, 0, true);
  assert.equal(sim.countdown, remaining);
  assert.equal(sim.braking, false);
  const a = new RaceSimulation({ carCount: 2, miles: 0.01 });
  const b = new RaceSimulation({ carCount: 2, miles: 0.01 });
  for (const race of [a, b]) {
    race.cars.forEach((car) => {
      car.progress = 0;
      car.decisionAt = Infinity;
    });
    race.player.progress = race.finishDistance - 0.1;
    race.start(true);
    race.step(FIXED_STEP);
    assert.equal(race.phase, "finishing");
  }
  const time = a.player.finishTime;
  a.step(FIXED_STEP, 0, true);
  b.step(FIXED_STEP);
  assert.equal(a.braking, false);
  assert.deepEqual(a.cars, b.cars);
  assert.equal(a.player.finishTime, time);
});

test("the full field stays spaced and finishes with repeated braking and steering", () => {
  const sim = new RaceSimulation({ miles: 6 }, 42);
  sim.start(true);
  for (let tick = 0; tick < 30000 && sim.phase !== "finished"; tick++) {
    const steering =
      tick % 2400 < 100 ? 1 : tick % 2400 > 1300 && tick % 2400 < 1400 ? -1 : 0;
    sim.step(FIXED_STEP, steering, tick % 2400 >= 600 && tick % 2400 < 900);
    if (tick % 60) continue;
    for (const car of sim.cars) {
      assert.ok(car.speed >= 0 && Number.isFinite(car.progress));
      for (const other of sim.cars) {
        if (other.id === car.id) continue;
        assert.ok(
          Math.abs(car.progress - other.progress) >=
            sim.config.carLength - 1e-6 ||
            Math.abs(car.lateral - other.lateral) >= sim.config.carWidth - 1e-6,
        );
      }
    }
  }
  assert.equal(sim.phase, "finished");
  assert.equal(sim.braking, false);
  assert.ok(
    sim.cars.every((car) => car.finishTime !== null && car.finishTime > 0),
  );
});
