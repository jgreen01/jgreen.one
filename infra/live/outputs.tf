output "site_bucket"       { value = aws_s3_bucket.site.bucket }
output "cloudfront_domain" { value = aws_cloudfront_distribution.cdn.domain_name }
output "cloudfront_id"     { value = aws_cloudfront_distribution.cdn.id }
output "hosted_zone_id" { value = aws_route53_zone.primary.zone_id }
output "name_servers" { value = aws_route53_zone.primary.name_servers }
