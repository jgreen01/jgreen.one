# AWS WAF Rate-Limiting Protection

**Priority**: MEDIUM
**Status**: DONE
**Created**: 2025-09-28
**Updated**: 2026-06-27

## Description

Add AWS WAF v2 to the existing CloudFront distribution for rate limiting / denial-of-funds protection, without changing the current S3 + CloudFront + Route 53 architecture. Manage via Terraform.

## Acceptance Criteria

- [ ] `aws_wafv2_web_acl` with `scope = "CLOUDFRONT"`, default action ALLOW
- [ ] Rate-based rule: block IPs exceeding 100 requests / 5-minute window
- [ ] Web ACL attached to the CloudFront distribution via `web_acl_id`
- [ ] WAF logging to a CloudWatch log group (`/aws/wafv2/jgreen-one`, 30-day retention), with `authorization`/`cookie` redacted
- [ ] Rate limiting verified (>100 req/5min blocked); legitimate traffic unaffected
- [ ] Monthly cost stays under ~$7; site latency impact <50ms
- [ ] Existing `scripts/deploy.sh` still works unchanged

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
