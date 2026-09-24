data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "this" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = var.availability_zone
  default_for_az    = true
}

resource "aws_security_group" "supabase" {
  name        = "${var.name_prefix}-supabase"
  description = "Supabase API gateway, reachable only from the CloudFront VPC origin of this account"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${var.name_prefix}-supabase"
  }
}

# The one ingress rule is in the edge module, because it references a security
# group CloudFront creates. There is no SSH rule: the shell is SSM Session
# Manager, which dials out over the instance role and needs no inbound port.
resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.supabase.id
  description       = "Docker Hub, SSM, S3"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
