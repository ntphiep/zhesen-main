variable "bucket" {
  description = "Bucket name."
  type        = string
}

variable "retain_days" {
  description = "Days a dump stays before expiry."
  type        = number
}
