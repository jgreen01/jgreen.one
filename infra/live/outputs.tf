output "site_bucket"       { value = aws_s3_bucket.site.bucket }
output "cloudfront_domain" { value = aws_cloudfront_distribution.cdn.domain_name }
output "cloudfront_id"     { value = aws_cloudfront_distribution.cdn.id }