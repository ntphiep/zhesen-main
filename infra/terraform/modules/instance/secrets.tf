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

# Supavisor documents exactly 32 characters.
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

  name  = "${var.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = each.value

  lifecycle {
    ignore_changes = [value]
  }
}

# Created by hand and deliberately not managed here: rewriting jwt_secret would
# invalidate the anon and service_role keys the app and Envoy compare literally.
# These reads only assert the three exist before an apply builds anything.
data "aws_ssm_parameter" "jwt_secret" {
  name            = "${var.ssm_prefix}/jwt_secret"
  with_decryption = false
}

data "aws_ssm_parameter" "anon_key" {
  name            = "${var.ssm_prefix}/anon_key"
  with_decryption = false
}

data "aws_ssm_parameter" "service_role_key" {
  name            = "${var.ssm_prefix}/service_role_key"
  with_decryption = false
}
