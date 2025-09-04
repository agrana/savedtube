# Local variables for common values
locals {
  domain_name = var.domain_name
  zone_id     = data.cloudflare_zone.main.id
}

# Data source to get the zone ID for the domain
data "cloudflare_zone" "main" {
  name = local.domain_name
}

# DNS Module
module "dns" {
  source = "./modules/dns"

  zone_id     = local.zone_id
  domain_name = local.domain_name
  app_url     = var.app_url
}

# Email Routing Module
module "email_routing" {
  source = "./modules/email_routing"

  zone_id       = local.zone_id
  domain_name   = local.domain_name
  support_email = var.support_email
  contact_email = var.contact_email
}
