terraform {
  backend "s3" {
    bucket = "tfstate-jgreen-one"
    key    = "live/terraform.tfstate"
    region = "us-west-2"
  }
}
