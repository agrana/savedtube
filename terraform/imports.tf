# Import existing DNS records using import blocks
# This will automatically import existing records into Terraform state

import {
  to = module.dns.cloudflare_record.root
  id = "357eab39e81aa48146195682a4685b93/fb19f3f111072b0b8a1fcbf99e387545"
}

import {
  to = module.dns.cloudflare_record.www
  id = "357eab39e81aa48146195682a4685b93/ed3c71cccfa837d6a3e287e892cd2bc1"
}

# Import existing email routing rule
import {
  to = module.email_routing.cloudflare_email_routing_rule.support
  id = "357eab39e81aa48146195682a4685b93/f69bd746d25f4210a70fd677e71761ab"
}