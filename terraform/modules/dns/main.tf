# DNS Records
resource "cloudflare_record" "root" {
  zone_id = var.zone_id
  name    = "@"
  content = var.app_url
  type    = "CNAME"
  proxied = true
  comment = "Root domain pointing to SavedTube app"
}

resource "cloudflare_record" "www" {
  zone_id = var.zone_id
  name    = "www"
  content = var.app_url
  type    = "CNAME"
  proxied = true
  comment = "WWW subdomain pointing to SavedTube app"
}

resource "cloudflare_record" "api" {
  zone_id = var.zone_id
  name    = "api"
  content = var.app_url
  type    = "CNAME"
  proxied = true
  comment = "API subdomain for SavedTube"
}

# Page Rules for better performance and security
resource "cloudflare_page_rule" "cache_static_assets" {
  zone_id  = var.zone_id
  target   = "${var.domain_name}/_next/static/*"
  priority = 1
  status   = "active"

  actions = {
    cache_level = "cache_everything"
    edge_cache_ttl = 31536000 # 1 year
  }
}

resource "cloudflare_page_rule" "security_headers" {
  zone_id  = var.zone_id
  target   = "${var.domain_name}/*"
  priority = 2
  status   = "active"

  actions = {
    security_level = "high"
    ssl = "full"
  }
}
