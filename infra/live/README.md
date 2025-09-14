# Live Infrastructure

This directory contains the Terraform code for the live infrastructure of jgreen.one.

## Overview

The infrastructure is designed to host a static website using a combination of AWS services. The primary goal is to provide a secure, scalable, and cost-effective solution for serving the website's content.

## Architecture

The architecture consists of the following components:

-   **Amazon S3:** An S3 bucket is used to store the static website content (HTML, CSS, JavaScript, images, etc.).
-   **Amazon CloudFront:** A CloudFront distribution is used to serve the website content to users. It provides caching at edge locations for improved performance and a secure connection using an SSL/TLS certificate.
-   **AWS Certificate Manager (ACM):** An ACM certificate is used to enable HTTPS for the custom domain.
-   **Amazon Route 53:** Route 53 is used to manage the DNS records for the custom domain, pointing the domain to the CloudFront distribution.
-   **CloudFront Function:** A CloudFront Function is used to rewrite requests for subdirectories to their respective `index.html` files, enabling clean URLs.

## Components

The Terraform code is organized into the following files:

-   `backend.tf`: Configures the Terraform backend to use an S3 bucket for storing the Terraform state.
-   `certificate.tf`: Manages the ACM certificate for the custom domain.
-   `cloudfront.tf`: Defines the CloudFront distribution, including the origin access control (OAC) to restrict access to the S3 bucket and the CloudFront Function for URL rewrites.
-   `dns.tf`: Manages the Route 53 DNS records for the custom domain.
-   `function.js`: Contains the JavaScript code for the CloudFront Function that rewrites subdirectory requests to `index.html`.
-   `outputs.tf`: Defines the outputs of the Terraform stack, such as the S3 bucket name and CloudFront distribution domain.
-   `providers.tf`: Configures the AWS provider and an additional provider for the `us-east-1` region, which is required for ACM certificates used with CloudFront.
-   `storage.tf`: Defines the S3 bucket for storing the website content, including server-side encryption and versioning.
-   `variables.tf`: Contains the input variables for the Terraform stack, such as the domain name and S3 bucket name.
-   `versions.tf`: Specifies the required versions of Terraform and the AWS provider.

## Deployment

The infrastructure is deployed using Terraform. The following steps are required:

1.  **Initialize Terraform:**
    ```bash
    terraform init
    ```
2.  **Plan the changes:**
    ```bash
    terraform plan
    ```
3.  **Apply the changes:**
    ```bash
    terraform apply
    ```

## Variables

| Name               | Description                                           | Type   | Default         |
| ------------------ | ----------------------------------------------------- | ------ | --------------- |
| `region`           | The AWS region to deploy the infrastructure in.       | `string` | `us-east-1`     |
| `domain`           | The custom domain name for the website.               | `string` | `jgreen.one`    |
| `site_bucket_name` | The name of the S3 bucket for the website content.    | `string` | `jgreen-one-site` |
| `price_class`      | The CloudFront price class to use.                    | `string` | `PriceClass_100`|

## Outputs

| Name                | Description                               |
| ------------------- | ----------------------------------------- |
| `site_bucket`       | The name of the S3 bucket.                |
| `cloudfront_domain` | The domain name of the CloudFront distribution. |
| `cloudfront_id`     | The ID of the CloudFront distribution.    |
| `hosted_zone_id`    | The ID of the Route 53 hosted zone.       |
| `name_servers`      | The name servers for the Route 53 hosted zone.|
