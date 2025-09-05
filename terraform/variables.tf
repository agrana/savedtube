variable "domain_name" {
  description = "The domain name for SavedTube (e.g., savedtube.com)"
  type        = string
}

variable "app_url" {
  description = "The URL where the SavedTube app is hosted (e.g., savedtube.vercel.app)"
  type        = string
}

variable "support_email" {
  description = "Email address to forward support emails to"
  type        = string
}

variable "contact_email" {
  description = "Email address to forward contact emails to"
  type        = string
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with all required permissions (Zone:Zone:Read, Zone:DNS:Edit, Zone:Email Routing:Read, Zone:Email Routing:Edit)"
  type        = string
  sensitive   = true
}
