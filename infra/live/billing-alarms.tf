locals {
  billing_email = "alarmcloud@jgreen01.4wrd.cc"
}

# SNS topic for all billing alerts
resource "aws_sns_topic" "billing_alerts" {
  name = "jgreen-one-billing-alerts"
  tags = {
    Name        = "jgreen-one-billing-alerts"
    Environment = "production"
    Project     = "jgreen-one"
  }
}

resource "aws_sns_topic_subscription" "billing_email" {
  topic_arn = aws_sns_topic.billing_alerts.arn
  protocol  = "email"
  endpoint  = local.billing_email
}

# CloudWatch billing alarms — billing metrics only exist in us-east-1
# The default provider is already us-east-1 (var.region default).

resource "aws_cloudwatch_metric_alarm" "cloudfront_cost" {
  alarm_name          = "jgreen-one-cloudfront-cost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 86400 # 24 hours
  statistic           = "Maximum"
  threshold           = 5.0
  alarm_description   = "CloudFront estimated charges exceeded $5.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  treat_missing_data  = "notBreaching"
  dimensions = {
    Currency    = "USD"
    ServiceName = "AmazonCloudFront"
  }
}

resource "aws_cloudwatch_metric_alarm" "s3_cost" {
  alarm_name          = "jgreen-one-s3-cost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 86400
  statistic           = "Maximum"
  threshold           = 2.0
  alarm_description   = "S3 estimated charges exceeded $2.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  treat_missing_data  = "notBreaching"
  dimensions = {
    Currency    = "USD"
    ServiceName = "AmazonS3"
  }
}

resource "aws_cloudwatch_metric_alarm" "route53_cost" {
  alarm_name          = "jgreen-one-route53-cost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 86400
  statistic           = "Maximum"
  threshold           = 1.0
  alarm_description   = "Route 53 estimated charges exceeded $1.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  treat_missing_data  = "notBreaching"
  dimensions = {
    Currency    = "USD"
    ServiceName = "AmazonRoute53"
  }
}

resource "aws_cloudwatch_metric_alarm" "total_cost" {
  alarm_name          = "jgreen-one-total-cost"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "EstimatedCharges"
  namespace           = "AWS/Billing"
  period              = 86400
  statistic           = "Maximum"
  threshold           = 15.0
  alarm_description   = "Total AWS estimated charges exceeded $15.00"
  alarm_actions       = [aws_sns_topic.billing_alerts.arn]
  treat_missing_data  = "notBreaching"
  dimensions = {
    Currency = "USD"
  }
}
