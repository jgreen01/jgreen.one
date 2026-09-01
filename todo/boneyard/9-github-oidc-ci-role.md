# GitHub Actions OIDC provider + read-only CI role

**Priority**: MEDIUM
**Status**: ABANDONED — see below
**Created**: 2026-08-30
**Updated**: 2026-08-31


## Abandoned — 2026-08-31

**Why.** The cost outweighs the benefit at this site's scale. This task exists to let CI
reach AWS without long-lived keys, so the `infra` job can run `pytest tests/infra`
unattended and task 6's CI check can verify image bytes rather than just manifest
entries. Both are real, and both are small: the infra suite runs locally in about five
seconds, and the manifest check already catches the bug class that matters (a reference
to an asset nobody manages).

Against that, it means standing up a permanent trust relationship allowing a GitHub
repository to assume a role in the AWS account — a security boundary whose entire
strength rests on one `sub` condition being written correctly and staying correct. For a
team, that trade is obviously worth making. For a solo personal site where the
alternative is typing one command, it is more surface area than it buys.

**What would change the decision:**

- CI genuinely needs AWS — deploying from a workflow, or a scheduled job that must run
  without anyone present.
- More than one person works on the repo, so "just run it locally" stops being a reliable
  answer.
- Task 6's interim CI check proves insufficient — a corrupt or missing asset actually
  reaches production because CI could only verify the manifest.
- Another task needs AWS access from a workflow, making the provider a shared cost rather
  than a single-purpose one.

**Worth keeping regardless of the decision.** The permission list in this file was derived
by walking the actual boto3 calls in `tests/infra/`, not guessed, and it is deliberately
narrower than the `ReadOnlyAccess` managed policy. If this is ever revived, start there.
So is the warning about the `sub` condition: it is the whole security boundary, and
`repo:*` would let any repository on the internet assume the role.

**Left undone by abandoning this:** the `infra` job in `.github/workflows/ci.yml` stays
inert, and its comment still wrongly claims the suite "skips itself" without the secret —
it would in fact fail, because `configure-aws-credentials` errors on an empty
`role-to-assume` before pytest runs. That comment should be corrected whether or not this
task is ever revived.

## Description

Let GitHub Actions authenticate to AWS **without any long-lived credentials**, by adding
an IAM OIDC identity provider for GitHub plus a role that CI can assume. Terraform-managed
in `infra/live/`, like everything else.

This is pure unblocking work — it is not valuable on its own, but two things are stuck
behind it:

1. **The `infra` CI job** (`.github/workflows/ci.yml`) exists and is inert. It references
   `secrets.AWS_INFRA_ROLE_ARN`, which does not exist, so it cannot run. The 36
   `pytest tests/infra` assertions only ever run when Jon runs them by hand.
2. **Task 6 step 0.** Git-ignoring `public/media/` leaves a fresh CI checkout with no
   images, failing three of task 4's tests. The recommended fix is giving CI read-only
   S3 access so `media-check --pull` can hydrate them. Same provider, same pattern —
   a second role, or one more statement on the same role.

Verified 2026-08-30: **no OIDC provider and no GitHub-related IAM role exist yet** in
account 575352938041 (`aws iam list-open-id-connect-providers` returns an empty list).
This is greenfield.

## Why OIDC rather than an access key

A long-lived `AKIA…` key in GitHub secrets would work and take ten minutes. Don't.

- Credentials are **short-lived and minted per job** — nothing durable to leak.
- Nothing to rotate, so nothing to forget to rotate.
- The trust policy scopes access to **this repository**, so a key lifted from CI logs
  is worth nothing elsewhere.
- It is the pattern AWS and GitHub both document; `aws-actions/configure-aws-credentials`
  already supports it and the workflow is already written for it
  (`permissions: id-token: write` is set).

## Design

### New file: `infra/live/github-oidc.tf`

Follow the existing conventions: `terraform ~> 1.9`, `hashicorp/aws ~> 6.0`, variables
with defaults in `variables.tf`, outputs in `outputs.tf`.

**1. The identity provider**

```hcl
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [...]
}
```

- `thumbprint_list` — check current guidance before writing a value. AWS **no longer
  verifies the thumbprint** for `token.actions.githubusercontent.com` (it trusts the
  well-known root CAs), so the field is effectively vestigial, but the provider may still
  require it. Do **not** copy a thumbprint from a 2021-era blog post; if one is required,
  fetch it or use the value the current AWS docs give.
- Only one provider per URL per account — this is a singleton.

**2. The trust policy — the part that matters**

```hcl
data "aws_iam_policy_document" "github_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:jgreen01/jgreen.one:*"]
    }
  }
}
```

> ⚠️ **The `sub` condition is the entire security boundary.** Omit it, or leave it as
> `repo:*`, and *any* GitHub repository on the internet can assume this role. Getting
> this wrong is the one way this task can do real harm.
>
> `repo:jgreen01/jgreen.one:*` allows any branch, tag or PR in this repo. Consider
> tightening to `repo:jgreen01/jgreen.one:ref:refs/heads/main` — note that a
> `pull_request` event from a fork gets a different `sub`, so decide deliberately whether
> CI on PRs should have AWS access at all. For a read-only role, `:*` is defensible; if
> a write role is ever added, scope it to `main`.
>
> Also require `aud = sts.amazonaws.com`. Both conditions, always.

**3. The read-only role**

One role, `jgreen-one-github-ci`, with a policy covering exactly what the two consumers
need — no `ReadOnlyAccess` managed policy, which grants far more than this (it can read
every bucket's contents, Secrets Manager metadata, etc.).

Derived from the actual boto3 calls in `tests/infra/`:

| Service | Actions | Used by |
|---|---|---|
| STS | `sts:GetCallerIdentity` | `conftest.py` credential guard |
| CloudFront | `cloudfront:ListDistributions`, `cloudfront:GetDistribution` | `TestCloudFront` |
| S3 | `s3:GetBucketPublicAccessBlock`, `s3:GetBucketVersioning`, `s3:GetEncryptionConfiguration`, `s3:GetBucketPolicyStatus` | `TestSiteBucket` |
| WAFv2 | `wafv2:ListWebACLs`, `wafv2:GetWebACL` | `TestWaf` |
| SNS | `sns:ListTopics`, `sns:ListSubscriptionsByTopic` | `TestBillingAlerts` |
| CloudWatch | `cloudwatch:DescribeAlarms` | `TestBillingAlerts` |
| Budgets | `budgets:DescribeBudget`, `budgets:DescribeNotificationsForBudget` | `TestBudget` |
| Route 53 | `route53:ListResourceRecordSets`, `route53:GetHostedZone` | task 5's planned `test_dns.py` |
| S3 (objects) | `s3:ListBucket`, `s3:GetObject` on `jgreen-one-site` + `/media/*` | task 6's `media-check --pull` |

Scope resource ARNs where the service supports it (S3, Route 53 zone
`Z01752721Z1AXUQEVQZ2D`, the WAF ACL). CloudFront, Budgets and `sts:GetCallerIdentity`
are effectively account-wide.

**No write actions. No `s3:PutObject`, no `s3:DeleteObject`, no `cloudfront:CreateInvalidation`.**
If deploying from CI is ever wanted, that is a separate role with a separate trust
condition — do not widen this one.

**4. Output the role ARN**

Add to `outputs.tf` so it can be copied into the GitHub secret without digging through
the console:

```hcl
output "github_ci_role_arn" { value = aws_iam_role.github_ci.arn }
```

### GitHub side

Set the repository secret `AWS_INFRA_ROLE_ARN` to that output. Repo settings → Secrets
and variables → Actions → New repository secret. Nothing else in the workflow changes —
it is already written to consume it.

## Implementation steps

1. [ ] Check current AWS guidance on `thumbprint_list` for
       `token.actions.githubusercontent.com` before writing a value.
2. [ ] Write `infra/live/github-oidc.tf`: provider, trust policy document, role, inline
       policy. Add the role name as a variable with a default, matching the style of
       `variables.tf`.
3. [ ] Add `github_ci_role_arn` to `infra/live/outputs.tf`.
4. [ ] `cd infra/live && terraform plan` — **read the plan in full and show it before
       applying**, per `AGENTS.md`. Check specifically that the `sub` condition names
       this repo and nothing wider.
5. [ ] `terraform apply`.
6. [ ] Set the `AWS_INFRA_ROLE_ARN` repository secret to the output ARN.
7. [ ] **Fix the stale comment in `.github/workflows/ci.yml`.** The `infra` job says the
       suite "skips itself" without the secret. That is wrong — `configure-aws-credentials`
       fails on an empty `role-to-assume` before pytest ever runs, so the job goes red,
       not skipped. Correct it while touching this area.
8. [ ] Trigger the workflow manually with `run_infra_tests: true` and confirm all 36
       tests pass in CI.
9. [ ] Decide whether task 6 reuses this role or gets its own, and note the decision in
       task 6's step 0.

## Testing

There is no unit-testable code here — it is IAM policy. Verification is behavioural, and
the interesting cases are the **negative** ones.

### Positive

- [ ] `terraform plan` after `apply` is empty (no drift, nothing non-deterministic).
- [ ] The manually-triggered `infra` CI job goes green with all 36 tests passing.
- [ ] The role ARN appears in `terraform output`.

### Negative — the ones that actually prove the boundary

- [ ] **Least privilege holds.** From a CI run (or `aws sts assume-role-with-web-identity`
      locally if you can mint a token), confirm a **write** is denied:
      `aws s3 rm s3://jgreen-one-site/robots.txt --dryrun` should fail with
      `AccessDenied`, not succeed. A role that can read *and* write is the failure mode
      worth catching, and nothing else in this plan would notice it.
- [ ] **The trust boundary holds.** Read the rendered trust policy in the plan output and
      confirm the `sub` condition is exactly `repo:jgreen01/jgreen.one:*` (or narrower)
      and that `aud` is pinned. This is a code-review check, not a runtime one — there is
      no safe way to test "another repo cannot assume this" without another repo.
- [ ] The role grants nothing beyond the table above — diff the rendered policy against
      that list.

### Add to the existing infra suite

`tests/infra/test_aws.py` can assert its own prerequisites, which turns "is CI set up
correctly?" into a test rather than tribal knowledge. Add a `TestCiRole` class:

- [ ] The OIDC provider for `token.actions.githubusercontent.com` exists
      (`iam:ListOpenIDConnectProviders`).
- [ ] The `jgreen-one-github-ci` role exists and its trust policy's `sub` condition
      references `repo:jgreen01/jgreen.one` — **fail loudly on a wildcard that is not
      scoped to this repo.** A misconfigured trust policy is the highest-consequence
      mistake available here, and this is the only automated guard against it.
- [ ] The attached policy contains no `Put*`, `Delete*`, `Create*` or `*` action.

Requires adding an `iam` client fixture to `tests/infra/conftest.py` and
`iam:GetRole`, `iam:GetRolePolicy`, `iam:ListOpenIDConnectProviders` to the role's own
permissions (it reads its own configuration — harmless, and it makes the check
self-hosting).

## Notes

- **Scope discipline.** It is tempting to add deploy permissions "while we're here" so CI
  can run `scripts/deploy.sh`. Don't — deploying from CI is a separate decision with a
  separate blast radius, and this role's value comes from being provably read-only.
- Jon currently deploys with the `jon` IAM user (`arn:aws:iam::575352938041:user/jon`).
  Nothing here changes that.
- The provider is account-wide and a singleton. If another repo ever needs AWS access, it
  reuses this provider with its own role and its own `sub` condition.
- Costs nothing — IAM roles and OIDC providers are free.

### Reference

- AWS: configuring OpenID Connect in Amazon Web Services (GitHub Docs)
  <https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services>
- `aws-actions/configure-aws-credentials` <https://github.com/aws-actions/configure-aws-credentials>
- Terraform `aws_iam_openid_connect_provider`
  <https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/iam_openid_connect_provider>

## Log

- 2026-08-30 Created. Surfaced while planning task order: the `infra` CI job added in
  task 4 is inert without an OIDC role, and task 6's step 0 needs the same thing for
  `media-check --pull`. Confirmed greenfield — `aws iam list-open-id-connect-providers`
  returns an empty list and no GitHub-related IAM role exists in account 575352938041.
  Scoped deliberately to **read-only**, with the permission list derived from the actual
  boto3 calls in `tests/infra/` plus what tasks 5 and 6 will need. Not started.
