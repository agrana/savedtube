# SavedTube Infrastructure

Terraform configurations for Cloudflare DNS, email forwarding, Vercel custom domain, and Supabase project references.

## Prerequisites

1. **Terraform** >= 1.0 — [terraform.io](https://terraform.io)
2. **Cloudflare account** with the domain added
3. **Cloudflare API token** with Zone read, DNS edit, and Email Routing permissions
4. **Vercel API token** — [vercel.com/account/tokens](https://vercel.com/account/tokens)
5. **Supabase access token** — [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)

## Setup

### 1. Configure variables

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values. Never commit `terraform.tfvars`.

### 2. Initialize and deploy

```bash
terraform init
terraform plan
terraform apply
```

Or use the Makefile:

```bash
make init
make plan
make apply
```

## What this manages

### DNS (`modules/dns`)

- Root (`@`) and `www` A records (proxied through Cloudflare)
- `api` CNAME pointing to the app URL

Page Rules are currently **disabled** in the DNS module due to a Cloudflare provider issue.

### Email routing (`modules/email_routing`)

Forwards these addresses to your personal inbox:

- `support@yourdomain.com`
- `contact@yourdomain.com`
- `hello@yourdomain.com`

Email routing requires a Cloudflare plan that supports it.

### Vercel (`modules/vercel`)

- References an existing Vercel project
- Attaches the custom domain

Environment variables are managed directly in the Vercel dashboard, not via Terraform.

### Supabase (`modules/supabase`)

- References an existing Supabase project
- Exports project and API URLs

## Variables

See `variables.tf` for the full list. Key inputs:

| Variable | Description |
|----------|-------------|
| `domain_name` | Your domain (e.g. `savedtube.com`) |
| `app_url` | Vercel app hostname for the `api` CNAME |
| `support_email` | Inbox for support forwards |
| `contact_email` | Inbox for contact/hello forwards |
| `cloudflare_api_token` | Cloudflare API token |
| `vercel_api_token` | Vercel API token |
| `vercel_project_name` | Existing Vercel project name |
| `github_repo` | Repository in `owner/repo` format |
| `supabase_project_id` | Supabase project reference ID |

Sensitive values (tokens, keys) can also be passed via environment variables in CI.

## Commands

```bash
terraform plan          # Preview changes
terraform apply         # Apply changes
terraform destroy       # Remove managed resources (careful!)
terraform output        # Show outputs
make fmt                # Format .tf files
make validate           # Validate configuration
```

## Troubleshooting

1. **API token permissions** — verify Cloudflare token scopes match what the modules need.
2. **Domain not in Cloudflare** — add the domain before running `terraform apply`.
3. **Email routing** — confirm your Cloudflare plan supports Email Routing.
4. **Debug logs** — `TF_LOG=DEBUG terraform apply`

## Security notes

- Never commit `terraform.tfvars` or state files with secrets.
- Use least-privilege API tokens.
- Rotate tokens regularly.
