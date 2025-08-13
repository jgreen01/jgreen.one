# Request a cert for apex + www
resource "aws_acm_certificate" "cert" {
  provider          = aws.use1
  domain_name       = var.domain
  validation_method = "DNS"
  subject_alternative_names = ["www.${var.domain}"]
  lifecycle { create_before_destroy = true }
}

# One validation record per domain/SAN
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.cert.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }
  zone_id = aws_route53_zone.primary.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "cert" {
  provider                = aws.use1
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}