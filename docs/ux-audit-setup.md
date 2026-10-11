# SavedTube UX audit setup

This setup supports repeatable checks for the authenticated path journey described in `ux-audit-2026-10-10.md`.

## Local authenticated audit

1. Copy the repository's example environment file to a local-only environment file when one is present.
2. Configure the NextAuth URL, the NextAuth secret, and the Google OAuth client values in the local environment. Keep all values outside tracked files and chat messages.
3. Start the application with `npm run dev`.
4. Confirm that `/api/auth/providers` returns the configured provider list before opening `/paths` or `/paths/new`.
5. Sign in through the local Google flow, then run the path charter with a disposable learning goal.
6. Remove or restore the disposable path content after the audit where the product supports it.

The local authenticated journey is ready when `/paths` renders the dashboard and `/paths/new` renders the goal form instead of the NextAuth `Configuration` error. The production-session audit remains a valid alternate path when local OAuth credentials are unavailable.

## Resume-flow charter

Use a disposable video or path and verify the complete return habit:

1. Open a path video and play beyond the first few seconds.
2. Add a bookmark at the current player time.
3. Move to another moment and add a second bookmark.
4. Select each bookmark and confirm the player jumps to its saved time.
5. Return to the path with **← Path**.
6. Open the same video again and confirm it resumes near the last playback position.
7. Leave the path, reopen it from `/paths`, and select **Resume path**.
8. Confirm the path remains available, the video starts near the saved position, and Previous/Next navigation still returns to the path context.
9. Repeat after a reload and after opening a different video.

The resume point and bookmarks are browser-local preferences keyed to the YouTube video. They do not change practiced state, path order, exclusions, or shared path data.

## Evidence to record

For each run, record the route, visible status, selected video, saved return position, reload result, and any browser-console or network error. Keep credentials, cookies, OAuth tokens, and personal video data out of the audit document.
