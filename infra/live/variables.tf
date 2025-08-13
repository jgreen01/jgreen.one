variable "region" {
  type = string
  default = "us-east-1"
}
variable "domain" {
  type = string
  default = "jgreen.one"
} # adjust if needed
variable "site_bucket_name" {
  type        = string
  description = "S3 bucket for site content (no dots okay either way)"
  default     = "jgreen-one-site"
}
variable "price_class" {
  type = string
  default = "PriceClass_100"
}