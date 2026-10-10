# SavedTube Agent Instructions

## Project context

SavedTube is an interactive YouTube playlist builder. The product direction is to:

- accept videos as learning material;
- organize videos into a coherent learning progression;
- present the resulting learning path as an attractive mind map;
- preserve a calm, architectural, warm-modern visual character.

Treat `saved-tube.md` as the current product-direction note. Preserve that file unless the user explicitly asks for an update.

## Repository workflow

- Inspect repository status before editing.
- Preserve unrelated working-tree changes.
- Commit and push SavedTube changes directly to `main` when the requested slice passes verification.
- Review the exact diff and run the relevant checks before pushing; preserve unrelated working-tree changes.
- Keep secrets out of source files, prompts, commits, logs, and command output.
- Run the smallest relevant validation after each change, then review the final diff.
- Prefer small, atomic changes with clear verification.

## Supabase migrations

The repository contains versioned migrations in `supabase/migrations/` and the workflow in `.github/workflows/migrations-validate.yml`.

### Required order of investigation

Before diagnosing or changing migration deployment, inspect the GitHub Actions workflow. The workflow is the authoritative deployment path for this repository.

The workflow has two responsibilities:

1. `validate` starts a local Supabase database and runs `supabase db reset`.
2. `deploy` runs after validation for `main` pushes or manual dispatch and applies migrations with:

```bash
supabase db push --include-all --db-url "${SUPABASE_DB_URL}"
```

The deployment job receives credentials from GitHub Secrets:

```yaml
SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
```

`SUPABASE_DB_URL` is the direct Postgres connection string and must include the required SSL option, such as `sslmode=require`. The secret remains in GitHub; it must not be copied into the repository or chat.

### Credential boundaries

- `NEXT_PUBLIC_SUPABASE_URL` identifies the Supabase API project.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is an application API key for the anonymous role.
- Neither application value authenticates the migration CLI to Postgres.
- The GitHub Actions secret `SUPABASE_DB_URL` is the preferred credential path for production migration deployment.
- Do not request, print, commit, or place the database password in a tracked file when the GitHub workflow can perform the deployment.

### Local CLI guidance

- The repository already contains `supabase/config.toml`; do not run `supabase init` unnecessarily.
- Use local CLI commands for local validation and inspection.
- Use `supabase db push --dry-run --db-url ...` only when a user deliberately supplies a secure direct database URL for local inspection.
- Prefer the GitHub Actions workflow for production migration deployment.
- `supabase link` and `supabase migration list` can trigger `cli_login_postgres` role initialization. A permission error in that step is a CLI/database-role connection problem, not evidence that the migration SQL is invalid.
- If deployment is needed, inspect the workflow and trigger or monitor the GitHub Actions job rather than inventing a separate credential path.

## Agent execution

- Work from the repository root so this file is loaded.
- Use `--model auto` for Cursor/agent invocations unless the user explicitly selects another model.
- Ask Cursor to make one atomic change at a time, verify it, and report the exact files and commands involved.
- Never include API keys, database URLs, tokens, or passwords in Cursor prompts.
- When Hermes and Cursor work on the same task, both agents should follow this file and the repository's current source files as the shared source of truth.
