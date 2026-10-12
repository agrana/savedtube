# SavedTube Change Log

This file records user-visible product changes and meaningful engineering changes. Each completed feature slice gets an entry when it is delivered. Deferred ideas and unfinished work belong in [`backlog.md`](backlog.md).

## 2026-10-11

### Fixed

- Made the explicit Google YouTube reconnect flow request offline access and fresh consent, so an existing SavedTube session can recover an expired or missing YouTube authorization without treating the user as logged out.
- Prevented the five-minute authentication refresh from unmounting and restarting the active YouTube player.

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
