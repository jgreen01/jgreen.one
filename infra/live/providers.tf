provider "aws" {
  region = var.region
}

# us-east-1 provider for ACM cert used by CloudFront (required)
provider "aws" {
  alias  = "use1"
  region = "us-east-1"
}