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

    # Answer 429, not the default 403.
    #
    # CloudFront remaps 403 to 404 so that a missing S3 object reads as "gone"
    # rather than "forbidden". A WAF block is also a 403, so it was being
    # remapped too -- and CloudFront caches that generated page BY PATH, not by
    # client. One rate-limited IP therefore served 404s to everyone who asked
    # for the same URL.
    #
    # 429 avoids both halves. CloudFront only rewrites the codes listed in its
    # custom_error_response blocks, and it only caches error responses for
    # 400/403/404/405/414/416/500-504. 429 is in neither set, so it passes
    # through uncached and says what actually happened.
    action {
      block {
        custom_response {
          response_code            = 429
          custom_response_body_key = "rate_limited"

          response_header {
            name  = "Retry-After"
            value = "60"
          }

          response_header {
            name  = "Cache-Control"
            value = "no-store"
          }
        }
      }
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

  custom_response_body {
    key          = "rate_limited"
    content_type = "TEXT_PLAIN"
    content      = "429 Too Many Requests\n\nThis site rate limits a single IP to 1000 requests per 5 minutes.\nThe page exists; you are simply asking too quickly. Wait 60 seconds\nand retry, or slow down and continue.\n"
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
        StringEquals = { "aws:SourceAccount" = "<account-id>" }
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
