# Email forwarding rules
resource "cloudflare_email_routing_rule" "support" {
  zone_id = var.zone_id
  name    = "Support emails"
  enabled = true
  matchers = [{
    type  = "literal"
    field = "to"
    value = "support@${var.domain_name}"
  }]
  actions = [{
    type  = "forward"
    value = [var.support_email]
  }]
}

resource "cloudflare_email_routing_rule" "contact" {
  zone_id = var.zone_id
  name    = "Contact emails"
  enabled = true
  matchers = [{
    type  = "literal"
    field = "to"
    value = "contact@${var.domain_name}"
  }]
  actions = [{
    type  = "forward"
    value = [var.contact_email]
  }]
}

resource "cloudflare_email_routing_rule" "hello" {
  zone_id = var.zone_id
  name    = "Hello emails"
  enabled = true
  matchers = [{
    type  = "literal"
    field = "to"
    value = "hello@${var.domain_name}"
  }]
  actions = [{
    type  = "forward"
    value = [var.contact_email]
  }]
}
