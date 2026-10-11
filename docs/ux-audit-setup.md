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
2. Select **Start from here next time**.
3. Return to the path with **← Path**.
4. Open the same video again and confirm playback seeks to the saved point.
5. Leave the path, reopen it from `/paths`, and select **Resume path**.
6. Confirm the path remains available, the video starts at the saved point, and Previous/Next navigation still returns to the path context.
7. Repeat after a reload and after opening a different video.

The resume point is a browser-local preference keyed to the YouTube video. It does not change practiced state, path order, exclusions, or shared path data.

## Evidence to record

For each run, record the route, visible status, selected video, saved return position, reload result, and any browser-console or network error. Keep credentials, cookies, OAuth tokens, and personal video data out of the audit document.
