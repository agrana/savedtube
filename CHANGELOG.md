# SavedTube Change Log

This file records user-visible product changes and meaningful engineering changes. Each completed feature slice gets an entry when it is delivered. Deferred ideas and unfinished work belong in [`backlog.md`](backlog.md).

## 2026-10-18

### Added

- Path lessons watched to a natural YouTube end keep a persistent green finished checkmark on the path map, lesson list, and watch sequence. Watched completion is device-local (account + path scoped in browser storage), separate from practiced/mastery, and independent of practice-interval loop ends.

### Fixed

- Finished lessons reopen at 0:00; unfinished lessons still resume the last saved position. Near-end resume seeks no longer spuriously mark finished or auto-skip to the next lesson. Explicit map/list selection always opens the requested video, even when it is already finished. Resume path keeps a dedicated resume-intent target.
- Watch playback identity (YouTube id + path membership) now gates resume seeks, leave-save, and ENDED handling so a prior timestamp or completion cannot apply to the next lesson — including the same YouTube id under a different path membership. Finished navigation always seeks to 0:00 explicitly; the player remounts per membership.

## 2026-10-17

### Fixed

- Classified YouTube Data API failures from allowlisted upstream status/reason instead of mapping every 403 to quota and collapsing other errors into a generic search failure. Public messages now distinguish expired sign-in, quota vs permission/access, rate limits, transient 5xx/network, and timeouts. Structured logs keep only allowlisted fields (no raw provider bodies, URLs, or tokens). Transient 5xx/429/network failures use a small bounded retry with Retry-After capped to the request deadline; auth, quota, and permission failures fail fast without climbing the research query ladder.

### Changed

- Renamed path detail **Regenerate draft** to **Regenerate**. The control now opens the path creation form prefilled from the authenticated owned path id (`fromPath`) with the original stored goal prompt and Level / Max length / Style — no research call on click. Explicit submit updates the same path then researches; fresh-create drafts stay compatible. Invalid, unauthorized, or missing source paths fail closed without an empty create. Research idempotency keys are scoped to a form-visit intent plus the canonical edited goal/preferences (retries reuse; edited settings or a new visit mint a fresh key; terminal success/failure clears). Switching from regenerate to fresh `/paths/new` without a stored draft clears the old goal and preferences. Regenerating a legacy free-text background path preserves that text in an optional `legacyBackground` field on the structured preferences envelope so research still receives it.

### Fixed

- Restored niche YouTube search recall when Level/Style preferences would otherwise dilute entity queries. Research now searches base topic/entity queries first, optionally tries preference-enriched soft-bias queries, then a bounded broader entity-preserving fallback, while keeping max video length as a hard verified-metadata filter and distinguishing topic misses from duration exclusions and upstream API failures.

### Changed

- Raised the daily research/generation budget to 50 units for one explicitly authorized account only, matched server-side by SHA-256 digest of the normalized session email. Default per-user (10) and project (200) caps are unchanged; missing session email fails closed to the default.

### Added

- Replaced free-text background on path creation with structured learning preferences: Level (Beginner / Intermediate / Advanced), Max length per video (No limit, 5–60 minutes), and Style (Corporate / Fun / Academic). Preferences validate server-side, persist without a schema migration, steer planning/search/selection, and enforce duration caps from verified YouTube metadata. Regeneration reuses stored preferences; legacy free-text background paths keep working.

### Changed

- Hid the path sequence editor behind an **Edit sequence** disclosure next to **Regenerate**, so the map stays primary while editing remains available on demand with Done to close.

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
