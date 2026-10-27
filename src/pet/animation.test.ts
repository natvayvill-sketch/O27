import { describe, it, expect } from "vitest";
import { HOP_PX, animFor, frameAt, hop, loops, resolveAnim } from "./animation";

const cfg = { enterMs: 500, exitMs: 400 };

describe("resolveAnim", () => {
  it("uses the wanted animation when it exists", () => {
    expect(resolveAnim(["idle", "walk", "sleep"], "sleep")).toBe("sleep");
  });

  it("sleep falls back to sit, then idle", () => {
    expect(resolveAnim(["idle", "walk", "sit"], "sleep")).toBe("sit");
    expect(resolveAnim(["idle", "walk"], "sleep")).toBe("idle");
  });

  it("blink falls back to idle", () => {
    expect(resolveAnim(["idle", "walk"], "blink")).toBe("idle");
  });

  it("notice and react fall back to idle", () => {
    expect(resolveAnim(["idle", "walk"], "notice")).toBe("idle");
    expect(resolveAnim(["idle", "walk"], "react")).toBe("idle");
  });
});

describe("animFor / loops", () => {
  it("enter and exit use the react hop animation", () => {
    expect(animFor("enter")).toBe("react");
    expect(animFor("exit")).toBe("react");
    expect(animFor("walk")).toBe("walk");
  });

  it("waking up uses the sit animation", () => {
    expect(animFor("wake")).toBe("sit");
    expect(loops("wake")).toBe(true);
  });

  it("shows the blink strip only while blinking during idle", () => {
    expect(animFor("idle", true)).toBe("blink");
    expect(animFor("idle", false)).toBe("idle");
    expect(animFor("walk", true)).toBe("walk");
  });

  it("react, enter and exit play once; everything else loops", () => {
    expect(loops("react")).toBe(false);
    expect(loops("enter")).toBe(false);
    expect(loops("exit")).toBe(false);
    expect(loops("idle")).toBe(true);
    expect(loops("sleep")).toBe(true);
  });
});

describe("frameAt", () => {
  it("advances at fps and wraps when looping", () => {
    expect(frameAt(0, 8, 4, true)).toBe(0);
    expect(frameAt(250, 8, 4, true)).toBe(2);
    expect(frameAt(600, 8, 4, true)).toBe(0);
  });

  it("holds the last frame when not looping", () => {
    expect(frameAt(600, 8, 4, false)).toBe(3);
  });

  it("single-frame strips and negative time give frame 0", () => {
    expect(frameAt(5000, 8, 1, true)).toBe(0);
    expect(frameAt(-50, 8, 4, true)).toBe(0);
  });
});

describe("hop", () => {
  it("is flat and opaque outside a swap", () => {
    expect(hop("idle", 0, cfg)).toEqual({ y: 0, opacity: 1 });
  });

  it("enter fades in along an arc", () => {
    const start = hop("enter", 500, cfg);
    expect(start.y).toBeCloseTo(0);
    expect(start.opacity).toBeCloseTo(0);
    const mid = hop("enter", 250, cfg);
    expect(mid.y).toBeCloseTo(-HOP_PX);
    expect(mid.opacity).toBeCloseTo(0.5);
  });

  it("exit fades out and stays finished after its timer runs out", () => {
    const end = hop("exit", -30, cfg);
    expect(end.y).toBeCloseTo(0);
    expect(end.opacity).toBeCloseTo(0);
  });
});
