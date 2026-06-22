# AWS Billing Alerts & Cost Monitoring

**Priority**: HIGH
**Status**: TODO
**Created**: 2025-09-28
**Updated**: 2026-06-21

## Description

Set up billing alarms and cost monitoring for the AWS infrastructure (S3 + CloudFront + Route 53) to detect unusual spending, catch potential denial-of-funds attacks early, and avoid surprise bills. Manage everything via Terraform in `infra/live/`.

## Acceptance Criteria

- [ ] CloudWatch billing alarms (`AWS/Billing` `EstimatedCharges`) per service: CloudFront $5, S3 $2, Route 53 $1, plus total AWS $15
- [ ] SNS topic `jgreen-one-billing-alerts` with an email subscription
- [ ] AWS Budget: $20/month with notifications at 50% / 80% / 100% of budget
- [ ] AWS Cost Anomaly Detection enabled
- [ ] Resources tagged for cost allocation
- [ ] `terraform plan` validates cleanly; no false positives during normal usage

## Notes

- Billing metrics live in `us-east-1` only — the provider/alias is already set up there for ACM.
- Normal baseline: CloudFront ~$1-2, S3 ~$0.50, Route 53 ~$0.50, total ~$3-5/month. Start thresholds conservative, tune from real usage.
- Billing data can lag 24-48h, so pair with forecasted-cost alerts.
- Should land before or alongside the WAF task ([aws-waf-protection](aws-waf-protection.md)).

## Detailed Plan

### Implementation phases
1. **Basic billing alerts** — CloudWatch billing alarms for CloudFront, S3, Route 53; SNS topic with email subscription (optional SMS for critical).
2. **Advanced cost monitoring** — AWS Budgets ($20/mo, alerts at 50/80/100%, forecasted alerts); enable Cost Anomaly Detection.
3. **Resource tagging & cost allocation** — consistent tags, cost-allocation tags, cost categories; Cost Explorer + CloudWatch dashboards.

### Terraform — `infra/live/billing-alarms.tf`
```hcl
# SNS Topic for billing alerts
resource "aws_sns_topic" "billing_alerts" {
  name = "jgreen-one-billing-alerts"
  tags = {
    Name        = "jgreen-one-billing-alerts"
    Environment = "production"
  }
}

# Email subscription for billing alerts
resource "aws_sns_topic_subscription" "billing_email" {
  topic_arn = aws_sns_topic.billing_alerts.arn
  protocol  = "email"
  endpoint  = "{BILLING_ALERT_EMAIL}"  # fill in real email
}

# CloudWatch Billing Alarm - CloudFront
resource "aws_cloudwatch_metric_alarm" "cloudfront_cost" {
  alarm_name          = "jgreen-one-cloudfront-cost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = "86400"  # 24 hours
  statistic           = "Maximum"
  threshold           = "5.0"
  alarm_description   = "CloudFront costs exceeded $5.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  dimensions = { Currency = "USD", ServiceName = "AmazonCloudFront" }
}

# CloudWatch Billing Alarm - S3 (threshold 2.0, ServiceName AmazonS3)
# CloudWatch Billing Alarm - Route 53 (threshold 1.0, ServiceName AmazonRoute53)
# CloudWatch Billing Alarm - Total (threshold 15.0, dimensions = { Currency = "USD" })
# (same shape as cloudfront_cost above; vary alarm_name/threshold/ServiceName)
```

### Terraform — `infra/live/budgets.tf`
```hcl
resource "aws_budgets_budget" "monthly" {
  name              = "jgreen-one-monthly-budget"
  budget_type       = "COST"
  limit_amount      = "20.00"
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2025-01-01_00:00"

  cost_filters = { Tag = ["Environment:production"] }

  # repeat `notification` blocks for thresholds 50, 80, 100
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = ["{BILLING_ALERT_EMAIL}"]
  }
}
```

### Cost thresholds (vs. normal usage)
- CloudFront $5.00 (~$1-2/mo) · S3 $2.00 (~$0.50/mo) · Route 53 $1.00 (~$0.50/mo) · Total $15.00 (~$3-5/mo)

### Risks & mitigations
- Legitimate traffic spikes → false alerts: set reasonable thresholds, tune from usage.
- Alert fatigue: distinct alert levels, consolidate similar alerts.
- Billing data delay (24-48h): use forecasted-cost alerts.

### Testing
- `terraform plan` to validate; trigger test alerts to confirm SNS email delivery; monitor real costs vs. thresholds and adjust.

### Open questions
- Which email receives alerts? Add SMS for critical? Are initial thresholds right? Is $20/mo the right budget?

## Log

- 2025-09-28 Finalized plan (shifted focus from CloudFlare DDoS to AWS-native cost protection).
- 2026-06-21 Migrated into the `todo/` system with the full plan inlined.
