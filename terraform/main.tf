terraform {
  required_version = ">= 1.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# Configure the Cloudflare Provider
provider "cloudflare" {
  # API token will be read from CLOUDFLARE_API_TOKEN environment variable
  # or from cloudflare.tfvars file
}

# Local variables for common values
locals {
  domain_name = var.domain_name
  zone_id     = data.cloudflare_zone.main.id
}

# Data source to get the zone ID for the domain
data "cloudflare_zone" "main" {
  name = local.domain_name
}

# Create DNS records
resource "cloudflare_record" "root" {
  zone_id = local.zone_id
  name    = "@"
  content = var.app_url
  type    = "CNAME"
  proxied = true
  comment = "Root domain pointing to SavedTube app"
}

resource "cloudflare_record" "www" {
  zone_id = local.zone_id
  name    = "www"
  content = var.app_url
  type    = "CNAME"
  proxied = true
  comment = "WWW subdomain pointing to SavedTube app"
}

resource "cloudflare_record" "api" {
  zone_id = local.zone_id
  name    = "api"
  content = var.app_url
  type    = "CNAME"
  proxied = true
  comment = "API subdomain for SavedTube"
}

# Email forwarding rules
resource "cloudflare_email_routing_rule" "support" {
  zone_id = local.zone_id
  name    = "Support emails"
  enabled = true
  matchers = [{
    type  = "literal"
    field = "to"
    value = "support@${local.domain_name}"
  }]
  actions = [{
    type  = "forward"
    value = [var.support_email]
  }]
}

resource "cloudflare_email_routing_rule" "contact" {
  zone_id = local.zone_id
  name    = "Contact emails"
  enabled = true
  matchers = [{
    type  = "literal"
    field = "to"
    value = "contact@${local.domain_name}"
  }]
  actions = [{
    type  = "forward"
    value = [var.contact_email]
  }]
}

resource "cloudflare_email_routing_rule" "hello" {
  zone_id = local.zone_id
  name    = "Hello emails"
  enabled = true
  matchers = [{
    type  = "literal"
    field = "to"
    value = "hello@${local.domain_name}"
  }]
  actions = [{
    type  = "forward"
    value = [var.contact_email]
  }]
}

# Page Rules for better performance and security
resource "cloudflare_page_rule" "cache_static_assets" {
  zone_id  = local.zone_id
  target   = "${local.domain_name}/_next/static/*"
  priority = 1
  status   = "active"

  actions = {
    cache_level = "cache_everything"
    edge_cache_ttl = 31536000 # 1 year
  }
}

resource "cloudflare_page_rule" "security_headers" {
  zone_id  = local.zone_id
  target   = "${local.domain_name}/*"
  priority = 2
  status   = "active"

  actions = {
    security_level = "high"
    ssl = "full"
  }
}
