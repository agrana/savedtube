# Code Quality Notes

**Last updated:** June 2026

## Current state

| Area | Status |
|------|--------|
| Next.js | 15.4.10 with App Router and Turbopack dev server |
| Auth | NextAuth with Google OAuth and token refresh (`src/lib/auth.ts`) |
| Env validation | `src/lib/config.ts` validates required vars at startup |
| Type checking | `npm run type-check` (`tsc --noEmit`) |
| Linting | ESLint + Prettier via lint-staged and husky |
| Config files | Single `next.config.js` (no duplicate) |
| Tests | `npm test` is a placeholder — no test suite yet |

## Remaining improvements

### 1. Consolidate data access

Dashboard and playlist pages use client-side `fetch` to API routes. Server Actions and Server Components (`ServerPlaylistProgress`) exist but are not fully adopted. Pick one pattern and migrate.

### 2. Deduplicate YouTube API logic

`src/lib/youtube-server.ts` mirrors logic in `/api/playlists` and `/api/playlist-items`. Either adopt the shared module or remove it.

### 3. Testing

Add a test framework (Vitest or Jest) and cover:

- Zod validation schemas
- API route auth guards
- Token refresh logic in `auth.ts`

### 4. Rate limiting

In-memory rate limiter (`src/lib/rate-limit.ts`) does not persist across Vercel instances. Use Redis (e.g. Upstash) for production.

### 5. Unused code

- `WaitingListForm` component (API route exists, component unused)
- `ServerPlaylistProgress` component (not imported)
- `src/lib/csrf.ts` (not wired into actions)

Remove or integrate these to reduce confusion.

### 6. RLS strategy

Most tables have RLS disabled with app-level auth via service role key. Document and stick to one approach; enabling RLS would require passing NextAuth JWT claims to Supabase.

## Local QA

See [LOCAL_ERROR_CHECKING.md](../../LOCAL_ERROR_CHECKING.md) for the pre-commit workflow.

```bash
npm run check-all   # lint + type-check + build
```
