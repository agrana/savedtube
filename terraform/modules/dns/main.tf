terraform {
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

# DNS Records
resource "cloudflare_record" "root" {
  zone_id         = var.zone_id
  name            = "savedtube.com"
  content         = "216.198.79.1"
  type            = "A"
  proxied         = true
  allow_overwrite = false
  comment         = "Root domain pointing to IP address"
}

resource "cloudflare_record" "www" {
  zone_id         = var.zone_id
  name            = "www"
  content         = "216.198.79.1"
  type            = "A"
  proxied         = true
  allow_overwrite = false
  comment         = "WWW subdomain pointing to IP address"
}

resource "cloudflare_record" "api" {
  zone_id         = var.zone_id
  name            = "api"
  content         = var.app_url
  type            = "CNAME"
  proxied         = true
  allow_overwrite = false
  comment         = "API subdomain for SavedTube"
}

# Page Rules temporarily disabled due to provider bug
# TODO: Re-enable when Cloudflare provider is fixed
