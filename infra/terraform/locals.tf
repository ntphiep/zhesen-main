data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id

  # Fixed, not a variable: bin/render-env.sh, bin/backup.sh and env.template
  # carry the same literal in their SSM paths.
  name_prefix = "zhesen"

  assets_bucket = "${local.name_prefix}-infra-assets-${local.account_id}"
  backup_bucket = "${local.name_prefix}-db-backups-${local.account_id}"

  # Everything the browser and the Vercel functions talk to goes through CloudFront.
  api_url = "https://${aws_cloudfront_distribution.api.domain_name}"

  # Where cloud-init unpacks infra/supabase on the instance.
  compose_dir = "/opt/zhesen/supabase"

  ssm_prefix = "/${local.name_prefix}/prod"

  # Files under infra/supabase, uploaded to the assets bucket for cloud-init to sync.
  asset_files = fileset("${path.module}/../supabase", "**")

  content_types = {
    "yml"      = "application/yaml"
    "yaml"     = "application/yaml"
    "sh"       = "text/x-shellscript"
    "sql"      = "application/sql"
    "ps1"      = "text/plain"
    "md"       = "text/markdown"
    "template" = "text/plain"
  }
}
