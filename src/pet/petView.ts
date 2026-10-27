import type { AnimName, BehaviorSettings, PetState, Surface } from "./types";
import { createPetState, requestSwap, step } from "./behavior";
import { animFor, frameAt, hop, loops, resolveAnim } from "./animation";
import { DEFAULT_FPS, petForPage, settingsFor, spriteUrl, type PetDef } from "./roster";
import { readHidden, readLastEra, writeHidden, writeLastEra } from "./memory";

/** A pet whose strips have loaded, with each strip's frame count. */
interface LoadedPet {
  def: PetDef;
  frames: Partial<Record<AnimName, number>>;
  available: AnimName[];
  cfg: BehaviorSettings;
  /** How long one play of the blink strip takes, ms. 0 = no blink strip. */
  blinkDurationMs: number;
}

/** Below this viewport width the pet stays put in the corner. */
const NARROW_PX = 480;
/** Gap between the pet and the window edges, px. */
const EDGE_PX = 16;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

/** Loads every strip a pet lists. null if idle or walk is missing. */
async function loadPet(def: PetDef): Promise<LoadedPet | null> {
  const results = await Promise.all(
    def.anims.map(async (anim) => {
      try {
        const img = await loadImage(spriteUrl(def, anim));
        return [anim, Math.max(1, Math.floor(img.naturalWidth / def.frameSize))] as const;
      } catch {
        return null;
      }
    }),
  );
  const frames: Partial<Record<AnimName, number>> = {};
  for (const r of results) if (r) frames[r[0]] = r[1];
  if (!frames.idle || !frames.walk) return null;
  const blinkFps = def.fps?.blink ?? DEFAULT_FPS.blink;
  return {
    def,
    frames,
    available: Object.keys(frames) as AnimName[],
    cfg: settingsFor(def),
    blinkDurationMs: frames.blink ? (frames.blink / blinkFps) * 1000 : 0,
  };
}

/**
 * A swap queued while the pet was dismissed never got its exit hop (the loop
 * was stopped), so on restore the queued pet comes in directly.
 */
export function petAfterRestore<T>(current: T, pending: T | null): T {
  return pending ?? current;
}

function readPageEra(): string | null {
  return document.getElementById("main-content")?.dataset.petEra ?? null;
}

export function startPet(): void {
  const layer = document.getElementById("pet-layer");
  const petEl = layer?.querySelector<HTMLElement>(".pet");
  const sprite = layer?.querySelector<HTMLElement>(".pet-sprite");
  const dismiss = layer?.querySelector<HTMLButtonElement>(".pet-dismiss");
  if (!layer || !petEl || !sprite || !dismiss) return;

  const coarseQuery = matchMedia("(pointer: coarse)");
  const reducedQuery = matchMedia("(prefers-reduced-motion: reduce)");

  let pet: LoadedPet | null = null;
  let pending: LoadedPet | null = null;
  /** The pet the latest page asked for; stale loads compare against it. */
  let targetId: string | null = null;
  let state: PetState | null = null;
  let hidden = readHidden();
  let cursor: { x: number; y: number } | null = null;
  let clicked = false;
  let rafId = 0;
  let lastTs = 0;
  let shownUrl = "";

  function layout(): { size: number; stationary: boolean; surface: Surface } {
    const coarse = coarseQuery.matches;
    const size = (pet?.def.frameSize ?? 32) * (coarse ? 2 : 3);
    const width = window.innerWidth;
    const stationary = reducedQuery.matches || width < NARROW_PX;
    const maxX = width - EDGE_PX - size / 2;
    const fullMinX = EDGE_PX + size / 2;
    // Touch screens get a shorter walk: the right half of the window.
    const minX = stationary ? maxX : coarse ? Math.max(fullMinX, width / 2) : fullMinX;
    return { size, stationary, surface: { minX: Math.min(minX, maxX), maxX } };
  }

  function render(size: number): void {
    if (!pet || !state) return;
    const anim = resolveAnim(pet.available, animFor(state.mode, state.blinkLeftMs > 0));
    const count = pet.frames[anim] ?? 1;
    const fps = pet.def.fps?.[anim] ?? DEFAULT_FPS[anim];
    // A blink plays once from its own start; everything else runs on time in the current mode.
    const frame =
      anim === "blink"
        ? frameAt(pet.blinkDurationMs - state.blinkLeftMs, fps, count, false)
        : frameAt(state.modeMs, fps, count, loops(state.mode));
    const url = spriteUrl(pet.def, anim);
    if (url !== shownUrl) {
      sprite!.style.backgroundImage = `url("${url}")`;
      shownUrl = url;
    }
    petEl!.style.setProperty("--pet-size", `${size}px`);
    sprite!.style.backgroundSize = `${count * size}px ${size}px`;
    sprite!.style.backgroundPosition = `${-frame * size}px 0`;
    sprite!.style.transform = state.facing < 0 ? "scaleX(-1)" : "";
    const { y, opacity } = hop(state.mode, state.timerMs, pet.cfg);
    petEl!.style.transform = `translate(${state.x - size / 2}px, ${y}px)`;
    petEl!.style.opacity = String(opacity);
    petEl!.classList.toggle("is-reacting", state.mode === "react");
  }

  function tick(now: number): void {
    rafId = requestAnimationFrame(tick);
    // Cap the step so a long pause (background tab, slow frame) can't teleport the pet.
    const dt = Math.min(now - lastTs, 100);
    lastTs = now;
    if (!pet || !state) return;
    const { size, stationary, surface } = layout();
    const centreY = window.innerHeight - size / 2;
    const input = {
      cursor: cursor
        ? { dx: cursor.x - state.x, dist: Math.hypot(cursor.x - state.x, cursor.y - centreY) }
        : null,
      clicked,
      surface,
      stationary,
      blinkDurationMs: pet.blinkDurationMs,
    };
    clicked = false;
    const prevMode = state.mode;
    state = step(state, input, dt, Math.random, pet.cfg);
    // The old pet finished hopping out: bring the new one in at the same spot.
    if (prevMode === "exit" && state.mode !== "exit" && pending) {
      pet = pending;
      pending = null;
      state = createPetState(state.x, pet.cfg);
    }
    render(size);
  }

  function startLoop(): void {
    if (rafId || hidden || !pet || document.visibilityState === "hidden") return;
    lastTs = performance.now();
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop(): void {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function applyHidden(): void {
    layer!.hidden = hidden;
    document
      .querySelectorAll<HTMLButtonElement>("[data-pet-restore]")
      .forEach((button) => (button.hidden = !hidden));
    if (hidden) stopLoop();
    else startLoop();
  }

  async function switchTo(def: PetDef): Promise<void> {
    if (def.id === targetId) return;
    targetId = def.id;
    if (pet && def.id === pet.def.id) {
      pending = null; // came back before a queued swap happened
      return;
    }
    const loaded = await loadPet(def);
    if (targetId !== def.id) return; // a newer page asked for a different pet meanwhile
    if (!loaded) return; // art missing: keep the current pet (or none)
    if (!pet || !state) {
      pet = loaded;
      const { surface, stationary } = layout();
      const x = stationary
        ? surface.maxX
        : surface.minX + (surface.maxX - surface.minX) * Math.random();
      state = createPetState(x, pet.cfg);
      petEl!.hidden = false;
      startLoop();
      return;
    }
    pending = loaded;
    state = requestSwap(state, pet.cfg);
  }

  sprite.addEventListener("click", () => {
    clicked = true;
  });

  dismiss.addEventListener("click", () => {
    hidden = true;
    writeHidden(true);
    applyHidden();
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest("[data-pet-restore]")) return;
    hidden = false;
    writeHidden(false);
    if (pet && state) {
      pet = petAfterRestore(pet, pending);
      pending = null;
      state = createPetState(state.x, pet.cfg);
    }
    applyHidden();
  });

  document.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse" || event.pointerType === "pen") {
      cursor = { x: event.clientX, y: event.clientY };
    }
  });
  document.documentElement.addEventListener("pointerleave", () => {
    cursor = null;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") stopLoop();
    else startLoop();
  });

  // Fires on the first load and after every ClientRouter navigation. The pet
  // element itself is persisted, so only the era (and the footer) change.
  document.addEventListener("astro:page-load", () => {
    const { pet: next, remember } = petForPage(readPageEra(), readLastEra());
    if (remember) writeLastEra(remember);
    applyHidden();
    void switchTo(next);
  });
}
