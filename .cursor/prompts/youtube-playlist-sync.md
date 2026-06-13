# YouTube Playlist Sync — Current State

**Last updated:** June 2026

## Architecture

- **Auth**: NextAuth.js with Google OAuth and automatic token refresh
- **YouTube API**: Server-side calls in API routes using the session access token
- **Database**: Supabase Postgres with app-level `user_id` filtering (service role key on server)
- **User IDs**: TEXT (NextAuth `sub`), not Supabase Auth UUIDs

## API Endpoints

### GET /api/playlists

Fetches the signed-in user's YouTube playlists (`mine=true`). Supports `q` (search) and `pageToken`.

### GET /api/playlist-items?playlistId=...&sort=...

Fetches playlist videos merged with per-user edits from `playlist_item_edits`. Sort modes: `custom`, `date_desc`, `date_asc`, `alpha_asc`, `alpha_desc`.

### POST /api/playlist-items

Playlist edit actions: `remove`, `reorder`, `add` (by YouTube URL).

### GET/POST /api/progress

Read and update watched/unwatched status per video.

### GET/POST /api/hidden-playlists

Read hidden playlist IDs and toggle visibility.

### GET/POST/PATCH/DELETE /api/vid-intervals

CRUD for practice intervals on a video.

### POST /api/vid-intervals/import

Import intervals from YouTube chapter data.

## Frontend Pages

| Route | Status |
|-------|--------|
| `/dashboard` | Playlist browser with search and hide/show |
| `/p/[playlistId]` | Video list, progress toggles, sorting, editing |
| `/watch/[videoId]` | YouTube player, interval manager, loop playback, prev/next navigation |

## Database Tables

- `playlist_progress` — watched status
- `hidden_playlists` — dashboard visibility preferences
- `playlist_item_edits` — reorder, soft-remove, manual additions
- `video_intervals` — practice loop start/end times with optional names

RLS is disabled on these tables; authorization is enforced in API routes via NextAuth session checks.

## Server Actions (partial)

`src/lib/actions.ts` provides server-action alternatives for progress and hidden-playlist mutations. The dashboard and playlist pages still use API routes via `fetch`.

## Shared module note

`src/lib/youtube-server.ts` duplicates YouTube fetch logic but is not yet used by the API routes.
