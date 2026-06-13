# SavedTube

A quiet YouTube practice studio for precise loops and focused sessions. Import your saved playlists, mark the useful parts of each video, and return to them for deliberate practice.

## Features

- Google OAuth sign-in with YouTube Data API access (NextAuth.js)
- Dashboard to browse, search, and hide/show your YouTube playlists
- Playlist detail view with watched/unwatched progress tracking
- Per-user playlist edits: reorder videos, soft-remove items, add videos by URL
- Distraction-reduced watch page with the YouTube IFrame Player API
- Practice intervals: define start/end loops, rename them, loop playback, import from YouTube chapters
- Legal pages: Privacy Policy and Terms of Service
- Security middleware: auth protection, rate limiting, CSP and security headers

## Tech Stack

- **Frontend**: Next.js 15 (App Router, Turbopack dev server), React 19, TypeScript, Tailwind CSS 4
- **Authentication**: NextAuth.js with Google OAuth and JWT sessions
- **Database**: Supabase (PostgreSQL) — used as Postgres only, not Supabase Auth
- **Validation**: Zod
- **Deployment**: Vercel

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Landing page
│   ├── dashboard/page.tsx          # Playlist browser
│   ├── p/[playlistId]/page.tsx     # Playlist detail
│   ├── watch/[videoId]/page.tsx    # Video player + intervals
│   ├── privacy/page.tsx
│   ├── terms/page.tsx
│   └── api/                        # API routes (see below)
├── components/                     # UI components
└── lib/
    ├── auth.ts                     # NextAuth config + token refresh
    ├── supabase.ts                 # Supabase client (service role on server)
    ├── actions.ts                  # Server Actions (partial adoption)
    ├── validation.ts               # Zod schemas
    └── config.ts                   # Env var validation
supabase/migrations/                # Versioned database schema
terraform/                          # Cloudflare DNS, email routing, Vercel domain
```

## API Routes

| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers |
| `/api/playlists` | GET | Fetch user's YouTube playlists |
| `/api/playlist-items` | GET, POST | Fetch playlist videos; reorder, remove, add |
| `/api/progress` | GET, POST | Read/update watched status |
| `/api/hidden-playlists` | GET, POST | Hide or show playlists on dashboard |
| `/api/vid-intervals` | GET, POST, PATCH, DELETE | CRUD for practice intervals |
| `/api/vid-intervals/import` | POST | Import intervals from YouTube chapters |
| `/api/waiting-list` | POST | Collect waiting-list emails |

Server Actions in `src/lib/actions.ts` provide an alternative path for progress and hidden-playlist mutations, but the dashboard and playlist pages currently use the API routes above.

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase CLI (for migrations)
- Google Cloud Console project with OAuth credentials
- Vercel account (for deployment)

### 1. Clone and install

```bash
git clone <your-repo-url>
cd savedtube
npm install
```

### 2. Environment variables

```bash
cp env.example .env.local
```

Required variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Generate with `openssl rand -base64 32` |
| `NEXTAUTH_URL` | App URL (`http://localhost:3000` for local dev) |

All required variables are validated at startup via `src/lib/config.ts`.

### 3. Supabase database

```bash
# Link to your Supabase project
supabase link --project-ref your-project-ref

# Apply migrations
supabase db push
```

See [supabase/README.md](supabase/README.md) for migration workflow and CI details.

Authentication is handled by **NextAuth**, not Supabase Auth. You do not need to enable Google in the Supabase dashboard.

### 4. Google OAuth setup

1. Create a Google Cloud project and enable **YouTube Data API v3**.
2. Create OAuth 2.0 credentials (Web application).
3. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-domain.com/api/auth/callback/google` (production)
4. Configure the OAuth consent screen with scopes:
   - `openid`, `email`, `profile`
   - `https://www.googleapis.com/auth/youtube.readonly`

### 5. Run locally

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000).

### 6. Deploy to Vercel

1. Push to your Git remote.
2. Connect the repository in Vercel.
3. Add the environment variables from `.env.local`.
4. Deploy.

## Database Schema

Migrations live in `supabase/migrations/`. Main tables:

| Table | Purpose |
|-------|---------|
| `profiles` | User profile linked to Supabase Auth users (legacy; app auth is NextAuth) |
| `playlist_progress` | Watched/unwatched status per user, playlist, and video |
| `hidden_playlists` | Playlists a user has hidden from the dashboard |
| `video_intervals` | Practice loop start/end times per user and video |
| `playlist_item_edits` | Per-user reorder, soft-remove, and manual video additions |
| `waiting_list` | Email signups |

User IDs are stored as **TEXT** (NextAuth `sub` claim), not UUIDs. Authorization is enforced in API routes and server actions via NextAuth session checks. The server uses the Supabase **service role key** and filters by `user_id` in application code. RLS is disabled on most application tables.

## Security

- NextAuth JWT sessions (30-day max age) with automatic Google token refresh
- Middleware protects `/dashboard`, `/p/*`, and selected `/api/*` routes
- Rate limiting on API routes (in-memory; use Redis for multi-instance production)
- Zod input validation on API routes and server actions
- Security headers and Content Security Policy via middleware
- Privacy Policy (`/privacy`) and Terms of Service (`/terms`)

See [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) and [NEXTJS_SECURITY_IMPROVEMENTS.md](NEXTJS_SECURITY_IMPROVEMENTS.md) for details and deployment checks.

## Development Scripts

```bash
npm run dev            # Start dev server (Turbopack)
npm run build          # Production build
npm run lint           # ESLint
npm run type-check     # TypeScript check
npm run check-all      # lint + type-check + build
npm run pre-commit-full  # Full pre-commit script
```

See [LOCAL_ERROR_CHECKING.md](LOCAL_ERROR_CHECKING.md) for the local QA workflow.

## Infrastructure

Terraform configs in `terraform/` manage Cloudflare DNS, email forwarding, Vercel custom domain, and Supabase project references. See [terraform/README.md](terraform/README.md).

## License

MIT — see [LICENSE](LICENSE).
