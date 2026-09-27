variable "name_prefix" {
  type = string
}

variable "vpc_id" {
  description = "VPC holding the instance, where CloudFront creates its origin security group."
  type        = string
}

variable "instance_arn" {
  description = "Instance the VPC origin points at."
  type        = string
}

variable "instance_private_dns" {
  description = "Origin domain name; a VPC origin is addressed by private DNS."
  type        = string
}

variable "security_group_id" {
  description = "The instance's security group, which receives the ingress rules."
  type        = string
}

variable "ssm_prefix" {
  description = "Parameter Store prefix that receives router_gate_key."
  type        = string
}
