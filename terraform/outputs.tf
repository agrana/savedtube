output "zone_id" {
  description = "Cloudflare Zone ID for the domain"
  value       = data.cloudflare_zone.main.id
}

output "domain_name" {
  description = "The configured domain name"
  value       = local.domain_name
}

output "dns_records" {
  description = "Created DNS records"
  value = {
    root = cloudflare_record.root.hostname
    www  = cloudflare_record.www.hostname
    api  = cloudflare_record.api.hostname
  }
}

output "email_forwarding_rules" {
  description = "Created email forwarding rules"
  value = {
    support = "support@${local.domain_name} -> ${var.support_email}"
    contact = "contact@${local.domain_name} -> ${var.contact_email}"
    hello   = "hello@${local.domain_name} -> ${var.contact_email}"
  }
}
