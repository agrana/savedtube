## Database migrations (Supabase)

Migrations are stored in `supabase/migrations/`.

### CI/CD

The workflow in `.github/workflows/migrations-validate.yml` runs on:

- **Pull requests** to `main` (when migration files change)
- **Pushes** to `main` (when migration files change)
- **Manual dispatch** (`workflow_dispatch`)

It performs two jobs:

1. **Validate** — starts a local Supabase stack, runs `supabase db reset` to apply all migrations, then tears down.
2. **Deploy** — on push to `main` (or manual dispatch), applies migrations to production via `supabase db push --db-url` using the `SUPABASE_DB_URL` GitHub secret.

There is no separate staging environment in the current workflow.

### Required GitHub secrets

| Secret | Purpose |
|--------|---------|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI authentication |
| `SUPABASE_DB_URL` | Direct Postgres connection string for production (`sslmode=require`) |

### Commands

```bash
supabase migration new <name>   # Create a new migration file
supabase db push                # Apply migrations to the linked remote project
supabase db diff                # Compare local schema vs remote
supabase db reset               # Reset local DB and re-apply all migrations
```

### Auth note

SavedTube uses **NextAuth** for authentication, not Supabase Auth. Migrations create tables with TEXT `user_id` columns matching NextAuth user IDs. Authorization is enforced in the Next.js API layer.
