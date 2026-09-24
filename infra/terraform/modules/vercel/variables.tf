variable "name_prefix" {
  type = string
}

variable "team_slug" {
  description = "Vercel team slug, the path of the OIDC issuer in team issuer mode."
  type        = string
}

variable "project" {
  description = "Vercel project name, as it appears in the OIDC token's sub claim."
  type        = string
}

variable "backup_bucket_arn" {
  description = "Bucket whose postgres/ prefix the role may list."
  type        = string
}

variable "region" {
  type = string
}

variable "account_id" {
  type = string
}

variable "ssm_prefix" {
  description = "Parameter Store prefix holding admin_rescue_secret."
  type        = string
}

variable "instance_arn" {
  description = "The one instance the console may start, stop, reboot and run commands on."
  type        = string
}

variable "alerts_topic_arn" {
  description = "SNS topic whose email subscription receives the console's alerts."
  type        = string
}
