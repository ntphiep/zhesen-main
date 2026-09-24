variable "ssm_prefix" {
  description = "Parameter path prefix, such as /zhesen/prod."
  type        = string
}

variable "parameters" {
  description = "Parameter name under the prefix to its value."
  type        = map(string)
}
