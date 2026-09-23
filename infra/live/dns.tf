resource "aws_route53_zone" "primary" {
  name = var.domain
}

resource "aws_route53_record" "apex" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.cdn.domain_name
    zone_id                = aws_cloudfront_distribution.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "apex_ipv6" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.cdn.domain_name
    zone_id                = aws_cloudfront_distribution.cdn.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = [var.domain]
}

# Records made by hand, then imported into Terraform (task K). Mail depends on
# all of them, and the search consoles on the verification ones.
#
# - Every record is prevent_destroy. To remove one on purpose, delete that line
#   first.
# - Never allow_overwrite or ignore_changes (tests/unit/terraformDns.test.ts
#   fails on either).
# - The apex TXT is ONE record holding every value at the name. A new
#   verification token is a new line in its list; dropping a line deletes it
#   from DNS, and dropping SPF makes mail fail DMARC (p=reject).

resource "aws_route53_record" "apex_txt" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain
  type    = "TXT"
  ttl     = 300
  records = [
    "google-site-verification=13KJGqY9aCTTX8gB1Shjz1dcJVEkCFseS8o6c7YzbUo",
    "protonmail-verification=0b761c29c3c61e6e127b149ee58a6afb5c3200d7",
    "v=spf1 include:_spf.protonmail.ch ~all",
  ]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "apex_mx" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = var.domain
  type    = "MX"
  ttl     = 300
  records = ["10 mail.protonmail.ch.", "20 mailsec.protonmail.ch."]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "dmarc" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "_dmarc.${var.domain}"
  type    = "TXT"
  ttl     = 300
  records = ["v=DMARC1; p=reject; adkim=s; aspf=r; pct=100; rua=mailto:dmarc@jgreen.one"]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "tls_rpt" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "_smtp._tls.${var.domain}"
  type    = "TXT"
  ttl     = 300
  records = ["v=TLSRPTv1; rua=mailto:dmarc@jgreen.one"]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "dkim_protonmail" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "protonmail._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["protonmail.domainkey.d54pewfq5vdcb7csj6kxx6siexvqx6iqqeibyehqfnpeddff75xkq.domains.proton.ch."]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "dkim_protonmail2" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "protonmail2._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["protonmail2.domainkey.d54pewfq5vdcb7csj6kxx6siexvqx6iqqeibyehqfnpeddff75xkq.domains.proton.ch."]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "dkim_protonmail3" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "protonmail3._domainkey.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["protonmail3.domainkey.d54pewfq5vdcb7csj6kxx6siexvqx6iqqeibyehqfnpeddff75xkq.domains.proton.ch."]

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_route53_record" "bing_verification" {
  zone_id = aws_route53_zone.primary.zone_id
  name    = "6ac0a29a216186bfbc65aa3d83928eaa.${var.domain}"
  type    = "CNAME"
  ttl     = 300
  records = ["verify.bing.com"]

  lifecycle {
    prevent_destroy = true
  }
}
