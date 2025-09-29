# Feature: AWS WAF DDoS Protection & Layer 7 Security

## Goal

Implement AWS WAF (Web Application Firewall) to add DDoS protection via rate limiting to the existing AWS CloudFront + S3 infrastructure without changing the current architecture.

## Requirements

### Functional Requirements
- [ ] **Rate Limiting**: Protect against request flooding and bot attacks
- [ ] **IP Reputation Filtering**: Block known malicious IPs
- [ ] **Geographic Restrictions**: Optional blocking of specific countries
- [ ] **Zero Architecture Changes**: Keep existing CloudFront + S3 + Route 53 setup

### Technical Requirements
- [ ] **AWS WAF v2**: Use modern WAF with CloudFront scope
- [ ] **Terraform Management**: Manage WAF resources via Infrastructure as Code
- [ ] **CloudFront Integration**: Attach WAF Web ACL to existing CloudFront distribution
- [ ] **Monitoring**: Set up CloudWatch metrics for WAF events
- [ ] **Deployment Compatibility**: Ensure existing deploy.sh script continues to work

## Implementation Plan

### Phase 1: WAF Configuration
1. **Create WAF Web ACL**
   - Set scope to "CLOUDFRONT" (required for CloudFront)
   - Configure default action (ALLOW for legitimate traffic)
   - Set up CloudWatch metrics and logging

2. **Rate Limiting Rules**
   - **Rule 1**: 100 requests per 5-minute window per IP
   - **Rule 2**: 1000 requests per 5-minute window per IP (burst protection)
   - **Rule 3**: Block requests exceeding 10 requests per second per IP

### Phase 2: Terraform Implementation
3. **WAF Resources**
   - Create `aws_wafv2_web_acl` resource
   - Create `aws_wafv2_rule_group` for custom rules
   - Create `aws_wafv2_ip_set` for IP allowlists/blocklists

4. **CloudFront Integration**
   - Update `aws_cloudfront_distribution` to include `web_acl_id`
   - Ensure WAF is attached to the default cache behavior
   - Test WAF attachment without breaking existing functionality

### Phase 3: Monitoring & Testing
5. **CloudWatch Setup**
   - Enable WAF logging to CloudWatch
   - Set up metrics for blocked requests
   - Create alarms for unusual traffic patterns

6. **Testing & Validation**
   - Test rate limiting with controlled requests
   - Confirm legitimate traffic passes through
   - Monitor costs and adjust rules if needed

## Technical Implementation Details

### Terraform Configuration

**New File: `infra/live/waf.tf`**
```hcl
# WAF Web ACL for CloudFront
resource "aws_wafv2_web_acl" "main" {
  name  = "jgreen-one-waf"
  scope = "CLOUDFRONT"
  
  default_action {
    allow {}
  }
  
  # Rate limiting rule - 100 requests per 5 minutes per IP
  rule {
    name     = "RateLimitRule"
    priority = 1
    
    action {
      block {}
    }
    
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
  
  tags = {
    Name        = "jgreen-one-waf"
    Environment = "production"
  }
}

# CloudWatch Log Group for WAF logs
resource "aws_cloudwatch_log_group" "waf_logs" {
  name              = "/aws/wafv2/jgreen-one"
  retention_in_days = 30
  
  tags = {
    Name        = "jgreen-one-waf-logs"
    Environment = "production"
  }
}

# WAF Logging Configuration
resource "aws_wafv2_web_acl_logging_configuration" "main" {
  resource_arn = aws_wafv2_web_acl.main.arn
  
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
}
```

**Updated: `infra/live/cloudfront.tf`**
```hcl
resource "aws_cloudfront_distribution" "cdn" {
  enabled         = true
  is_ipv6_enabled = true
  comment         = "Static site for ${var.domain}"
  aliases         = [var.domain, "www.${var.domain}"]
  
  # Add WAF Web ACL
  web_acl_id = aws_wafv2_web_acl.main.arn

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = local.s3_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.oac.id
  }

  default_root_object = "index.html"

  default_cache_behavior {
    target_origin_id       = local.s3_origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.caching_optimized_policy_id
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.subdirectory_index_rewrite.arn
    }
  }

  # ... rest of existing configuration ...
}
```

### Cost Breakdown

**Monthly WAF Costs:**
- **Web ACL**: $5.00/month
- **Rules**: $1.00/month (1 custom rule at $1.00/month)
- **Requests**: ~$0.60/month (for 1M requests/month)
- **Total**: ~$6.60/month

## Risk Assessment & Mitigation

### High Risk
- **WAF Misconfiguration**: Could block legitimate traffic
  - *Mitigation*: Start with permissive rules, monitor logs, adjust gradually
- **Cost Overrun**: Unexpected traffic could increase costs
  - *Mitigation*: Set up billing alerts, monitor request volumes

### Medium Risk
- **False Positives**: Legitimate users might get blocked
  - *Mitigation*: Monitor logs, adjust rate limits based on real traffic patterns
- **Performance Impact**: WAF adds latency
  - *Mitigation*: WAF latency is typically <10ms, monitor performance metrics

### Low Risk
- **Rule Updates**: AWS managed rules update automatically
  - *Mitigation*: Monitor rule changes, test after updates

## Testing Strategy

### Local Testing
1. **Terraform Validation**: `terraform plan` to verify WAF configuration
2. **Rule Testing**: Test individual rules in AWS console
3. **Cost Estimation**: Use AWS pricing calculator

### Staging Testing
1. **Rate Limiting**: Send controlled requests to test rate limits
2. **Legitimate Traffic**: Verify normal users aren't blocked
3. **Performance**: Measure latency impact

### Production Validation
1. **Traffic Monitoring**: Watch CloudWatch metrics for blocked requests
2. **Cost Monitoring**: Track WAF costs vs. estimates
3. **Log Analysis**: Review WAF logs for attack patterns
4. **User Feedback**: Monitor for any legitimate user issues

## Success Criteria

- [ ] WAF Web ACL attached to CloudFront distribution
- [ ] Rate limiting blocks excessive requests (test with >100 requests/5min)
- [ ] Legitimate traffic passes through without issues
- [ ] CloudWatch logs show WAF activity
- [ ] Monthly cost stays under $7.00
- [ ] No impact on site performance (<50ms additional latency)

## Open Questions

- [ ] **Rate Limits**: Are 100 requests/5min appropriate for personal site traffic?
- [ ] **Geographic Blocking**: Should we block any specific countries?
- [ ] **IP Allowlisting**: Do we need to allowlist any specific IPs?
- [ ] **Log Retention**: Is 30 days sufficient for log retention?
- [ ] **Monitoring**: Should we set up alerts for blocked requests?

## Dependencies

- Existing AWS CloudFront distribution
- Terraform for infrastructure management
- CloudWatch for monitoring and logging
- AWS WAF v2 service availability

## Estimated Timeline

- **Planning & Configuration**: 2-3 hours
- **Terraform Implementation**: 2-3 hours
- **Testing & Validation**: 2-3 hours
- **Monitoring Setup**: 1-2 hours
- **Total**: 7-11 hours

## Priority

**Medium Priority** - This adds an important security layer to the site to protect against denial-of-funds attacks without major architectural changes. The estimated cost is ~$6.60/month.

## Notes

- **AWS Managed Rules**: Automatically updated by AWS for new attack patterns
- **Rate Limiting**: Configurable based on actual traffic patterns
- **Cost Monitoring**: Set up billing alerts to track costs
- **Log Analysis**: Regular review of WAF logs for security insights
- **Future Blog Post**: "Adding AWS WAF Protection to a Static Site"