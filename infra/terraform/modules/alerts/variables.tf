variable "name_prefix" {
  type = string
}

variable "region" {
  description = "Region the budget is filtered on."
  type        = string
}

variable "alert_email" {
  description = "Address subscribed to the topic and to the budget notifications."
  type        = string
}

variable "budget_usd" {
  description = "Monthly budget for the region."
  type        = number
}
