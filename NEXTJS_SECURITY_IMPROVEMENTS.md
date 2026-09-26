# Next.js Data Security

Overview of security patterns in SavedTube, aligned with the [Next.js Data Security Guide](https://nextjs.org/docs/app/guides/data-security).

**Last updated:** September 2026

## Architecture

| Layer | Implementation |
|-------|----------------|
| Authentication | NextAuth.js (Google OAuth, JWT sessions) |
| Data access | API routes with session checks + Supabase service role |
| Database | Supabase Postgres; app-level `user_id` filtering |

UI pages (`/dashboard`, `/p/[playlistId]`, `/watch/[videoId]`) call API routes via `fetch`.

## Implemented

### 1. NextAuth session validation

All protected API routes call `getServerSession(authOptions)` and return 401 when unauthenticated. Middleware additionally guards `/dashboard`, `/p/*`, and selected `/api/*` paths.

### 2. Input validation (Zod)

Schemas in `src/lib/validation.ts` validate progress payloads and YouTube URL/video IDs. The vid-intervals routes define their own Zod schemas inline.

### 3. Security middleware

`src/middleware.ts` applies:

- Auth gate via `next-auth/middleware`
- Rate limiting on `/api/*` routes
- Security headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP

### 4. Environment validation

`src/lib/config.ts` validates required env vars at server startup.

### 5. Server-side YouTube API

YouTube Data API calls run in API routes (`/api/playlists`, `/api/playlist-items`) using the session access token.

## Row Level Security

RLS is **disabled** on most application tables (`playlist_progress`, `hidden_playlists`, `video_intervals`, `playlist_item_edits`). Authorization relies on NextAuth session checks and explicit `user_id` filtering with the service role key.

## File reference

```
src/
├── lib/
│   ├── auth.ts                 # NextAuth + token refresh
│   ├── config.ts               # Env validation
│   ├── supabase.ts             # Supabase clients
│   ├── validation.ts           # Zod schemas
│   └── rate-limit.ts           # In-memory rate limiter
└── middleware.ts               # Auth, rate limit, headers
```

## Recommended next steps

1. Decide on RLS vs app-level auth and document the chosen model consistently.
2. Replace in-memory rate limiting with Redis for multi-instance Vercel deployments.
3. Add automated tests for validation schemas and API auth guards.

## Resources

- [Next.js Data Security Guide](https://nextjs.org/docs/app/guides/data-security)
- [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions)
- [Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
