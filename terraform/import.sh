#!/bin/bash

# Script to import existing Cloudflare DNS records into Terraform state
# Run this script before applying Terraform changes

echo "Importing existing DNS records into Terraform state..."

# Import root domain record
echo "Importing root domain record..."
terraform import module.dns.cloudflare_record.root 357eab39e81aa48146195682a4685b93/fb19f3f111072b0b8a1fcbf99e387545

# Import www record
echo "Importing www record..."
terraform import module.dns.cloudflare_record.www 357eab39e81aa48146195682a4685b93/ed3c71cccfa837d6a3e287e892cd2bc1

echo "Import completed!"
echo "Run 'terraform plan' to see the changes that will be made."
