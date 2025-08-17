## Database migrations (Supabase)

Migrations are stored in `supabase/migrations/`.

- **Validate on PR**: migrations are applied to an ephemeral Postgres container to catch errors.
- **Staging deploy**: when `main` is updated, migrations are pushed to staging DB.
- **Production deploy**: happens on GitHub Release or manual workflow dispatch with approval.

### Commands
- `supabase migration new <name>` → create a migration file.
- `supabase db push` → apply migrations to target DB.
- `supabase db diff` → compare local vs. remote.
