# Era Pets — Design

_Date: 2026-10-22_

## Goal

Add small animated pixel-art "computer pets" to the portfolio, based on my original
characters. Each era has its own pet. They are **ambient charm**: they live a small life
at the bottom of the window and react lightly to the visitor, but never get in the way.

## Decisions

| Question | Decision |
|---|---|
| Purpose | Ambient charm, not a game or a guide |
| Where | Every page |
| Which pet | Era page → that era's pet. Any other page → the pet of the last era visited. No era visited yet → a mini Living Portrait character (the default companion). |
| Art | Pixel-art sprite strips, one PNG per animation |
| Movement (now) | Walks along the bottom of the window |
| Movement (later) | Wanders over the page, Shimeji-style (climbs window edges, sits on polaroids). Not built now, but the design leaves room for it. |
| Reactions | Notices the cursor, and reacts to clicks |
| Approach | Small hand-written module, no dependencies |

## Architecture

New folder `src/pet/`, set up like `src/tracker/`: pure logic that can be tested on its own,
separate from a thin layer that touches the page.

- **`behavior.ts`**: pure state machine with no DOM access.
  `step(state, input, dtMs, rng, settings) → state`. `input` holds the cursor distance and
  direction (or none), whether the pet was clicked, and the surfaces it can stand on.
  It is fully unit-tested, and randomness comes from an `rng` that is passed in so tests
  are predictable.
- **`roster.ts`**: data only. Maps an era name to a pet definition: sprite folder, frame
  size, display scale, which animation files exist (and their fps), and optional
  behaviour-setting overrides. Includes the default `livingPortrait` pet.
  Exports `choosePet(currentEra, rememberedEra) → PetDef`.
- **`memory.ts`**: reads and writes the last era visited in `localStorage`. Every access is
  wrapped in try/catch, and failures just mean "nothing remembered".
- **`petView.ts`**: the only part that touches the DOM. It positions the pet element, sets
  the sprite frame (per-animation strip image + `background-position`), flips it with `scaleX(-1)`, measures cursor
  distance, handles clicks and taps, runs the `requestAnimationFrame` loop, and pauses
  while the tab is hidden.
- **`Pet.astro`**: the component, placed once in `PageLayout.astro` with
  `transition:persist` so one pet survives the `<ClientRouter />` page-turns. Each page
  passes its era through a `data-era` attribute (era pages pass their era, other pages
  pass nothing). On `astro:page-load` it reads the new era and swaps the pet if it changed.

**Flow:** page era (or none) → `choosePet` (era pet → remembered pet → mini portrait) →
behaviour loop → view.

**Room for wandering later:** the behaviour logic only knows about "surfaces it can stand
on". For now the only surface is the bottom of the window. Later, `petView` adds polaroid
tops and window edges as surfaces, and `behavior.ts` gains climb and jump states.
Nothing gets rewritten.

## Sprite format

- Each pet has its own folder, `public/pets/<pet-id>/`, with **one PNG per animation**.
  The file name is the animation name (`idle.png`, `walk.png`, ...).
- Each file is **one horizontal strip** of frames, left to right, 32 px tall.
  A 4-frame walk is 128×32. The code works out the frame count from the image width
  (width ÷ frame size), so nobody has to type it in.
- Frames are **32×32 px**, shown at 2× or 3× with `image-rendering: pixelated`.
- Draw the pet **facing right only**. The code mirrors it for walking left.
- Animations (files):

  | File | Frames | Notes |
  |---|---|---|
  | idle | 2–4 | **required** |
  | walk | 4–6 | **required** |
  | sit | 1–2 | falls back to idle |
  | sleep | 2 | slow breathing loop; falls back to sit |
  | notice | 1–2 | looking up or alert; falls back to idle |
  | react | 3–4 | hop or happy face; falls back to idle |

- Optional `blink.png` (a few frames, falls back to idle): plays once at random moments
  while idle, so `idle.png` can be a calm breathing loop. The gap between blinks is the
  `blinkMs` setting (default 3–8 s, overridable per pet).
- Missing files fall back as shown, so a pet can start with just `idle.png` and `walk.png`.

## Behaviour

States: `idle`, `walk`, `sit`, `sleep`, `notice`, `react`, plus `exit` and `enter` for
swapping pets.

- **idle**: waits a few seconds, then usually walks and sometimes sits.
- **walk**: walks to a random spot along the bottom, then goes back to idle.
- **sit**: after a while, may fall asleep.
- **sleep**: naps until woken, or wakes on its own after a long while (so the site never ends up with every pet asleep). In reduced-motion mode it goes straight back to sit and sleep. When a nap ends on its own, the pet stays sitting for a moment ("wake") before standing, so it doesn't pop upright.
- **notice**: when the cursor comes within ~120 px, the pet stops, turns towards it and
  plays "notice". If the cursor stays nearby, it shuffles a step or two towards it (it never
  chases across the screen). When the cursor leaves, it goes back to idle.
  A sleeping pet only wakes if the cursor stays close for a short while.
- **react**: a click or tap plays "react" once with a small heart pop. Clicks are ignored
  for a short cooldown afterwards.
- **era swap**: the old pet hops out and the new one hops in at the same spot.

All timings and chances live in one `DEFAULT_SETTINGS` object. Each pet can override
values (for example, a sleepier pet).

## Accessibility and staying out of the way

- The pet container uses `pointer-events: none`. Only the pet sprite itself can be
  clicked, so it never blocks the page.
- Small on screen (~64–96 px), kept clear of footer links.
- **Reduced motion** (`prefers-reduced-motion: reduce`): no walking. The pet sits in a
  corner, mostly asleep, with a slow breathing loop.
- **Dismiss**: a small labelled "×" button sends the pet away for the visit
  (`sessionStorage`). A small control in the footer brings it back.
- The sprite has `aria-hidden="true"` because it's decorative. The dismiss and restore
  controls are real buttons with labels.

## Phones and touch screens

- No cursor, so no "notice". A tap triggers "react".
- Smaller scale and a shorter walking range.
- On very narrow screens, the pet stays in a corner, the same as in reduced-motion mode.

## Error handling

- If a pet's required strips (idle, walk) fail to load, no pet is shown and nothing else is affected.
- An era with no roster entry uses the remembered pet, then the mini portrait.
- If storage is unavailable, nothing is remembered and the mini portrait is used.
- The loop pauses while the tab is hidden.

## Testing

Unit tests with vitest:
- `behavior.ts`: every state change, the "sleeping pet only wakes if the cursor stays
  close" rule, the click cooldown, and the walk target staying within the surface.
- `roster.ts`: `choosePet` priority, and fallbacks for missing animation files.
- `memory.ts`: storage that throws on access.

Checked by hand by running the site: walking across page-turns, era swaps, reduced
motion, dismiss and restore, and a phone-width viewport.

## Out of scope for now

- Wandering over the page (climbing, sitting on polaroids). The design leaves room for it.
- Sound.
- Feeding or other Tamagotchi-style interactions.

## Art needed

- One folder of animation strips per era pet, plus the mini Living Portrait pet.
- Development can start with placeholder strips so the code doesn't wait on the art.

## Notes found while designing

- The era names `"Common Era"` and `"The Common Era"` are both in use. This creates two
  separate eras and two pets. Decide whether to merge them.
- `src/tracker/trackerApp.ts` assumes full page loads, but the site now uses
  `<ClientRouter />`. Leaving the Living Portrait page may not release the webcam.
  Check this separately.
