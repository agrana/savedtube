Short answer: you can ship the **full MVP** on **Vercel + Supabase**—UI, OAuth, sync, AI tagging, realtime, storage—*without* spinning up your own AWS. There are a few caveats (long-running jobs & API quotas), but all are workable.

# Roadmap for MVP (Vercel + Supabase)

## Phase 1 — Foundation (Week 1-2)

> Goal: Log in with Google, land on a minimal dashboard, have Supabase project + schema + RLS in place, and deploy to Vercel with envs configured.

### 1) Supabase project & auth

-

### 2) Database: minimal schema + RLS

Instead of keeping schema only in Supabase SQL editor, save it in code so it can be version-controlled and migrated.

**Option A — Supabase Migrations**

- Run `supabase init` in your repo.
- Use `supabase migration new profiles` to generate migration files.
- Place the schema SQL in `supabase/migrations/<timestamp>_profiles.sql`.
- Commit to git so schema changes are tracked.

**Option B — SQL files in repo**

- Create `db/schema.sql` and put all `CREATE TABLE` + RLS policies there.
- Run `supabase db reset` or `supabase db push` to apply.

Run this migration in your repo\:sql create table if not exists public.profiles ( id uuid primary key references auth.users(id) on delete cascade, username text unique, avatar\_url text, created\_at timestamptz default now() );

alter table public.profiles enable row level security; create policy "profiles are self readable" on public.profiles for select using (auth.uid() = id); create policy "profiles are self writable" on public.profiles for insert with check (auth.uid() = id) using (auth.uid() = id);

````

### 3) Repo & Next.js app (local)

-

```ts
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
````

### 4) NextAuth (Google with YouTube scope)

-

```ts
import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
          access_type: 'offline',       // refresh tokens
          prompt: 'consent',
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
})
export { handler as GET, handler as POST }
```

-

```ts
export { default } from 'next-auth/middleware'
export const config = { matcher: ['/dashboard'] }
```

### 5) Minimal UI

-

```tsx
import { signIn } from 'next-auth/react'
export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-3xl font-bold">SavedTube</h1>
        <p className="opacity-80">Distraction-free player for your saved YouTube playlists.</p>
        <button onClick={() => signIn('google')} className="px-4 py-2 rounded-xl border">Sign in with Google</button>
      </div>
    </main>
  )
}
```

-

```tsx
'use client'
import { useSession, signOut } from 'next-auth/react'
export default function Dashboard() {
  const { data } = useSession()
  return (
    <main className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <button onClick={() => signOut()} className="px-3 py-1 rounded border">Sign out</button>
      </div>
      <pre className="p-4 bg-black/5 rounded">{JSON.stringify({ user: data?.user }, null, 2)}</pre>
      <p className="opacity-70">Next: wire playlist fetch & storage.</p>
    </main>
  )
}
```

### 6) Environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=openssl rand -base64 32
```

### 7) Vercel project

-

### 8) Success criteria for Phase 1

-

---

### Phase 1 — Copy/Paste Kit

> Drop these files directly in the repo to accelerate setup.

``\*\* (key scripts only)\*\*

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

``

```tsx
import './globals.css'
import { ReactNode } from 'react'
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">{children}</body>
    </html>
  )
}
```

`` (Tailwind base)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

``

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
```

``

```
.node_modules
.next
.env*
.vercel
```

``\*\* (starter)\*\*

```md
# SavedTube
Distraction-free YouTube playlist player. Built with Next.js (Vercel) + Supabase.

## Getting Started
1. Copy `.env.example` to `.env.local` and fill values.
2. `npm install && npm run dev`
3. Run the SQL in the roadmap to create `profiles`.

## Phase 1 Goals
- Google sign-in → `/dashboard`.
- RLS-protected `profiles` table.
- Deployed on Vercel.
```

---

### GitHub Issues — Phase 1 (copy-ready)

Create issues with these titles/descriptions:

1. **Supabase project & URL config** — Create project, set `SITE_URL` for local/prod.
2. **Enable Google provider in Supabase** — Turn on Google, record client ID/secret.
3. **Create Google OAuth credentials** — Web app, add redirect URIs for local/prod.
4. **Scopes & consent screen** — Add `openid email profile youtube.readonly`.
5. **Create **``** table + RLS** — Run provided SQL and verify policies.
6. **Bootstrap Next.js app** — Create app with Tailwind/TypeScript/App Router.
7. **Install client libraries** — `@supabase/supabase-js`, `next-auth`.
8. **Add NextAuth route handler** — `app/api/auth/[...nextauth]/route.ts` with scopes.
9. \*\*Middleware for \*\*`` — Protect dashboard route (optional).
10. **Landing page + sign-in** — `app/page.tsx` minimal layout.
11. **Dashboard stub** — show session JSON and sign-out button.
12. **Env vars** — `.env.local` + Vercel envs.
13. **Deploy to Vercel** — Verify login works in production.

---

---

# CI/CD for Supabase migrations

Add these workflow files to `.github/workflows/`.

### 1. Validate migrations on PRs

`.github/workflows/migrations-validate.yml`

```yaml
name: Validate Supabase migrations

on:
  pull_request:
    branches: [ main ]

jobs:
  validate:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports: ["5432:5432"]
        options: >-
          --health-cmd="pg_isready -U postgres"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=5

    env:
      LOCAL_DB_URL: postgresql://postgres:postgres@localhost:5432/postgres?sslmode=disable

    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Push migrations to ephemeral DB
        run: supabase db push --db-url "${LOCAL_DB_URL}"

      - name: Dump schema snapshot
        run: supabase db dump --db-url "${LOCAL_DB_URL}" --schema-only > db/schema.sql

      - name: Upload schema snapshot
        uses: actions/upload-artifact@v4
        with:
          name: schema-snapshot
          path: db/schema.sql
```

### 2. Deploy migrations to staging & prod

`.github/workflows/migrations-deploy.yml`

```yaml
name: Deploy Supabase migrations

on:
  push:
    branches: [ main ]
  workflow_dispatch:
    inputs:
      target:
        description: "Target environment"
        type: choice
        required: true
        options: [staging, production]
        default: staging
  release:
    types: [published]

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.target == 'production' || github.event_name == 'release' && 'production' || 'staging' }}

    env:
      DB_URL: ${{ inputs.target == 'production' && secrets.SUPABASE_DB_URL_PROD || secrets.SUPABASE_DB_URL_STAGING }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Set DB_URL for release events
        if: ${{ github.event_name == 'release' }}
        run: echo "DB_URL=${{ secrets.SUPABASE_DB_URL_PROD }}" >> $GITHUB_ENV

      - name: Safety check
        run: |
          echo "Deploying migrations to: ${{ env.DB_URL }}"
          echo "Host: $(echo '${{ env.DB_URL }}' | sed -E 's#postgresql://[^@]+@([^:/]+).*#\1#')"

      - name: Push migrations
        run: supabase db push --db-url "${DB_URL}"
```

### README section (add to repo)

```md
## Database migrations (Supabase)

Migrations are stored in `supabase/migrations/`.

- **Validate on PR**: migrations are applied to an ephemeral Postgres container to catch errors.
- **Staging deploy**: when `main` is updated, migrations are pushed to staging DB.
- **Production deploy**: happens on GitHub Release or manual workflow dispatch with approval.

### Commands
- `supabase migration new <name>` → create a migration file.
- `supabase db push` → apply migrations to target DB.
- `supabase db diff` → compare local vs. remote.
```

---

## Phase 2 — Sync Engine (Week 3-4) — Sync Engine (Week 3-4)

-

## Phase 3 — Sharing & Community (Week 5-6)

-

## Phase 4 — AI Tagging & Search (Week 7-8)

-

## Phase 5 — Polish & Security (Week 9-10)

-

---

# What works well on Vercel + Supabase

- **Web app + API**: Next.js on Vercel for the app and lightweight API routes. Scheduled syncs via **Vercel Cron**.
- **Database + vectors**: Supabase Postgres + **pgvector** for embeddings.
- **Background jobs**: Supabase Cron + Edge Functions for syncs & tagging.
- **Security**: RLS + Supabase Auth.
- **Realtime UX**: Supabase Realtime subscriptions.
- **File storage**: Supabase Storage (private buckets + signed URLs).
- **YouTube integration**: official endpoints (`playlists`, `playlistItems`, `liked videos`).

# Caveats (and mitigations)

- **Vercel function limits** → offload long-running tasks to Supabase Edge Functions.
- **YouTube API quotas** → incremental syncs, stagger schedules, ETag caching.

# Deployment Plan (MVP)

(see detailed schema, env vars, cron schedules, API routes, Ed
