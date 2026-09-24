variable "name_prefix" {
  type = string
}

variable "region" {
  type = string
}

variable "availability_zone" {
  description = "AZ of the instance and its default subnet."
  type        = string
}

variable "instance_type" {
  description = "arm64 instance type."
  type        = string
}

variable "root_volume_gb" {
  description = "Root gp3 volume size in GB."
  type        = number
}

variable "ssm_prefix" {
  description = "Parameter path the instance may read, such as /zhesen/prod."
  type        = string
}

variable "stack_dir" {
  description = "Local folder uploaded to the assets bucket and synced to the instance."
  type        = string
}

variable "assets_bucket" {
  description = "Name of the bucket created here for the stack files."
  type        = string
}

variable "backup_bucket" {
  description = "Name of the bucket bin/backup.sh writes to."
  type        = string
}

variable "backup_bucket_arn" {
  type = string
}

variable "alerts_topic_arn" {
  description = "SNS topic the alarms and bin/backup.sh publish to."
  type        = string
}
