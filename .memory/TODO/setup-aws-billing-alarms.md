# Feature: AWS Billing Alerts & Cost Monitoring

## Goal

Set up comprehensive billing alerts and cost monitoring for the AWS infrastructure to detect unusual spending patterns, potential denial-of-funds attacks, and provide early warning of cost overruns.

## Requirements

### Functional Requirements
- [ ] **CloudFront Cost Monitoring**: Alert when CloudFront costs exceed thresholds
- [ ] **S3 Cost Monitoring**: Alert when S3 request costs exceed thresholds
- [ ] **Route 53 Cost Monitoring**: Alert when DNS query costs exceed thresholds
- [ ] **Total AWS Cost Monitoring**: Alert when total AWS bill exceeds monthly budget
- [ ] **Cost Anomaly Detection**: Detect unusual spending patterns
- [ ] **Multi-Channel Alerts**: Email and SMS notifications

### Technical Requirements
- [ ] **CloudWatch Billing Alarms**: Use AWS Billing metrics
- [ ] **SNS Notifications**: Email and SMS alert delivery
- [ ] **Terraform Management**: Manage alarms via Infrastructure as Code
- [ ] **Cost Budgets**: Set up AWS Budgets for proactive monitoring
- [ ] **Cost Categories**: Tag resources for detailed cost tracking

## Implementation Plan

### Phase 1: Basic Billing Alerts
1. **CloudWatch Billing Alarms**
   - Set up alarms for CloudFront, S3, and Route 53 costs
   - Configure email notifications via SNS
   - Set reasonable thresholds based on expected usage

2. **SNS Topic Setup**
   - Create SNS topic for billing alerts
   - Add email subscription for notifications
   - Optional: Add SMS subscription for critical alerts

### Phase 2: Advanced Cost Monitoring
3. **AWS Budgets Configuration**
   - Set up monthly cost budgets
   - Configure budget alerts at 50%, 80%, and 100% of budget
   - Set up forecasted cost alerts

4. **Cost Anomaly Detection**
   - Enable AWS Cost Anomaly Detection
   - Set up anomaly alerts for unusual spending patterns
   - Configure anomaly detection sensitivity

### Phase 3: Resource Tagging & Cost Allocation
5. **Resource Tagging**
   - Add consistent tags to all AWS resources
   - Enable cost allocation tags
   - Set up cost categories for detailed tracking

6. **Cost Reports & Dashboards**
   - Set up Cost Explorer for detailed analysis
   - Create CloudWatch dashboards for cost metrics
   - Configure regular cost reports

## Technical Implementation Details

### Terraform Configuration

**New File: `infra/live/billing-alarms.tf`**
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
  endpoint  = "your-email@example.com"  # Replace with actual email
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
  threshold           = "5.0"    # $5.00
  alarm_description   = "CloudFront costs exceeded $5.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  
  dimensions = {
    Currency = "USD"
    ServiceName = "AmazonCloudFront"
  }
  
  tags = {
    Name        = "jgreen-one-cloudfront-cost-alarm"
    Environment = "production"
  }
}

# CloudWatch Billing Alarm - S3
resource "aws_cloudwatch_metric_alarm" "s3_cost" {
  alarm_name          = "jgreen-one-s3-cost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = "86400"  # 24 hours
  statistic           = "Maximum"
  threshold           = "2.0"    # $2.00
  alarm_description   = "S3 costs exceeded $2.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  
  dimensions = {
    Currency = "USD"
    ServiceName = "AmazonS3"
  }
  
  tags = {
    Name        = "jgreen-one-s3-cost-alarm"
    Environment = "production"
  }
}

# CloudWatch Billing Alarm - Route 53
resource "aws_cloudwatch_metric_alarm" "route53_cost" {
  alarm_name          = "jgreen-one-route53-cost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = "86400"  # 24 hours
  statistic           = "Maximum"
  threshold           = "1.0"    # $1.00
  alarm_description   = "Route 53 costs exceeded $1.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  
  dimensions = {
    Currency = "USD"
    ServiceName = "AmazonRoute53"
  }
  
  tags = {
    Name        = "jgreen-one-route53-cost-alarm"
    Environment = "production"
  }
}

# CloudWatch Billing Alarm - Total AWS Cost
resource "aws_cloudwatch_metric_alarm" "total_cost" {
  alarm_name          = "jgreen-one-total-cost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = "86400"  # 24 hours
  statistic           = "Maximum"
  threshold           = "15.0"   # $15.00
  alarm_description   = "Total AWS costs exceeded $15.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  
  dimensions = {
    Currency = "USD"
  }
  
  tags = {
    Name        = "jgreen-one-total-cost-alarm"
    Environment = "production"
  }
}
```

**New File: `infra/live/budgets.tf`**
```hcl
# AWS Budget for monthly cost monitoring
resource "aws_budgets_budget" "monthly" {
  name              = "jgreen-one-monthly-budget"
  budget_type       = "COST"
  limit_amount      = "20.00"
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2025-01-01_00:00"
  
  cost_filters = {
    Tag = [
      "Environment:production"
    ]
  }
  
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 50
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = ["your-email@example.com"]  # Replace with actual email
  }
  
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = ["your-email@example.com"]  # Replace with actual email
  }
  
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type            = "PERCENTAGE"
    notification_type         = "ACTUAL"
    subscriber_email_addresses = ["your-email@example.com"]  # Replace with actual email
  }
  
  tags = {
    Name        = "jgreen-one-monthly-budget"
    Environment = "production"
  }
}
```

### Cost Thresholds

**Recommended Thresholds:**
- **CloudFront**: $5.00 (normal usage ~$1-2/month)
- **S3**: $2.00 (normal usage ~$0.50/month)
- **Route 53**: $1.00 (normal usage ~$0.50/month)
- **Total AWS**: $15.00 (normal usage ~$3-5/month)

## Risk Assessment & Mitigation

### High Risk
- **False Alerts**: Legitimate traffic spikes might trigger alarms
  - *Mitigation*: Set reasonable thresholds, monitor and adjust based on actual usage
- **Alert Fatigue**: Too many alerts might cause ignoring real issues
  - *Mitigation*: Use different alert levels, consolidate similar alerts

### Medium Risk
- **Delayed Alerts**: Billing data can take 24-48 hours to appear
  - *Mitigation*: Use forecasted cost alerts, monitor CloudWatch metrics
- **Threshold Tuning**: Initial thresholds might be too high or low
  - *Mitigation*: Start conservative, adjust based on actual usage patterns

### Low Risk
- **SNS Delivery**: Email/SMS delivery failures
  - *Mitigation*: Use multiple notification channels, test alert delivery

## Testing Strategy

### Local Testing
1. **Terraform Validation**: `terraform plan` to verify alarm configuration
2. **Threshold Testing**: Test alarm thresholds with AWS CLI
3. **SNS Testing**: Verify email/SMS delivery works

### Staging Testing
1. **Alert Simulation**: Trigger test alerts to verify delivery
2. **Threshold Adjustment**: Fine-tune thresholds based on actual usage
3. **Integration Testing**: Verify alarms work with existing infrastructure

### Production Validation
1. **Real Usage Monitoring**: Monitor actual costs vs. thresholds
2. **Alert Effectiveness**: Verify alerts provide useful early warning
3. **Cost Optimization**: Use alerts to identify cost optimization opportunities

## Success Criteria

- [ ] Billing alarms configured for all AWS services
- [ ] Email notifications working for cost threshold breaches
- [ ] Monthly budget alerts configured at 50%, 80%, and 100%
- [ ] Cost anomaly detection enabled
- [ ] All resources properly tagged for cost allocation
- [ ] Cost Explorer and dashboards set up
- [ ] Alerts provide early warning of cost overruns
- [ ] No false positive alerts during normal usage

## Open Questions

- [ ] **Email Address**: What email should receive billing alerts?
- [ ] **SMS Alerts**: Should we add SMS notifications for critical alerts?
- [ ] **Threshold Tuning**: Are the initial cost thresholds appropriate?
- [ ] **Budget Amount**: Is $20/month a reasonable monthly budget?
- [ ] **Alert Frequency**: How often should we review and adjust thresholds?

## Dependencies

- AWS Billing and Cost Management service
- CloudWatch service for metrics and alarms
- SNS service for notifications
- Terraform for infrastructure management
- Valid email address for notifications

## Estimated Timeline

- **Planning & Configuration**: 1-2 hours
- **Terraform Implementation**: 2-3 hours
- **Testing & Validation**: 1-2 hours
- **Threshold Tuning**: 1-2 hours
- **Total**: 5-9 hours

## Priority

**High Priority** - Cost monitoring is essential for preventing unexpected bills and detecting potential attacks. This should be implemented before or alongside the WAF protection.

## Notes

- **Billing Data Delay**: AWS billing data can take 24-48 hours to appear
- **Threshold Adjustment**: Initial thresholds should be conservative and adjusted based on actual usage
- **Cost Optimization**: Use alerts to identify opportunities for cost reduction
- **Peace of Mind**: Early warning system prevents surprise bills
- **Future Blog Post**: "Setting Up AWS Billing Alerts for Personal Projects"