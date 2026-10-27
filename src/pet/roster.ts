import type { AnimName, BehaviorSettings } from "./types";
import { DEFAULT_SETTINGS } from "./behavior";

/**
 * One pet. Its art lives in public/pets/<id>/<anim>.png: one horizontal strip
 * of frameSize×frameSize frames per animation. The frame count comes from the
 * image width, so only list which strips exist.
 */
export interface PetDef {
  id: string;
  frameSize: number;
  /** Strips that exist for this pet. idle and walk are required. */
  anims: readonly AnimName[];
  /** Playback speed overrides, frames per second. */
  fps?: Partial<Record<AnimName, number>>;
  /** Personality overrides, e.g. a sleepier pet. */
  settings?: Partial<BehaviorSettings>;
}

export const DEFAULT_FPS: Record<AnimName, number> = {
  idle: 4,
  walk: 8,
  sit: 2,
  sleep: 2,
  notice: 4,
  react: 8,
  blink: 8,
};

const ALL_ANIMS: readonly AnimName[] = ["idle", "walk", "sit", "sleep", "notice", "react"];

export const DEFAULT_PET_ID = "living-portrait";

export const PETS: Record<string, PetDef> = {
  "living-portrait": { id: "living-portrait", frameSize: 32, anims: ALL_ANIMS },
  // Temporary stand-in so era switching can be seen before real art exists.
  "placeholder-b": {
    id: "placeholder-b",
    frameSize: 32,
    anims: ALL_ANIMS,
    settings: { walkSpeed: 60, sitChance: 0.15 },
  },
  nesrin: {
    id: "nesrin",
    frameSize: 20,
    anims: ["idle", "walk", "sit", "sleep", "blink"],
    fps: { walk: 4, idle: 2 },
    settings: {
      walkSpeed: 25,
      idleMs: [4000, 10000],
      sitChance: 0.6,
      sleepChance: 0.7,
      blinkMs: [5000, 12000],
    },
  },
};

/** Era name (exactly as in the project front matter) -> pet id. */
export const ERA_PETS: Record<string, string> = {
  "The Age of Man": "nesrin",
};

export function choosePet(
  currentEra: string | null,
  rememberedEra: string | null,
  eraPets: Record<string, string> = ERA_PETS,
  pets: Record<string, PetDef> = PETS,
): PetDef {
  for (const era of [currentEra, rememberedEra]) {
    const id = era ? eraPets[era] : undefined;
    const pet = id ? pets[id] : undefined;
    if (pet) return pet;
  }
  return pets[DEFAULT_PET_ID]!;
}

/**
 * Which pet a page shows, and which era to remember for later pages. Only
 * eras that have a pet are remembered, so visiting a petless era keeps the
 * remembered pet instead of resetting to the default.
 */
export function petForPage(
  era: string | null,
  rememberedEra: string | null,
  eraPets: Record<string, string> = ERA_PETS,
  pets: Record<string, PetDef> = PETS,
): { pet: PetDef; remember: string | null } {
  const id = era ? eraPets[era] : undefined;
  const hasPet = id !== undefined && pets[id] !== undefined;
  return { pet: choosePet(era, rememberedEra, eraPets, pets), remember: hasPet ? era : null };
}

export function spriteUrl(pet: PetDef, anim: AnimName): string {
  return `/pets/${pet.id}/${anim}.png`;
}

export function settingsFor(pet: PetDef): BehaviorSettings {
  return { ...DEFAULT_SETTINGS, ...pet.settings };
}
