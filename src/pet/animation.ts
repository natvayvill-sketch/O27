import type { AnimName, BehaviorSettings, PetMode } from "./types";

/** How high the pet hops when swapping in or out, px. */
export const HOP_PX = 24;

/** What to show when a pet doesn't have a strip, tried in order. */
const FALLBACKS: Record<AnimName, readonly AnimName[]> = {
  idle: [],
  walk: ["idle"],
  sit: ["idle"],
  sleep: ["sit", "idle"],
  notice: ["idle"],
  react: ["idle"],
  blink: ["idle"],
};

export function resolveAnim(available: readonly AnimName[], wanted: AnimName): AnimName {
  for (const name of [wanted, ...FALLBACKS[wanted]]) {
    if (available.includes(name)) return name;
  }
  return "idle";
}

export function animFor(mode: PetMode, blinking = false): AnimName {
  if (mode === "enter" || mode === "exit") return "react";
  if (mode === "wake") return "sit";
  return mode === "idle" && blinking ? "blink" : mode;
}

export function loops(mode: PetMode): boolean {
  return mode !== "react" && mode !== "enter" && mode !== "exit";
}

export function frameAt(modeMs: number, fps: number, frameCount: number, loop: boolean): number {
  if (frameCount <= 1) return 0;
  const frame = Math.floor((Math.max(0, modeMs) / 1000) * fps);
  return loop ? frame % frameCount : Math.min(frame, frameCount - 1);
}

/** Vertical offset (px, negative = up) and opacity for the enter/exit hop. */
export function hop(
  mode: PetMode,
  timerMs: number,
  cfg: Pick<BehaviorSettings, "enterMs" | "exitMs">,
): { y: number; opacity: number } {
  if (mode !== "enter" && mode !== "exit") return { y: 0, opacity: 1 };
  const total = mode === "enter" ? cfg.enterMs : cfg.exitMs;
  const t = Math.min(1, Math.max(0, 1 - timerMs / total));
  return {
    y: -Math.sin(Math.PI * t) * HOP_PX,
    opacity: mode === "enter" ? t : 1 - t,
  };
}
