---
owner: @jgreen01
status: published
created: 2026-06-27
last_reviewed: 2026-06-27
summary: How to deploy jgreen.one to AWS, and how the infra is structured
---

# Deploying

The site is a static Astro build hosted on AWS: **S3** (private origin) →
**CloudFront** (CDN + clean-URL function) → **Route 53** (DNS), with an **ACM**
TLS cert. All infrastructure is Terraform-managed in `infra/`.

## Scope

How to ship a content/code change to production, plus the one-time infra setup.
Day-to-day, you only need the "Deploy a change" section.

## Prerequisites

- Node (CI uses Node 20) and `npm`.
- AWS CLI authenticated against account **575352938041** with deploy
  permissions (`aws sts get-caller-identity` should succeed).
- Terraform (only needed for infra changes).

## Deploy a change

```bash
./scripts/deploy.sh
```

This script:
1. Reads `cloudfront_id` and `site_bucket` from `infra/live` Terraform outputs.
2. Runs `npm ci && npm run build` → `dist/`.
3. `aws s3 sync ./dist "s3://<bucket>/" --delete`.
4. Creates a CloudFront `/*` invalidation.

There is **no CI auto-deploy** — CI only runs `astro check` + `astro build` on
push/PR (`.github/workflows/ci.yml`). Deploys are intentionally manual.

## Verification

- `deploy.sh` finishes without error and prints an invalidation ID.
- Hard-refresh https://jgreen.one and confirm the change is live (allow a minute
  for the invalidation).

## Infrastructure layout (`infra/`)

- `infra/bootstrap/` — one-time: provisions the S3 backend that stores Terraform
  state. Run once per account.
- `infra/live/` — the production stack (S3, CloudFront + `function.js`, ACM in
  `us-east-1`, Route 53). See `infra/live/README.md` for variables/outputs.

### Infra changes

```bash
cd infra/live
terraform plan      # review first — always
terraform apply
```

## Gotchas

- **ACM must be in `us-east-1`** for CloudFront — the provider alias is already
  set up for this.
- The S3 bucket is **private** (Origin Access Control); don't make it public.
  CloudFront is the only reader.
- `*.tfstate`, `.terraform/`, and `.env*` are gitignored — keep them out of git.
- Clean URLs (`/about` → `/about/index.html`) are handled by the CloudFront
  function in `infra/live/function.js`; editing routing means editing that.

## Related

- Adding content: `guides/adding-content.md`
- Infra reference: `infra/live/README.md`
