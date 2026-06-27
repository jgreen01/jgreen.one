# WAF must be in us-east-1 for CloudFront — default provider is already us-east-1.

resource "aws_wafv2_web_acl" "main" {
  name  = "jgreen-one-waf"
  scope = "CLOUDFRONT"

  default_action {
    allow {}
  }

  rule {
    name     = "RateLimitRule"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = 1000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "jgreen-one-waf"
    sampled_requests_enabled   = true
  }

  tags = {
    Name        = "jgreen-one-waf"
    Environment = "production"
    Project     = "jgreen-one"
  }
}

# WAF log group name must start with "aws-waf-logs-" (AWS requirement)
resource "aws_cloudwatch_log_group" "waf_logs" {
  name              = "aws-waf-logs-jgreen-one"
  retention_in_days = 30
  tags = {
    Name        = "aws-waf-logs-jgreen-one"
    Environment = "production"
    Project     = "jgreen-one"
  }
}

# Resource policy allowing WAF to write to the log group
resource "aws_cloudwatch_log_resource_policy" "waf_logs" {
  policy_name = "jgreen-one-waf-logs-policy"
  policy_document = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "delivery.logs.amazonaws.com" }
      Action    = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource  = "${aws_cloudwatch_log_group.waf_logs.arn}:*"
      Condition = {
        StringEquals = { "aws:SourceAccount" = "575352938041" }
      }
    }]
  })
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  resource_arn            = aws_wafv2_web_acl.main.arn
  log_destination_configs = [aws_cloudwatch_log_group.waf_logs.arn]

  redacted_fields {
    single_header {
      name = "authorization"
    }
  }

  redacted_fields {
    single_header {
      name = "cookie"
    }
  }

  depends_on = [aws_cloudwatch_log_resource_policy.waf_logs]
}
