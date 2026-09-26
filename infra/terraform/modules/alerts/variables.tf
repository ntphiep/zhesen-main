variable "name_prefix" {
  type = string
}

variable "region" {
  description = "Region the budget is filtered on."
  type        = string
}

variable "account_id" {
  type = string
}

variable "alert_endpoint" {
  description = "HTTPS endpoint subscribed to the topic: app/api/alerts/sns on the production deployment."
  type        = string
}

variable "budget_usd" {
  description = "Monthly budget for the region."
  type        = number
}
