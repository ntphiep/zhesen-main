variable "region" {
  description = "AWS region. The database lives in Seoul beside the Vercel icn1 functions."
  type        = string
  default     = "ap-northeast-2"
}

variable "availability_zone" {
  description = "AZ of the instance and its default subnet."
  type        = string
  default     = "ap-northeast-2a"
}

variable "instance_type" {
  description = "arm64 instance type. t4g.medium is 2 vCPU and 4 GB."
  type        = string
  default     = "t4g.medium"
}

variable "root_volume_gb" {
  description = "Root gp3 volume size in GB. The Cloud database is 455 MB today."
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Address subscribed to the SNS alarm topic and to the budget notifications."
  type        = string
}

variable "ses_sender_email" {
  description = "Sender identity for auth email. SES sends a verification mail here on apply."
  type        = string
}

variable "ses_sender_name" {
  description = "Display name on outgoing auth email."
  type        = string
  default     = "zhesen"
}

variable "site_url" {
  description = "GOTRUE_SITE_URL: where auth links land."
  type        = string
  default     = "https://zhesen-main.vercel.app"
}

variable "additional_redirect_urls" {
  description = "GOTRUE_URI_ALLOW_LIST, comma separated. Covers production, Vercel previews and local development."
  type        = string
  default     = "https://zhesen-main.vercel.app/**,https://zhesen-main-*-zhesen.vercel.app/**,http://localhost:3000/**"
}

variable "budget_usd" {
  description = "Monthly budget for the Seoul region."
  type        = number
  default     = 45
}

variable "snapshot_retain_days" {
  description = "Number of daily EBS snapshots DLM keeps."
  type        = number
  default     = 7
}

variable "backup_retain_days" {
  description = "Days a pg_dump stays in the backup bucket before expiry."
  type        = number
  default     = 30
}
