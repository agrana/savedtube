# Next.js Data Security

Overview of security patterns in SavedTube, aligned with the [Next.js Data Security Guide](https://nextjs.org/docs/app/guides/data-security).

**Last updated:** June 2026

## Architecture

SavedTube uses a **hybrid** approach:

| Layer | Implementation |
|-------|----------------|
| Authentication | NextAuth.js (Google OAuth, JWT sessions) |
| Data access (primary) | API routes with session checks + Supabase service role |
| Data mutations (partial) | Server Actions in `src/lib/actions.ts` |
| Database | Supabase Postgres; app-level `user_id` filtering |

Most UI pages (`/dashboard`, `/p/[playlistId]`, `/watch/[videoId]`) call API routes via `fetch`. Server Actions exist for progress and hidden-playlist mutations but are not yet used by all pages.

## Implemented

### 1. NextAuth session validation

All protected API routes call `getServerSession(authOptions)` and return 401 when unauthenticated. Middleware additionally guards `/dashboard`, `/p/*`, and selected `/api/*` paths.

### 2. Server Actions (partial)

`src/lib/actions.ts` provides:

- `updateVideoProgress` — upsert watched status
- `togglePlaylistVisibility` — hide/show playlists
- `getUserProgress` / `getHiddenPlaylists` — server-side reads

`ProgressToggle` uses the `updateVideoProgress` server action, but the playlist page still posts to `/api/progress`. The dashboard uses `/api/hidden-playlists` instead of `togglePlaylistVisibility`.

### 3. Input validation (Zod)

Schemas in `src/lib/validation.ts` validate progress, hidden-playlist, and playlist-item payloads. The vid-intervals routes define their own Zod schemas inline.

### 4. Security middleware

`src/middleware.ts` applies:

- Auth gate via `next-auth/middleware`
- Rate limiting on `/api/*` routes
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP

### 5. Environment validation

`src/lib/config.ts` validates required env vars at server startup.

### 6. Security logging

`src/lib/security-logger.ts` records auth failures, validation failures, data access, and suspicious activity in server actions.

### 7. Server-side YouTube API

YouTube Data API calls run in API routes (`/api/playlists`, `/api/playlist-items`) using the session access token. A shared helper module (`src/lib/youtube-server.ts`) exists but is not yet adopted by the routes.

## Not fully implemented

### CSRF module (`src/lib/csrf.ts`)

A custom CSRF token helper exists but is **not wired** into server actions or API routes. Next.js Server Actions have built-in origin checking; the custom module is available for future use.

### Server Components for data fetching

`ServerPlaylistProgress` is implemented but **not imported** by any page. Pages fetch data client-side via API routes.

### Row Level Security

RLS is **disabled** on most application tables (`playlist_progress`, `hidden_playlists`, `video_intervals`, `playlist_item_edits`, `waiting_list`). Authorization relies on NextAuth session checks and explicit `user_id` filtering with the service role key.

## File reference

```
src/
├── lib/
│   ├── actions.ts              # Server Actions (partial adoption)
│   ├── auth.ts                 # NextAuth + token refresh
│   ├── csrf.ts                 # CSRF helpers (unused)
│   ├── config.ts               # Env validation
│   ├── supabase.ts             # Supabase clients
│   ├── validation.ts           # Zod schemas
│   ├── youtube-server.ts       # YouTube helper (unused by routes)
│   ├── rate-limit.ts           # In-memory rate limiter
│   └── security-logger.ts      # Security event logging
├── components/
│   ├── ServerPlaylistProgress.tsx  # Server Component (unused)
│   └── ProgressToggle.tsx          # Uses server action
└── middleware.ts               # Auth, rate limit, headers
```

## Recommended next steps

1. Migrate remaining client `fetch` calls to Server Actions or Server Components.
2. Either wire up `youtube-server.ts` in API routes or remove the duplicate.
3. Decide on RLS vs app-level auth and document the chosen model consistently.
4. Remove or integrate unused components (`ServerPlaylistProgress`, `ProgressToggle` where not used).
5. Replace in-memory rate limiting with Redis for multi-instance Vercel deployments.

## Resources

- [Next.js Data Security Guide](https://nextjs.org/docs/app/guides/data-security)
- [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions)
- [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
