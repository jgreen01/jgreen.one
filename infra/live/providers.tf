provider "aws" {
  region = var.region
}

# us-east-1 provider for ACM cert used by CloudFront (required)
provider "aws" {
  alias  = "use1"
  region = "us-east-1"
}

# The account the credentials belong to. Derived rather than written down: it is
# the same value either way, but this keeps an account identifier out of a public
# repository and makes the config portable to another account unchanged.
data "aws_caller_identity" "current" {}
