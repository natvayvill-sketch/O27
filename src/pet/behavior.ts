import type { BehaviorSettings, PetInput, PetMode, PetState, Surface } from "./types";

export const DEFAULT_SETTINGS: BehaviorSettings = {
  walkSpeed: 40,
  idleMs: [2000, 6000],
  sitMs: [5000, 12000],
  sleepMs: [20000, 45000],
  wakeMs: [1500, 3000],
  blinkMs: [3000, 8000],
  sitChance: 0.3,
  sleepChance: 0.4,
  noticeRadius: 120,
  shuffleStep: 24,
  shuffleSpeed: 25,
  wakeAfterMs: 1500,
  reactMs: 800,
  clickCooldownMs: 1200,
  enterMs: 500,
  exitMs: 400,
};

const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;
const between = ([lo, hi]: readonly [number, number], rng: () => number): number =>
  lo + (hi - lo) * rng();

function moveToward(x: number, target: number, maxStep: number): number {
  const d = target - x;
  return Math.abs(d) <= maxStep ? target : x + Math.sign(d) * maxStep;
}

function enterMode(s: PetState, mode: PetMode, timerMs = 0): PetState {
  return { ...s, mode, timerMs, modeMs: 0 };
}

function toIdle(s: PetState, rng: () => number, cfg: BehaviorSettings): PetState {
  return enterMode(s, "idle", between(cfg.idleMs, rng));
}

function startWalk(s: PetState, surface: Surface, rng: () => number): PetState {
  const targetX = surface.minX + (surface.maxX - surface.minX) * rng();
  return { ...enterMode(s, "walk"), targetX, facing: targetX < s.x ? -1 : 1 };
}

function notice(s: PetState, input: PetInput, cfg: BehaviorSettings): PetState {
  const dx = input.cursor ? input.cursor.dx : 0;
  const shuffle = input.stationary ? 0 : clamp(dx, -cfg.shuffleStep, cfg.shuffleStep);
  return {
    ...enterMode(s, "notice"),
    facing: dx < 0 ? -1 : 1,
    targetX: clamp(s.x + shuffle, input.surface.minX, input.surface.maxX),
  };
}

export function createPetState(x: number, cfg: BehaviorSettings = DEFAULT_SETTINGS): PetState {
  return {
    mode: "enter",
    x,
    facing: 1,
    targetX: x,
    timerMs: cfg.enterMs,
    modeMs: 0,
    nearMs: 0,
    cooldownMs: 0,
    nextBlinkMs: 0,
    blinkLeftMs: 0,
  };
}

/** Start hopping out so a different pet can hop in. */
export function requestSwap(s: PetState, cfg: BehaviorSettings = DEFAULT_SETTINGS): PetState {
  return s.mode === "exit" ? s : enterMode(s, "exit", cfg.exitMs);
}

/** Advance the pet by dtMs. Pure: all randomness comes from rng (0..1). */
export function step(
  prev: PetState,
  input: PetInput,
  dtMs: number,
  rng: () => number,
  cfg: BehaviorSettings = DEFAULT_SETTINGS,
): PetState {
  return blink(prev, move(prev, input, dtMs, rng, cfg), input, dtMs, rng, cfg);
}

/** Blinks are layered on top of idle: a random countdown, then one play of the blink strip. */
function blink(
  prev: PetState,
  next: PetState,
  input: PetInput,
  dtMs: number,
  rng: () => number,
  cfg: BehaviorSettings,
): PetState {
  if (next.mode !== "idle" || input.blinkDurationMs <= 0) {
    return { ...next, blinkLeftMs: 0, nextBlinkMs: 0 };
  }
  if (prev.mode !== "idle") {
    return { ...next, blinkLeftMs: 0, nextBlinkMs: between(cfg.blinkMs, rng) };
  }
  if (next.blinkLeftMs > 0) {
    const left = next.blinkLeftMs - dtMs;
    return left > 0
      ? { ...next, blinkLeftMs: left }
      : { ...next, blinkLeftMs: 0, nextBlinkMs: between(cfg.blinkMs, rng) };
  }
  const wait = next.nextBlinkMs - dtMs;
  return wait > 0
    ? { ...next, nextBlinkMs: wait }
    : { ...next, nextBlinkMs: 0, blinkLeftMs: input.blinkDurationMs };
}

function move(
  prev: PetState,
  input: PetInput,
  dtMs: number,
  rng: () => number,
  cfg: BehaviorSettings = DEFAULT_SETTINGS,
): PetState {
  const { surface } = input;
  const near = input.cursor !== null && input.cursor.dist <= cfg.noticeRadius;
  const s: PetState = {
    ...prev,
    // The surface can shrink (window resize), so keep the pet on it.
    x: clamp(prev.x, surface.minX, surface.maxX),
    targetX: clamp(prev.targetX, surface.minX, surface.maxX),
    modeMs: prev.modeMs + dtMs,
    timerMs: prev.timerMs - dtMs,
    cooldownMs: Math.max(0, prev.cooldownMs - dtMs),
    nearMs: near ? prev.nearMs + dtMs : 0,
  };

  // Swapping pets runs to completion and ignores the visitor.
  if (s.mode === "exit") return s.timerMs <= 0 ? enterMode(s, "enter", cfg.enterMs) : s;
  if (s.mode === "enter") return s.timerMs <= 0 ? toIdle(s, rng, cfg) : s;

  if (input.clicked && s.cooldownMs === 0) {
    return { ...enterMode(s, "react", cfg.reactMs), cooldownMs: cfg.clickCooldownMs };
  }
  if (s.mode === "react") {
    if (s.timerMs > 0) return s;
    return near ? notice(s, input, cfg) : toIdle(s, rng, cfg);
  }

  // A sleeping pet only wakes if the cursor lingers.
  if (near && s.mode !== "notice" && (s.mode !== "sleep" || s.nearMs >= cfg.wakeAfterMs)) {
    return notice(s, input, cfg);
  }

  const px = (speed: number): number => (speed * dtMs) / 1000;
  switch (s.mode) {
    case "notice": {
      if (!near) return toIdle(s, rng, cfg);
      const facing = input.cursor!.dx < 0 ? -1 : 1;
      return { ...s, facing, x: moveToward(s.x, s.targetX, px(cfg.shuffleSpeed)) };
    }
    case "idle":
      if (s.timerMs > 0) return s;
      if (input.stationary || rng() < cfg.sitChance) {
        return enterMode(s, "sit", between(cfg.sitMs, rng));
      }
      return startWalk(s, surface, rng);
    case "walk": {
      const x = moveToward(s.x, s.targetX, px(cfg.walkSpeed));
      return x === s.targetX ? toIdle({ ...s, x }, rng, cfg) : { ...s, x };
    }
    case "sit":
      if (s.timerMs > 0) return s;
      if (input.stationary || rng() < cfg.sleepChance) {
        return enterMode(s, "sleep", between(cfg.sleepMs, rng));
      }
      return toIdle(s, rng, cfg);
    case "sleep":
      // Waking up: sit for a moment before standing, so the pet doesn't pop upright.
      return s.timerMs > 0 ? s : enterMode(s, "wake", between(cfg.wakeMs, rng));
    case "wake":
      return s.timerMs > 0 ? s : toIdle(s, rng, cfg);
  }
}
