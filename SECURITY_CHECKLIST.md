# Security Checklist for SavedTube

**Last updated:** June 2026

## Pre-deployment checks

### Authentication and authorization

- [x] NextAuth.js with Google OAuth 2.0
- [x] JWT sessions (30-day max age)
- [x] Automatic Google access-token refresh (`src/lib/auth.ts`)
- [x] Server-side session validation in API routes
- [x] Middleware protection for `/dashboard`, `/p/*`, and selected API routes
- [ ] Migrate all mutations to Server Actions (dashboard and playlist pages still use API routes)

### Database security

- [x] Parameterized queries via Supabase client (no raw SQL in app code)
- [x] `user_id` filtering in API routes and server actions
- [ ] RLS enabled on application tables (currently disabled; auth is app-level with service role key)
- [x] Database schema managed via versioned migrations

### Input validation

- [x] Zod schema validation on API routes and server actions
- [x] YouTube ID format validation
- [x] Email format validation on waiting-list endpoint

### Security headers and CSP

- [x] `X-Frame-Options: DENY`
- [x] `X-Content-Type-Options: nosniff`
- [x] `Referrer-Policy: strict-origin-when-cross-origin`
- [x] Content Security Policy (middleware)
- [x] Permissions Policy

### Rate limiting

- [x] API rate limiting (in-memory, 100 req/min)
- [x] Auth rate limiting (5 attempts / 5 min)
- [x] Playlist-specific rate limiting (50 req/min)
- [ ] Redis-backed rate limiting for production multi-instance deploys

### Monitoring and logging

- [x] Security event logging (`src/lib/security-logger.ts`)
- [x] Auth failure tracking in server actions
- [ ] Centralized log aggregation in production

### Legal compliance

- [x] Privacy Policy (`/privacy`)
- [x] Terms of Service (`/terms`)
- [x] Footer links to legal pages
- [x] Support contact (`support@savedtube.com`)

## Deployment steps

### 1. Apply database migrations

```bash
# Local / manual
supabase link --project-ref your-project-ref
supabase db push

# CI: migrations deploy automatically on push to main
# via .github/workflows/migrations-validate.yml
```

### 2. Environment variables

Set these in Vercel (and `.env.local` for local dev):

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

For CI migration deploys, also set GitHub secrets:

```env
SUPABASE_ACCESS_TOKEN=
SUPABASE_DB_URL=
```

### 3. Deploy

Push to `main` and let Vercel deploy, or trigger a manual deploy from the Vercel dashboard.

## Post-deployment verification

### Authentication

- [ ] Google OAuth sign-in works
- [ ] Session persists across page reloads
- [ ] Token refresh works after access token expiry
- [ ] Logout clears session
- [ ] Unauthenticated users are redirected from protected routes

### API and data isolation

- [ ] Users can only read/write their own progress, intervals, and playlist edits
- [ ] Invalid YouTube IDs and malformed payloads return 400
- [ ] Unauthorized requests return 401

### Rate limiting

- [ ] Excessive API calls return 429 with rate-limit headers

### Security headers

- [ ] Responses include CSP and frame-protection headers

### Core flows

- [ ] Dashboard loads playlists
- [ ] Playlist detail shows videos and progress
- [ ] Watch page plays video and saves intervals
- [ ] Hidden playlists toggle works

## Ongoing maintenance

### Weekly

- [ ] Review application logs for auth failures and errors
- [ ] Check Vercel deployment health

### Monthly

- [ ] Run `npm audit` and update dependencies
- [ ] Verify migrations are in sync across environments

### Quarterly

- [ ] Review auth and data-access patterns
- [ ] Re-evaluate RLS vs app-level authorization strategy
- [ ] Update this checklist and related docs

## Incident response

1. **Contain** — disable affected routes or rotate compromised secrets.
2. **Investigate** — review Vercel logs and Supabase query logs.
3. **Remediate** — patch, redeploy, notify affected users if needed.
4. **Document** — record timeline, root cause, and follow-up actions.

## Security contacts

Update these with your team's actual contacts:

- **Security**: [your-security-email]
- **Bug reports**: [your-security-email]
- **Support**: support@savedtube.com
