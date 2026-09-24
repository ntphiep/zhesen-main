# One environment, six modules, each owning one concern. Terraform forbids a cycle
# between modules, which fixes two placements: the ingress rule from the
# CloudFront origin sits in `edge`, because it references a security group that
# CloudFront creates, and the SSM parameters carrying the API URL sit in
# `settings`, because the instance must exist before that URL does.

data "aws_caller_identity" "current" {}

locals {
  # Fixed, not a variable: bin/render-env.sh, bin/backup.sh and env.template
  # carry the same literal in their SSM paths.
  name_prefix = "zhesen"
  ssm_prefix  = "/${local.name_prefix}/prod"
  account_id  = data.aws_caller_identity.current.account_id

  assets_bucket = "${local.name_prefix}-infra-assets-${local.account_id}"
  backup_bucket = "${local.name_prefix}-db-backups-${local.account_id}"

  # Everything the browser and the Vercel functions talk to goes through CloudFront.
  api_url = "https://${module.edge.domain_name}"
}

module "alerts" {
  source = "./modules/alerts"

  name_prefix = local.name_prefix
  region      = var.region
  alert_email = var.alert_email
  budget_usd  = var.budget_usd
}

module "backup" {
  source = "./modules/backup"

  bucket      = local.backup_bucket
  retain_days = var.backup_retain_days
}

module "instance" {
  source = "./modules/instance"

  name_prefix       = local.name_prefix
  region            = var.region
  availability_zone = var.availability_zone
  instance_type     = var.instance_type
  root_volume_gb    = var.root_volume_gb
  ssm_prefix        = local.ssm_prefix
  stack_dir         = "${path.root}/../supabase"
  assets_bucket     = local.assets_bucket
  backup_bucket     = local.backup_bucket
  backup_bucket_arn = module.backup.bucket_arn
  alerts_topic_arn  = module.alerts.topic_arn
}

module "edge" {
  source = "./modules/edge"

  name_prefix          = local.name_prefix
  vpc_id               = module.instance.vpc_id
  instance_arn         = module.instance.instance_arn
  instance_private_dns = module.instance.private_dns
  security_group_id    = module.instance.security_group_id
}

module "settings" {
  source = "./modules/settings"

  ssm_prefix = local.ssm_prefix
  parameters = {
    site_url                 = var.site_url
    additional_redirect_urls = var.additional_redirect_urls
    api_external_url         = "${local.api_url}/auth/v1"
    public_url               = local.api_url
    dashboard_username       = local.name_prefix

    # bin/backup.sh reads backup_bucket; a re-sync of infra/supabase reads assets_bucket.
    assets_bucket = local.assets_bucket
    backup_bucket = local.backup_bucket

    # bin/backup.sh publishes here when a dump fails.
    alerts_topic_arn = module.alerts.topic_arn
  }
}

module "vercel" {
  source = "./modules/vercel"

  name_prefix       = local.name_prefix
  team_slug         = var.vercel_team_slug
  project           = var.vercel_project
  backup_bucket_arn = module.backup.bucket_arn
}
