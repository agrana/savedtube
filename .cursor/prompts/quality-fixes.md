# Code Quality Notes

**Last updated:** September 2026

## Current state

| Area | Status |
|------|--------|
| Next.js | 15.4.10 with App Router and Turbopack dev server |
| Auth | NextAuth with Google OAuth and token refresh (`src/lib/auth.ts`) |
| Env validation | `src/lib/config.ts` validates required vars at startup |
| Data access | API routes with session checks (single pattern) |
| Type checking | `npm run type-check` (`tsc --noEmit`) |
| Linting | ESLint + Prettier via lint-staged and husky |
| Config files | Single `next.config.js` (no duplicate) |
| Tests | `npm test` is a placeholder — no test suite yet |

## Remaining improvements

### 1. Testing

Add a test framework (Vitest or Jest) and cover:

- Zod validation schemas
- API route auth guards
- Token refresh logic in `auth.ts`

### 2. Rate limiting

In-memory rate limiter (`src/lib/rate-limit.ts`) does not persist across Vercel instances. Use Redis (e.g. Upstash) for production.

### 3. RLS strategy

Most tables have RLS disabled with app-level auth via service role key. Document and stick to one approach; enabling RLS would require passing NextAuth JWT claims to Supabase.

## Local QA

See [LOCAL_ERROR_CHECKING.md](../../LOCAL_ERROR_CHECKING.md) for the pre-commit workflow.

```bash
npm run check-all   # lint + type-check + build
```
