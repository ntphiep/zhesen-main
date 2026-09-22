data "aws_vpc" "default" {
  default = true
}

data "aws_subnet" "this" {
  vpc_id            = data.aws_vpc.default.id
  availability_zone = var.availability_zone
  default_for_az    = true
}

resource "aws_security_group" "supabase" {
  name        = "${local.name_prefix}-supabase"
  description = "Supabase API gateway, reachable only from the CloudFront VPC origin of this account"
  vpc_id      = data.aws_vpc.default.id

  tags = {
    Name = "${local.name_prefix}-supabase"
  }
}

# CloudFront creates this group when the VPC origin is created and owns it. A
# rule that references it admits only this account's distributions, where the
# origin-facing prefix list would admit any CloudFront customer's.
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html
data "aws_security_group" "cloudfront_vpc_origins" {
  vpc_id = data.aws_vpc.default.id

  filter {
    name   = "group-name"
    values = ["CloudFront-VPCOrigins-Service-SG*"]
  }

  depends_on = [aws_cloudfront_vpc_origin.supabase]
}

# The only way in. There is no SSH rule: the shell is SSM Session Manager,
# which dials out over the instance role and needs no inbound port.
resource "aws_vpc_security_group_ingress_rule" "cloudfront_http" {
  security_group_id            = aws_security_group.supabase.id
  description                  = "Envoy, from the CloudFront VPC origin only"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origins.id
}

resource "aws_vpc_security_group_egress_rule" "all" {
  security_group_id = aws_security_group.supabase.id
  description       = "Docker Hub, SSM, S3, SES"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}
