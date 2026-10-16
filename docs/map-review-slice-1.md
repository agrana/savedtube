# Map review — slice 1 (visual composition)

**Status:** human visual review approved; authorized for delivery to `main`. Resume and celebration slices remain separate.

## Intent

Make the path map the central experience: a calm, sequential journey where lessons and current position are prominent, and stages read as light background groupings with compact, discoverable headings.

## What this slice changes

- **Layout contract** (`src/lib/path-map.ts`): desktop left-to-right and mobile top-to-bottom sequential **lesson** spine; compact stage headings; soft stage bands; continuous lesson-to-lesson connectors; goal removed from the canvas (quiet heading copy only).
- **Map UI** (`src/components/PathMap.tsx`): lessons styled as primary nodes; stage labels as small accessible expand buttons; details panel under the map; ordered sequence kept as `sr-only` accessible fallback when the map is shown (no competing default-visible list).
- **Public demo** (`src/components/DemoPathLanding.tsx`): map full-width above the player (no side-by-side cramped column).
- **Personal path detail**: same shared `PathMap` composition (already full-width in its section).

## Explicitly out of scope (do not treat as done)

- Slice 2: return-to-position / scroll current lesson into view.
- Slice 3: celebrations or new progress persistence.
- Auth, player lifecycle, schema, storage, new dependencies, fake data.

## Checks run (local)

- `npm run type-check`
- `npm test` (full suite) and/or focused `src/lib/path-map.test.ts`
- `npm run build` when environment allows

Existing `node_modules` may be symlinked; prefer `next dev` **without** Turbopack for visual review (`npx next dev` / `next dev` without `--turbopack`).

## Human review questions

1. At **1280px**, does a normal three-stage demo journey read left-to-right inside the map container without later stages feeling hidden behind narrow-column scrolling?
2. Do **lessons / current / next** feel more prominent than stage chrome?
3. Are stage headings discoverable enough without dominating?
4. At **390px**, is the vertical path readable (long titles) with **no document horizontal overflow**?
5. Is the quiet goal heading calm enough (no branching tree above stages)?
6. Do personal path detail and public demo feel consistent?
7. Any reduced-motion / keyboard / focus regressions?

## Pending slices after approval

1. ~~Visual map composition~~ (approved after desktop and phone screenshot review)
2. Return-to-position
3. Restrained celebrations (no new persistence)
