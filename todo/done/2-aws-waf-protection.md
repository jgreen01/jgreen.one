# AWS WAF Rate-Limiting Protection

**Priority**: MEDIUM
**Status**: DONE
**Created**: 2025-09-28
**Updated**: 2026-08-31

## Description

Add AWS WAF v2 to the existing CloudFront distribution for rate limiting / denial-of-funds protection, without changing the current S3 + CloudFront + Route 53 architecture. Manage via Terraform.

## Acceptance Criteria

Reconciled against the live account on 2026-08-31 — the boxes below reflect what was
actually verified, not what was assumed.

- [x] `aws_wafv2_web_acl` with `scope = "CLOUDFRONT"`, default action ALLOW
- [x] Rate-based rule blocking IPs over a threshold — **shipped at 1000 req / 5 min,
      not the 100 planned here.** See "Deviations" below.
- [x] Web ACL attached to the CloudFront distribution via `web_acl_id`
- [x] WAF logging with 30-day retention and `authorization`/`cookie` redacted —
      **log group is `aws-waf-logs-jgreen-one`, not the `/aws/wafv2/jgreen-one` written
      above.** The plan was wrong; see "Deviations".
- [ ] **Rate limiting verified in practice — NEVER DONE.** `BlockedRequests` for
      `RateLimitRule` is empty over the last 30 days. Expected for a low-traffic site
      with no attack, but it means nobody has confirmed the rule actually fires. The
      config is correct-looking and untested.
- [x] Monthly cost under ~$7 — **$5.82 for August 2026** (Cost Explorer, service
      "AWS WAF"). Latency impact not measured.
- [x] Existing `scripts/deploy.sh` still works unchanged

### Deviations from the plan

**Rate limit is 1000/5min, ten times looser than the 100 planned.** The reason *was*
recorded, in the 2026-06-27 log entry: 100 was too low for shared corporate NATs, where
many users share one source IP. Sound reasoning — the criteria above just never got
updated to match, which is what made it look like drift. Fixed here.

**The log group name in this plan was never valid.** AWS requires WAF logging
destinations to be prefixed `aws-waf-logs-`, so `/aws/wafv2/jgreen-one` could not have
worked. `aws-waf-logs-jgreen-one` is correct and is what Terraform declares.

### Worth revisiting

At **$5.82/month**, WAF is the single largest line item on a site that otherwise costs
pennies — roughly $70/year for protection that has never triggered. Not wrong, but a
deliberate choice worth re-making rather than inheriting. The billing alarms from task 1
are what would catch it if traffic ever made the rule matter.

To close the verification gap: send a burst of >1000 requests from one IP inside five
minutes and watch the `BlockedRequests` metric move. `tests/infra/test_aws.py` already
asserts the *configuration* (limit 1000, window 300, action Block, ACL attached,
metrics enabled) on every infra run, so the config side is guarded continuously.

## Notes

- Estimated cost ~$6.60/month: Web ACL $5 + 1 rule $1 + ~$0.60 requests. (Corrected from an earlier $1.80 estimate.)
- WAF for CloudFront must be created in `us-east-1`.
- Depends on / complements [aws-billing-alarms](aws-billing-alarms.md) (monitor WAF cost).

## Detailed Plan

### Implementation phases
1. **WAF config** — Web ACL scope `CLOUDFRONT`, default ALLOW, CloudWatch metrics + logging; rate-limit rules (100/5min per IP; optionally a higher burst tier).
2. **Terraform** — `aws_wafv2_web_acl`, optional `aws_wafv2_rule_group` / `aws_wafv2_ip_set`; attach to CloudFront via `web_acl_id`.
3. **Monitoring & testing** — enable WAF logging, metrics for blocked requests, alarms for unusual traffic; verify rate limiting and that legitimate traffic passes.

### Terraform — `infra/live/waf.tf`
```hcl
resource "aws_wafv2_web_acl" "main" {
  name  = "jgreen-one-waf"
  scope = "CLOUDFRONT"
  default_action { allow {} }

  rule {
    name     = "RateLimitRule"
    priority = 1
    action { block {} }
    statement {
      rate_based_statement {
        limit              = 100
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }

  tags = { Name = "jgreen-one-waf", Environment = "production" }
}

resource "aws_cloudwatch_log_group" "waf_logs" {
  name              = "/aws/wafv2/jgreen-one"
  retention_in_days = 30
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  resource_arn            = aws_wafv2_web_acl.main.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf_logs.arn]
  redacted_fields { single_header { name = "authorization" } }
  redacted_fields { single_header { name = "cookie" } }
}
```

### Terraform — edit `infra/live/cloudfront.tf`
Add to the `aws_cloudfront_distribution` resource:
```hcl
  web_acl_id = aws_wafv2_web_acl.main.arn
```

### Cost breakdown (monthly)
- Web ACL $5.00 + 1 rule $1.00 + ~$0.60 requests (≈1M/mo) = **~$6.60**

### Risks & mitigations
- WAF misconfig blocks legitimate traffic → start permissive, watch logs, tighten gradually.
- Cost overrun from traffic → pair with billing alerts.
- Latency: WAF typically <10ms; monitor.

### Testing
- `terraform plan`; send >100 req/5min to confirm blocking; verify normal users pass; measure latency; review WAF logs.

### Open questions
- Are 100 req/5min limits right for this traffic? Geo-blocking? IP allowlist? Is 30-day log retention enough? Alerts on blocked requests?

## Log

- 2025-09-28 Reframed from CloudFlare DDoS protection to AWS WAF denial-of-funds protection.
- 2026-06-21 Migrated into the `todo/` system with the full plan inlined.
- 2026-06-27 Implemented and applied. Rate limit raised from 100 to 1000 req/5min (100 too low for shared corporate NATs). Created `infra/live/waf.tf`: WAF Web ACL `jgreen-one-waf`, CloudWatch log group `aws-waf-logs-jgreen-one` (30-day retention), resource policy for WAF log delivery, logging config with authorization/cookie redacted. Added `web_acl_id` to CloudFront distribution in `cloudfront.tf`. WAF ARN: `arn:aws:wafv2:us-east-1:575352938041:global/webacl/jgreen-one-waf/93cf416d-a3fa-491a-8b4b-1237097a2ae6`.

- 2026-08-31 **Reconciled against the live account and filed.** The file said DONE while
  all seven acceptance criteria sat unticked, so each was checked for real: the Web ACL,
  its attachment, the logging config and retention, the redacted headers, and the August
  cost ($5.82). Two deviations from the plan surfaced. The rate limit shipped at
  1000/5min instead of 100 — already explained in the 2026-06-27 entry below (shared
  corporate NATs), the criteria list simply never caught up. The planned log group name
  was never valid, because AWS requires the `aws-waf-logs-` prefix on WAF logging
  destinations; the deployed name is correct and the plan was wrong.
  One criterion is honestly left **unticked**: the rate limit has never been verified
  firing. `BlockedRequests` is empty over 30 days, which is expected with no attack but
  means the rule is untested in practice. `tests/infra/test_aws.py` (task 4) now guards
  the configuration on every infra run, which is the part that can regress silently.
