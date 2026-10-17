# SavedTube Change Log

This file records user-visible product changes and meaningful engineering changes. Each completed feature slice gets an entry when it is delivered. Deferred ideas and unfinished work belong in [`backlog.md`](backlog.md).

## 2026-10-17

### Added

- Replaced free-text background on path creation with structured learning preferences: Level (Beginner / Intermediate / Advanced), Max length per video (No limit, 5–60 minutes), and Style (Corporate / Fun / Academic). Preferences validate server-side, persist without a schema migration, steer planning/search/selection, and enforce duration caps from verified YouTube metadata. Regeneration reuses stored preferences; legacy free-text background paths keep working.

### Changed

- Hid the path sequence editor behind an **Edit sequence** disclosure next to **Regenerate draft**, so the map stays primary while editing remains available on demand with Done to close.

## 2026-10-16

### Changed

- Made the path map the primary composition with a sequential lesson spine, compact background stage groupings, and a quiet goal heading. Desktop paths flow left-to-right and portrait phone paths top-to-bottom.
- Placed the public demo map at full width above the player and kept the accessible sequence available without a competing visible list. Approved after desktop and phone visual review; saved-position restoration and celebrations remain separate slices.

### Added

- Added the first guided path-map experience: a responsive left-to-right desktop and top-to-bottom portrait-mobile flow with continuous connectors, stage numbers, current/completed states, explicit recommended-next guidance, truthful practiced counts, and Start/Continue actions.
- Made stages accessible interactive controls with one expanded stage at a time, objective and lesson details, keyboard focus states, stable return context, reduced-motion-safe transitions, and preserved exploration of future and completed stages.

### Fixed

- Preserved public demo lesson selection in URL history, including browser Back restoration to the initial lesson without resetting existing non-demo anchors.

## 2026-10-11

### Fixed

- Made the explicit Google YouTube reconnect flow request offline access and fresh consent, so an existing SavedTube session can recover an expired or missing YouTube authorization without treating the user as logged out.
- Prevented the five-minute authentication refresh from unmounting and restarting the active YouTube player.
- Restored paused playback positions when returning through browser history or page restoration, while keeping the video paused.
- Kept the YouTube player mounted while authentication status refreshes, preventing playback resets during background session revalidation.

### Added

- Added named video bookmarks. Bookmarks have editable names, persist in browser-local storage, and remain independently jumpable and removable.
- Added automatic resume for watched videos so returning to a video restores the last meaningful playback position.
- Added multiple point-in-time bookmarks per video, kept separate from automatic resume and range-based practice intervals.
- Added a more active, truthful research-progress experience during path creation.
- Added remaining-video-minutes information to path progress.
- Added repeatable UX audit setup for the authenticated path, resume, and bookmark journeys.

### Fixed

- Prevented duplicate YouTube player creation during React Strict Mode effect replay, avoiding unexpected playback resets.

## 2026-10-10

### Added

- Added the learner-owned paths dashboard and a dedicated path-creation route.
- Added path dismissal and exclusion behavior for unsuitable videos.
- Added return-path navigation and clearer **Resume path** language.

## Change-log rules

- Use the date the change is delivered to `main`.
- Describe the user-visible behavior first, then the implementation detail when it matters.
- Keep entries short and link to the relevant commit or documentation when useful.
- Record deferred or unfinished work in `backlog.md`, rather than listing it as completed here.
