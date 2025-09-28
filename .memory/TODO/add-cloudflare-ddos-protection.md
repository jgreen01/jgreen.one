# Feature: CloudFlare DDoS Protection & CDN Integration

## Goal

Implement CloudFlare as the primary CDN and DDoS protection layer for jgreen.one, creating a hybrid architecture that leverages CloudFlare's free tier while maintaining the existing AWS S3 + CloudFront infrastructure as the origin.

## Requirements

### Functional Requirements
- [ ] **DDoS Protection**: Leverage CloudFlare's automatic DDoS mitigation (free tier includes basic DDoS protection)
- [ ] **Enhanced CDN**: Use CloudFlare's global edge network for improved performance
- [ ] **SSL/TLS Security**: Maintain end-to-end encryption with CloudFlare → CloudFront → S3
- [ ] **DNS Management**: Migrate DNS from Route 53 to CloudFlare for centralized management
- [ ] **Zero Downtime**: Implement migration without service interruption
- [ ] **Cost Optimization**: Maintain current AWS costs while adding free CloudFlare benefits

### Technical Requirements
- [ ] **CloudFlare Free Tier**: Utilize free plan features (DDoS protection, CDN, SSL)
- [ ] **AWS Integration**: Keep S3 + CloudFront as origin (no changes to existing infrastructure)
- [ ] **Terraform Management**: Manage CloudFlare resources via Terraform
- [ ] **Certificate Management**: Handle SSL certificates for both CloudFlare and CloudFront
- [ ] **Deployment Compatibility**: Ensure existing deploy.sh script continues to work

## Implementation Plan

### Phase 1: Pre-Migration Setup
1. **CloudFlare Account & Domain Setup**
   - Create CloudFlare account (free tier)
   - Add `jgreen.one` domain to CloudFlare
   - Verify domain ownership
   - Note current Route 53 nameservers for rollback plan

2. **Terraform Provider Configuration**
   - Add CloudFlare provider to `infra/live/providers.tf`
   - Add required variables to `infra/live/variables.tf`:
     - `cloudflare_api_token` (sensitive)
     - `cloudflare_zone_id`
   - Create `terraform.tfvars.example` with variable documentation

### Phase 2: DNS Migration
3. **DNS Records Migration**
   - Create `infra/live/cloudflare-dns.tf` with:
     - `cloudflare_record` for apex domain (A record → CloudFront)
     - `cloudflare_record` for www subdomain (CNAME → apex)
     - `cloudflare_record` for IPv6 (AAAA record → CloudFront)
   - Update `infra/live/dns.tf` to conditionally create Route 53 resources
   - Add variable `use_cloudflare_dns` (boolean, default false)

4. **SSL Certificate Strategy**
   - **Option A**: Use CloudFlare's free SSL (Flexible mode) + CloudFront's ACM cert
   - **Option B**: Use CloudFlare's SSL (Full mode) + CloudFront's ACM cert
   - **Recommended**: Option B for better security
   - Update `infra/live/certificate.tf` to handle CloudFlare DNS validation

### Phase 3: CloudFlare Configuration
5. **CloudFlare Dashboard Settings**
   - SSL/TLS encryption mode: **Full (Strict)**
   - Always Use HTTPS: **On**
   - HTTP Strict Transport Security (HSTS): **On**
   - Minimum TLS Version: **TLS 1.2**
   - Opportunistic Encryption: **On**
   - TLS 1.3: **On**

6. **Security & Performance Settings**
   - Security Level: **Medium**
   - Browser Integrity Check: **On**
   - Challenge Passage: **30 minutes**
   - Cache Level: **Standard**
   - Browser Cache TTL: **4 hours**
   - Always Online: **On**

### Phase 4: Migration Execution
7. **DNS Cutover**
   - Update domain registrar (Porkbun) nameservers to CloudFlare
   - Monitor DNS propagation (can take up to 48 hours)
   - Verify site accessibility through CloudFlare
   - Test SSL certificate validity

8. **Post-Migration Cleanup**
   - Remove Route 53 hosted zone (after confirming CloudFlare is working)
   - Update `infra/live/outputs.tf` to remove Route 53 outputs
   - Update documentation
   - **Implement Cloudflare cache purging in the `deploy.sh` script.** This is to ensure that new deployments are immediately reflected on the site.

### Phase 5: Monitoring & Optimization
9. **Performance Monitoring**
   - Set up CloudFlare Analytics
   - Monitor Core Web Vitals
   - Compare performance metrics pre/post migration
   - Document performance improvements

## Technical Implementation Details

### Terraform Configuration Changes

**New File: `infra/live/cloudflare-dns.tf`**
```hcl
resource "cloudflare_record" "apex" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  type    = "CNAME"
  content = aws_cloudfront_distribution.cdn.domain_name
  proxied = true
}

resource "cloudflare_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  type    = "CNAME"
  content = var.domain
  proxied = true
}
```

**Updated: `infra/live/variables.tf`**
```hcl
variable "cloudflare_api_token" {
  type        = string
  description = "CloudFlare API token for DNS management"
  sensitive   = true
}

variable "cloudflare_zone_id" {
  type        = string
  description = "CloudFlare zone ID for jgreen.one"
}

variable "use_cloudflare_dns" {
  type        = bool
  description = "Use CloudFlare for DNS management instead of Route 53"
  default     = false
}
```

### SSL Certificate Management
- CloudFlare will handle SSL termination at the edge
- CloudFront will continue using ACM certificate for origin communication
- No changes needed to existing ACM certificate setup

## Risk Assessment & Mitigation

### High Risk
- **DNS Propagation Delays**: Site may be temporarily inaccessible
  - *Mitigation*: Implement during low-traffic period, have rollback plan ready

### Medium Risk
- **SSL Certificate Issues**: Potential SSL errors during transition
  - *Mitigation*: Test SSL configuration in CloudFlare dashboard before cutover
- **CloudFlare Service Outages**: Dependency on CloudFlare availability
  - *Mitigation*: CloudFlare has excellent uptime, free tier includes basic SLA

### Low Risk
- **Performance Degradation**: Potential latency increase
  - *Mitigation*: CloudFlare typically improves performance, monitor metrics

## Rollback Plan

1. **Immediate Rollback**: Update nameservers back to Route 53
2. **DNS Propagation**: Wait for DNS changes to propagate (up to 48 hours)
3. **Verification**: Confirm site accessibility and SSL functionality
4. **Cleanup**: Remove CloudFlare resources if needed

## Success Criteria

- [ ] Site accessible through CloudFlare with SSL
- [ ] DDoS protection active (test with basic tools)
- [ ] Performance metrics maintained or improved
- [ ] Deploy script continues to work without modification
- [ ] SSL Labs rating remains A+ or improves
- [ ] Zero downtime during migration

## Open Questions

- [ ] **Domain Registrar**: Confirm Porkbun supports nameserver changes (likely yes)
- [ ] **CloudFlare API Limits**: Verify free tier API limits for Terraform operations
- [ ] **Monitoring**: Should we implement CloudFlare-specific monitoring/alerting?
- [ ] **Cache Purging**: Do we need to implement CloudFlare cache purging in deploy script?

## Dependencies

- CloudFlare free account
- Access to domain registrar (Porkbun)
- Existing AWS infrastructure (S3, CloudFront, ACM)
- Terraform state management

## Estimated Timeline

- **Planning & Setup**: 2-4 hours
- **Implementation**: 4-6 hours
- **Testing & Validation**: 2-3 hours
- **Total**: 8-13 hours

## Priority

**Medium Priority** - This is a security and performance enhancement that can be implemented when time permits. The current AWS-only setup is already secure and performant, but CloudFlare adds an additional layer of protection and potential performance improvements at no additional cost.

## Notes

- CloudFlare free tier includes basic DDoS protection, which is sufficient for most personal websites
- The hybrid architecture (CloudFlare → CloudFront → S3) provides defense in depth
- This implementation maintains all existing AWS infrastructure, minimizing risk
- Future blog post opportunity: "Adding CloudFlare DDoS Protection to a Static Site"