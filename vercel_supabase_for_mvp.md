> **Historical document.** This was an early MVP planning roadmap. The app has since been built and evolved beyond Phase 1. For current setup and architecture, see [README.md](README.md).

# MVP Roadmap (Archived)

SavedTube shipped on **Vercel + Supabase (Postgres) + NextAuth**. The original phases were:

| Phase | Planned | Actual status |
|-------|---------|---------------|
| 1 — Foundation | Auth, dashboard, deploy | Done |
| 2 — Sync engine | YouTube playlist sync | Done (API routes) |
| 3 — Sharing | Community features | Not started |
| 4 — AI tagging | Auto-categorization | Not started |
| 5 — Polish | Security hardening | Partially done |

## What was built instead of the original plan

The product pivoted to a **practice-loops studio**:

- Practice intervals with loop playback (`video_intervals` table)
- Playlist editing (reorder, remove, add videos)
- Hidden playlists
- Named intervals and YouTube chapter import

Auth uses **NextAuth** (not Supabase Auth). The database uses TEXT `user_id` columns for NextAuth user IDs.

## Current documentation

- [README.md](README.md) — setup, features, API routes, schema
- [supabase/README.md](supabase/README.md) — migrations and CI
- [SECURITY_CHECKLIST.md](SECURITY_CHECKLIST.md) — deployment checks
- [NEXTJS_SECURITY_IMPROVEMENTS.md](NEXTJS_SECURITY_IMPROVEMENTS.md) — security architecture

## Original CI proposal vs actual

The roadmap proposed separate `migrations-validate.yml` and `migrations-deploy.yml` workflows with a staging environment. The implemented workflow (`.github/workflows/migrations-validate.yml`) combines validation and production deploy in a single file with no staging step.
