# Every generated secret is alphanumeric. POSTGRES_PASSWORD is interpolated into
# postgres:// URLs in the compose file, where a punctuation character would have
# to be percent-encoded; the others share the rule so nothing has two forms.
resource "random_password" "postgres_password" {
  length  = 40
  special = false
}

resource "random_password" "dashboard_password" {
  length  = 32
  special = false
}

resource "random_password" "pg_meta_crypto_key" {
  length  = 32
  special = false
}

resource "random_password" "secret_key_base" {
  length  = 64
  special = false
}

# Supavisor's documented rule: exactly 32 characters.
resource "random_password" "vault_enc_key" {
  length  = 32
  special = false
}

# Written once. `ignore_changes` keeps a later apply from rotating a password out
# from under a running database.
resource "aws_ssm_parameter" "generated" {
  for_each = {
    postgres_password  = random_password.postgres_password.result
    dashboard_password = random_password.dashboard_password.result
    pg_meta_crypto_key = random_password.pg_meta_crypto_key.result
    secret_key_base    = random_password.secret_key_base.result
    vault_enc_key      = random_password.vault_enc_key.result
  }

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = each.value

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "config" {
  for_each = {
    site_url                 = var.site_url
    additional_redirect_urls = var.additional_redirect_urls
    api_external_url         = "${local.api_url}/auth/v1"
    public_url               = local.api_url
    dashboard_username       = local.name_prefix

    # bin/backup.sh reads backup_bucket; a re-sync of infra/supabase reads assets_bucket.
    assets_bucket = local.assets_bucket
    backup_bucket = local.backup_bucket

    # bin/backup.sh publishes here when a dump fails.
    alerts_topic_arn = aws_sns_topic.alerts.arn
  }

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "String"
  value = each.value
}

# Created by hand and deliberately not managed here: rewriting jwt_secret would
# invalidate the anon and service_role keys the app and Envoy compare literally.
# These reads only assert the four exist before an apply builds anything.
data "aws_ssm_parameter" "jwt_secret" {
  name            = "${local.ssm_prefix}/jwt_secret"
  with_decryption = false
}

data "aws_ssm_parameter" "anon_key" {
  name            = "${local.ssm_prefix}/anon_key"
  with_decryption = false
}

data "aws_ssm_parameter" "service_role_key" {
  name            = "${local.ssm_prefix}/service_role_key"
  with_decryption = false
}

data "aws_ssm_parameter" "cloud_db_url" {
  name            = "/${local.name_prefix}/migration/cloud_db_url"
  with_decryption = false
}
