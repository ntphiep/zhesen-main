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
