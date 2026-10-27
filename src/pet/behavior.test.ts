import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS as cfg, createPetState, requestSwap, step } from "./behavior";
import type { PetInput, PetMode, PetState } from "./types";

const surface = { minX: 50, maxX: 450 };
const input = (over: Partial<PetInput> = {}): PetInput => ({
  cursor: null,
  clicked: false,
  surface,
  stationary: false,
  blinkDurationMs: 0,
  ...over,
});
const at = (mode: PetMode, over: Partial<PetState> = {}): PetState => ({
  ...createPetState(200),
  mode,
  timerMs: 1000,
  ...over,
});
const lo = () => 0;
const hi = () => 0.99;
/** rng that returns the given values in order, repeating. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};
const near = { dx: 30, dist: 40 };
const far = { dx: 500, dist: 500 };

describe("behavior: swapping in and out", () => {
  it("starts by hopping in", () => {
    const s = createPetState(200);
    expect(s.mode).toBe("enter");
    expect(s.timerMs).toBe(cfg.enterMs);
    expect(s.x).toBe(200);
    expect(s.facing).toBe(1);
  });

  it("enter -> idle once the hop finishes", () => {
    const s = step(createPetState(200), input(), cfg.enterMs, lo);
    expect(s.mode).toBe("idle");
    expect(s.timerMs).toBe(cfg.idleMs[0]);
    expect(s.modeMs).toBe(0);
  });

  it("enter ignores clicks and the cursor", () => {
    const s = step(createPetState(200), input({ clicked: true, cursor: near }), 100, lo);
    expect(s.mode).toBe("enter");
  });

  it("requestSwap -> exit, then enter when the exit hop finishes", () => {
    const exiting = requestSwap(at("walk"));
    expect(exiting.mode).toBe("exit");
    expect(exiting.timerMs).toBe(cfg.exitMs);
    const entering = step(exiting, input(), cfg.exitMs, lo);
    expect(entering.mode).toBe("enter");
    expect(entering.timerMs).toBe(cfg.enterMs);
  });

  it("requestSwap during an exit doesn't restart it", () => {
    const exiting = at("exit", { timerMs: 100 });
    expect(requestSwap(exiting)).toBe(exiting);
  });
});

describe("behavior: idle, walk, sit, sleep", () => {
  it("idle keeps waiting while its timer runs", () => {
    const s = step(at("idle"), input(), 500, hi);
    expect(s.mode).toBe("idle");
    expect(s.timerMs).toBe(500);
  });

  it("idle -> walk to a random spot on the surface", () => {
    const s = step(at("idle", { timerMs: 0 }), input(), 16, hi);
    expect(s.mode).toBe("walk");
    expect(s.targetX).toBeCloseTo(50 + 400 * 0.99);
    expect(s.facing).toBe(1);
  });

  it("idle -> walk left faces left", () => {
    const s = step(at("idle", { x: 400, timerMs: 0 }), input(), 16, seq(0.99, 0));
    expect(s.mode).toBe("walk");
    expect(s.targetX).toBe(50);
    expect(s.facing).toBe(-1);
  });

  it("idle -> sit when the sit roll succeeds", () => {
    const s = step(at("idle", { timerMs: 0 }), input(), 16, lo);
    expect(s.mode).toBe("sit");
    expect(s.timerMs).toBe(cfg.sitMs[0]);
  });

  it("stationary idle always sits, never walks", () => {
    const s = step(at("idle", { timerMs: 0 }), input({ stationary: true }), 16, hi);
    expect(s.mode).toBe("sit");
  });

  it("walk moves at walkSpeed towards its target", () => {
    const s = step(at("walk", { x: 100, targetX: 400 }), input(), 1000, hi);
    expect(s.mode).toBe("walk");
    expect(s.x).toBe(100 + cfg.walkSpeed);
  });

  it("walk stops at its target even after a huge time gap", () => {
    const s = step(at("walk", { x: 100, targetX: 400 }), input(), 60_000, lo);
    expect(s.x).toBe(400);
    expect(s.mode).toBe("idle");
  });

  it("keeps the pet on the surface when the window shrinks", () => {
    const s = step(at("idle", { x: 600, targetX: 700 }), input(), 16, hi);
    expect(s.x).toBe(450);
    expect(s.targetX).toBe(450);
  });

  it("sit -> sleep when the sleep roll succeeds", () => {
    const s = step(at("sit", { timerMs: 0 }), input(), 16, lo);
    expect(s.mode).toBe("sleep");
    expect(s.timerMs).toBe(cfg.sleepMs[0]);
  });

  it("sit -> idle when the sleep roll fails", () => {
    const s = step(at("sit", { timerMs: 0 }), input(), 16, hi);
    expect(s.mode).toBe("idle");
  });

  it("stationary sit always falls asleep", () => {
    const s = step(at("sit", { timerMs: 0 }), input({ stationary: true }), 16, hi);
    expect(s.mode).toBe("sleep");
  });

  it("sleep -> wake (still sitting) when the nap ends on its own", () => {
    const s = step(at("sleep", { timerMs: 0 }), input(), 16, lo);
    expect(s.mode).toBe("wake");
    expect(s.timerMs).toBe(cfg.wakeMs[0]);
  });

  it("wake -> idle after a moment, without dozing off again", () => {
    const s = step(at("wake", { timerMs: 0 }), input(), 16, lo);
    expect(s.mode).toBe("idle");
  });

  it("a waking pet still notices the cursor", () => {
    const s = step(at("wake"), input({ cursor: near }), 16, lo);
    expect(s.mode).toBe("notice");
  });
});

describe("behavior: noticing the cursor", () => {
  it("cursor nearby -> notice, facing it, with a short shuffle target", () => {
    const s = step(at("idle"), input({ cursor: { dx: -30, dist: 40 } }), 16, lo);
    expect(s.mode).toBe("notice");
    expect(s.facing).toBe(-1);
    expect(s.targetX).toBe(200 - cfg.shuffleStep);
  });

  it("notice shuffles towards its target at shuffleSpeed", () => {
    const s = step(
      at("notice", { x: 200, targetX: 176, facing: -1 }),
      input({ cursor: { dx: -30, dist: 40 } }),
      400,
      lo,
    );
    expect(s.mode).toBe("notice");
    expect(s.x).toBe(200 - cfg.shuffleSpeed * 0.4);
  });

  it("notice -> idle when the cursor leaves", () => {
    const s = step(at("notice"), input({ cursor: far }), 16, lo);
    expect(s.mode).toBe("idle");
  });

  it("stationary pets turn towards the cursor but don't shuffle", () => {
    const s = step(at("idle"), input({ cursor: near, stationary: true }), 16, lo);
    expect(s.mode).toBe("notice");
    expect(s.facing).toBe(1);
    expect(s.targetX).toBe(200);
  });

  it("a sleeping pet ignores a passing cursor", () => {
    const s = step(at("sleep", { timerMs: 20_000 }), input({ cursor: near }), 500, lo);
    expect(s.mode).toBe("sleep");
    expect(s.nearMs).toBe(500);
  });

  it("a sleeping pet wakes once the cursor stays close long enough", () => {
    const s = step(at("sleep", { timerMs: 20_000, nearMs: 1400 }), input({ cursor: near }), 200, lo);
    expect(s.mode).toBe("notice");
  });
});

describe("behavior: clicks", () => {
  it("click -> react and starts the cooldown", () => {
    const s = step(at("idle"), input({ clicked: true }), 16, lo);
    expect(s.mode).toBe("react");
    expect(s.timerMs).toBe(cfg.reactMs);
    expect(s.cooldownMs).toBe(cfg.clickCooldownMs);
  });

  it("clicks during the cooldown are ignored", () => {
    const s = step(at("react", { timerMs: 500, cooldownMs: 1000 }), input({ clicked: true }), 16, lo);
    expect(s.mode).toBe("react");
    expect(s.timerMs).toBe(484);
  });

  it("react -> idle when it finishes", () => {
    const s = step(at("react", { timerMs: 10 }), input(), 16, lo);
    expect(s.mode).toBe("idle");
  });

  it("react -> notice when it finishes with the cursor still close", () => {
    const s = step(at("react", { timerMs: 10 }), input({ cursor: near }), 16, lo);
    expect(s.mode).toBe("notice");
  });

  it("a click wakes a sleeping pet", () => {
    const s = step(at("sleep", { timerMs: 20_000 }), input({ clicked: true }), 16, lo);
    expect(s.mode).toBe("react");
  });
});

describe("behavior: blinking", () => {
  const blinky = (over: Partial<PetInput> = {}) => input({ blinkDurationMs: 300, ...over });

  it("schedules a blink when the pet becomes idle", () => {
    const s = step(createPetState(200), blinky(), cfg.enterMs, lo);
    expect(s.mode).toBe("idle");
    expect(s.nextBlinkMs).toBe(cfg.blinkMs[0]);
    expect(s.blinkLeftMs).toBe(0);
  });

  it("counts down to the next blink while idle", () => {
    const s = step(at("idle", { nextBlinkMs: 1000 }), blinky(), 100, lo);
    expect(s.nextBlinkMs).toBe(900);
    expect(s.blinkLeftMs).toBe(0);
  });

  it("starts a blink when the countdown runs out", () => {
    const s = step(at("idle", { nextBlinkMs: 10 }), blinky(), 16, lo);
    expect(s.mode).toBe("idle");
    expect(s.blinkLeftMs).toBe(300);
  });

  it("ends the blink after its length and schedules the next one", () => {
    const s = step(at("idle", { blinkLeftMs: 10 }), blinky(), 16, hi);
    expect(s.blinkLeftMs).toBe(0);
    expect(s.nextBlinkMs).toBeCloseTo(cfg.blinkMs[0] + (cfg.blinkMs[1] - cfg.blinkMs[0]) * 0.99);
  });

  it("never blinks when the pet has no blink strip", () => {
    const s = step(at("idle", { nextBlinkMs: 10 }), input(), 16, lo);
    expect(s.blinkLeftMs).toBe(0);
  });

  it("stops blinking when the pet leaves idle", () => {
    const s = step(at("walk", { x: 100, targetX: 400, blinkLeftMs: 200 }), blinky(), 16, lo);
    expect(s.mode).toBe("walk");
    expect(s.blinkLeftMs).toBe(0);
  });
});
