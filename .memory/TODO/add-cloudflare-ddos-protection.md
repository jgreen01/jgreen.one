# Feature: Hybrid Cloudflare DDoS Protection

## Goal

Implement a hybrid Cloudflare + AWS architecture to provide free DDoS protection for the website, leveraging Cloudflare's free tier while maintaining the existing AWS hosting infrastructure.

## Requirements

- [ ] Use Cloudflare's free tier for DDoS protection and CDN.
- [ ] Keep the website's content hosted on AWS S3 and served via CloudFront.
- [ ] Manage the Cloudflare DNS records using Terraform.
- [ ] Ensure a secure, end-to-end encrypted connection from the user to the origin server.

## Implementation Plan

1.  **Cloudflare Account Setup (Manual):**
    *   Create a free Cloudflare account.
    *   Add the domain (`jgreen.one`) to Cloudflare.
    *   Update the domain's nameservers at the registrar (Porkbun) to the nameservers provided by Cloudflare.
    *   Create a Cloudflare API token with permissions to edit DNS records for your domain.

2.  **Terraform Configuration (Code):**
    *   **Add Cloudflare Provider:** Add the Cloudflare provider to `infra/live/providers.tf`.
    *   **Add Variables:** Add `cloudflare_api_token` and `cloudflare_zone_id` variables to `infra/live/variables.tf`.
    *   **Update `dns.tf`:**
        *   Remove the `aws_route53_zone` and `aws_route53_record` resources.
        *   Add `cloudflare_record` resources for the apex domain and `www` subdomain, pointing to the CloudFront distribution.
    *   **Update `certificate.tf`:** Modify the `aws_acm_certificate` resource to use DNS validation records created in Cloudflare's DNS.

3.  **Cloudflare Dashboard Configuration (Manual):**
    *   Set the SSL/TLS encryption mode to **Full (Strict)** in the Cloudflare dashboard.

## Open Questions

- [ ] How will this impact the deployment script (`scripts/deploy.sh`)? (It shouldn't, but it's good to verify.)

## Notes

This is a low-priority task that can be implemented in the future if we experience a DDoS attack, have extra time, or want to write a blog post about the process. It provides a significant security improvement for no additional cost, other than the time to implement it.
