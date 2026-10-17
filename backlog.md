# SavedTube Backlog

This is the canonical list of unfinished, deferred, and deliberately pending SavedTube work. Completed changes belong in [`CHANGELOG.md`](CHANGELOG.md). Broader product direction remains in [`saved-tube.md`](saved-tube.md).

## Next product follow-ups

- [ ] Run a live browser/mobile verification pass for automatic resume and named bookmarks.
- [ ] Decide whether bookmarks should remain browser-local or sync through the authenticated backend for cross-device access.
- [ ] Add automated coverage for bookmark creation, naming, renaming, jumping, deletion, reload persistence, and video isolation.
- [ ] Review whether bookmark access belongs anywhere beyond the watch page, such as path detail or learner progress surfaces.

## Deferred enhancements

- [ ] Evaluate Media Session support for lock-screen play/pause, seek, and track controls. This is intentionally deferred; the current YouTube iframe remains unchanged.
- [ ] Investigate a product-safe background-listening experience only if the media delivery and platform-policy constraints support it.

## UX and quality follow-ups

- [ ] Complete the remaining full-duration YouTube playback and playback-reset regression checks recorded in [`docs/ux-audit-2026-10-10.md`](docs/ux-audit-2026-10-10.md).
- [ ] Expand route and end-to-end learning-flow coverage.
- [ ] Improve research observability beyond YouTube adapter classification (model/provider phases, job timeline UX). YouTube status/reason allowlisting and typed public messages shipped 2026-10-17; production root cause for recurring search failures remains unverified until read-only Vercel logs are available (local CLI was logged out; `VERCEL_TOKEN` exists only as a GitHub Actions secret and was not used).
- [ ] After Vercel production log access is available, confirm the dominant allowlisted YouTube reason/status for recent search failures and only then consider auth-refresh follow-ups if evidence shows expiry.
- [ ] Optionally add live read-only YouTube discovery smoke coverage for niche entity recall once a non-mutating API credential path is available in CI or local agent environments.

## Product-direction follow-ups

- [ ] Improve path-generation quality with clearer prerequisite and mastery heuristics.
- [ ] Make stage purpose, expected outcome, and estimated effort more explicit.
- [ ] Optionally let learners edit Level / Max length / Style after create without regenerating from scratch.
- [ ] Consider a dedicated preferences column if background dual-use (legacy text vs structured JSON) becomes operationally awkward.
- [ ] Map review slice 2: restore and clearly present the learner's saved position on return; separate implementation and human review gate.
- [ ] Map review slice 3: restrained completion / progress celebration cues; separate implementation and human review gate.
- [ ] Polish long desktop stage headings and cramped lesson metadata identified in slice 1 visual review.
- [ ] Explore richer path-map relationships and navigation beyond the map-first sequential lesson spine.
- [ ] Add stronger learner controls for stage ordering and video selection.
- [ ] Add progress summaries and a daily learning queue.
- [ ] Evaluate sharing or collaboration after the individual learning loop is strong.

## Backlog rules

- Keep one actionable idea per checkbox.
- Move completed items to `CHANGELOG.md` in the same delivery change.
- Add context or an evidence link when an item comes from a UX audit or user decision.
- Record deliberate deferrals here so they remain visible without implying that implementation has started.
