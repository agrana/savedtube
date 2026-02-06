.PHONY: init plan apply destroy clean help

# Default target
help:
	@echo "Available targets:"
	@echo "  init    - Initialize Terraform"
	@echo "  plan    - Show planned changes"
	@echo "  apply   - Apply changes"
	@echo "  destroy - Destroy infrastructure"
	@echo "  clean   - Clean up Terraform files"
	@echo "  help    - Show this help"

init:
	terraform init

plan:
	terraform plan

apply:
	terraform apply

destroy:
	terraform destroy

clean:
	rm -rf .terraform
	rm -f .terraform.lock.hcl
	rm -f *.tfstate*
	rm -f *.tfplan*

# Development helpers
fmt:
	terraform fmt -recursive

validate:
	terraform validate

# Show outputs
output:
	terraform output
