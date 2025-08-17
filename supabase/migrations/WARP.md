# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Repository Overview

This is the database migrations directory for the SavedTube project, a Supabase-powered application. The repository contains database migration management tools and CI/CD workflows for deploying schema changes across staging and production environments.

## Architecture

### Migration Management
- **Migrations Directory**: All Supabase migration files are stored in `supabase/migrations/`
- **Custom Migration Script**: `migrations.sh` provides convenient wrapper commands around Supabase CLI
- **Environment Configuration**: Requires `.env.local.db` file with database connection URLs for different environments

### Deployment Pipeline
- **Validation**: PRs automatically validate migrations against ephemeral Postgres containers
- **Staging**: Main branch pushes automatically deploy to staging database
- **Production**: Deployed via GitHub releases or manual workflow dispatch with approval gates

## Common Commands

### Migration Management
```bash
# Initialize Supabase in project
./migrations.sh init

# Create a new migration
./migrations.sh new "migration_name"

# Push migrations to staging
./migrations.sh push-stg

# Push migrations to production (with confirmation prompt)
./migrations.sh push-prod

# Dump staging schema to file
./migrations.sh dump-stg

# Dump production schema to file
./migrations.sh dump-prod
```

### Direct Supabase CLI Commands
```bash
# Create new migration
supabase migration new "migration_name"

# Apply migrations to target database
supabase db push --db-url "$DB_URL"

# Compare local vs remote schema differences
supabase db diff

# Dump schema from database
supabase db dump --db-url "$DB_URL" --schema-only > schema.sql
```

## Environment Setup

1. Create `.env.local.db` file in the migrations directory with:
   ```
   SUPABASE_DB_URL_STAGING=postgresql://...
   SUPABASE_DB_URL_PROD=postgresql://...
   ```

2. Install Supabase CLI:
   ```bash
   npm install -g supabase
   # or
   brew install supabase/tap/supabase
   ```

## Development Workflow

1. **Creating Migrations**: Use `./migrations.sh new "descriptive_name"` to create properly timestamped migration files
2. **Testing Locally**: Migrations are automatically validated in CI against ephemeral Postgres containers
3. **Staging Deployment**: Merge to main branch triggers automatic staging deployment
4. **Production Deployment**: Create a GitHub release or manually dispatch workflow with approval

## CI/CD Integration

- **migrations-validate.yml**: Runs on PRs to validate migrations against Postgres 16
- **migrations-deploy.yml**: Handles deployments to staging/production with proper environment gates
- Schema snapshots are generated and uploaded as artifacts during validation

## Important Notes

- Production deployments require manual approval through GitHub Environments
- The `migrations.sh` script includes safety prompts for production operations
- Schema dumps are stored in `db/` directory for review and versioning
- All database URLs are managed through GitHub Secrets for security
