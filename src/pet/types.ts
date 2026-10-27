/** An animation strip a pet can have: one PNG per name in public/pets/<pet-id>/. */
export type AnimName = "idle" | "walk" | "sit" | "sleep" | "notice" | "react" | "blink";

/**
 * What the pet is doing: an animation name, one half of a pet swap, or "wake"
 * (sitting up for a moment after a nap). Blinking happens on top of idle.
 */
export type PetMode = Exclude<AnimName, "blink"> | "enter" | "exit" | "wake";

/** A horizontal stretch the pet can stand on, as the range its centre may occupy (px). */
export interface Surface {
  minX: number;
  maxX: number;
}

/** Cursor position relative to the pet's centre. */
export interface CursorInput {
  /** Horizontal offset, px. Negative = cursor is left of the pet. */
  dx: number;
  /** Straight-line distance, px. */
  dist: number;
}

export interface PetInput {
  /** null when there's no cursor (touch screens, or it left the window). */
  cursor: CursorInput | null;
  /** The pet was clicked or tapped since the last step. */
  clicked: boolean;
  surface: Surface;
  /** Reduced motion or a very narrow screen: never walk. */
  stationary: boolean;
  /** How long this pet's blink strip plays, ms. 0 = the pet has no blink strip. */
  blinkDurationMs: number;
}

export interface PetState {
  mode: PetMode;
  /** Centre x, px. */
  x: number;
  /** 1 = facing right (as drawn), -1 = mirrored. */
  facing: 1 | -1;
  /** Where walk / notice is heading, px. */
  targetX: number;
  /** Time left in a timed mode (idle, sit, sleep, react, enter, exit), ms. */
  timerMs: number;
  /** Time spent in the current mode, ms. Drives the animation frame. */
  modeMs: number;
  /** How long the cursor has been within noticeRadius, ms. */
  nearMs: number;
  /** Clicks are ignored until this reaches 0, ms. */
  cooldownMs: number;
  /** Time until the next blink while idle, ms. */
  nextBlinkMs: number;
  /** Time left in the current blink, ms. > 0 while blinking. */
  blinkLeftMs: number;
}

export interface BehaviorSettings {
  /** px per second. */
  walkSpeed: number;
  /** [min, max] ms; the actual duration is picked at random in this range. */
  idleMs: readonly [number, number];
  sitMs: readonly [number, number];
  sleepMs: readonly [number, number];
  /** How long the pet stays sitting after a nap ends on its own. */
  wakeMs: readonly [number, number];
  /** Gap between blinks while idle (only for pets with a blink strip). */
  blinkMs: readonly [number, number];
  /** Chance (0..1) that idle leads to sit instead of walk. */
  sitChance: number;
  /** Chance (0..1) that sit leads to sleep instead of idle. */
  sleepChance: number;
  /** px. */
  noticeRadius: number;
  /** Furthest the pet shuffles towards a nearby cursor, px. */
  shuffleStep: number;
  /** px per second. */
  shuffleSpeed: number;
  /** How long the cursor must stay near to wake a sleeping pet, ms. */
  wakeAfterMs: number;
  reactMs: number;
  clickCooldownMs: number;
  enterMs: number;
  exitMs: number;
}
