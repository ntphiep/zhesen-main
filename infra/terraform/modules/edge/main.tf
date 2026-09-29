data "aws_cloudfront_cache_policy" "disabled" {
  name = "Managed-CachingDisabled"
}

# Forwards every header except Host, which must stay the origin's own name.
data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# The edge reaches the instance through an ENI inside the VPC, so the hop from
# CloudFront to Envoy never crosses the public internet and the instance's public
# address answers nothing. Deploying one takes up to 15 minutes.
resource "aws_cloudfront_vpc_origin" "supabase" {
  vpc_origin_endpoint_config {
    name                   = "${var.name_prefix}-supabase"
    arn                    = var.instance_arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  tags = {
    Name = "${var.name_prefix}-supabase"
  }
}

# CloudFront creates this group when the VPC origin is created and owns it. A
# rule that references it admits only this account's distributions, where the
# origin-facing prefix list would admit any CloudFront customer's.
# https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-vpc-origins.html
data "aws_security_group" "cloudfront_vpc_origins" {
  vpc_id = var.vpc_id

  filter {
    name   = "group-name"
    values = ["CloudFront-VPCOrigins-Service-SG*"]
  }

  depends_on = [aws_cloudfront_vpc_origin.supabase]
}

# The only way into the instance.
resource "aws_vpc_security_group_ingress_rule" "cloudfront_http" {
  security_group_id            = var.security_group_id
  description                  = "Envoy, from the CloudFront VPC origin only"
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origins.id
}

# Studio, the Envoy admin port and the unused Realtime, Storage and Functions
# prefixes are all reachable from the origin. The edge answers only the four
# prefixes the app uses. /ai/v1/ is 9router's API and /omni/v1/ OmniRoute's, each
# checking its own key. Envoy normalises the path after this check, so a dot segment,
# plain or percent-encoded, or an encoded slash would climb out of the prefix: measured,
# /omni/v1/../../ reached Studio's basic auth. Such a path is refused here.
resource "aws_cloudfront_function" "api_paths" {
  name    = "${var.name_prefix}-api-paths"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Allow only /auth/v1/, /rest/v1/, /ai/v1/ and /omni/v1/"

  code = <<-JS
    function handler(event) {
      var uri = event.request.uri;
      var escapes = /(^|\/)(\.|%2e){1,2}(\/|$)|%2f|%5c|\\/i;
      if (!escapes.test(uri) &&
          (uri.startsWith('/auth/v1/') || uri.startsWith('/rest/v1/') || uri.startsWith('/ai/v1/') ||
           uri.startsWith('/omni/v1/'))) {
        return event.request;
      }
      return {
        statusCode: 403,
        statusDescription: 'Forbidden',
        headers: { 'content-type': { value: 'text/plain' } },
        body: 'Not an API path'
      };
    }
  JS
}

resource "aws_cloudfront_distribution" "api" {
  enabled         = true
  comment         = "zhesen supabase api"
  http_version    = "http2and3"
  price_class     = "PriceClass_200"
  is_ipv6_enabled = true

  origin {
    origin_id = "ec2"

    # A VPC origin is addressed by the instance's private DNS name.
    domain_name = var.instance_private_dns

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.supabase.id
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }

  default_cache_behavior {
    target_origin_id       = "ec2"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"

    # PostgREST and GoTrue set their own Content-Encoding; re-compressing at the
    # edge on an uncacheable response buys nothing.
    compress = false

    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.api_paths.arn
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true

    # The default *.cloudfront.net certificate accepts only this value; the
    # modern protocol versions apply to a custom certificate.
    minimum_protocol_version = "TLSv1"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# The 9router dashboard gets its own distribution: its /_next/ and /api/ paths would
# collide with the API's under one host. CloudFront reaches 9router's port directly, and
# 9router's own login (router_password) guards it.
resource "aws_cloudfront_vpc_origin" "router" {
  vpc_origin_endpoint_config {
    name                   = "${var.name_prefix}-9router"
    arn                    = var.instance_arn
    http_port              = 20128
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  tags = {
    Name = "${var.name_prefix}-9router"
  }
}

resource "aws_vpc_security_group_ingress_rule" "cloudfront_router" {
  security_group_id            = var.security_group_id
  description                  = "9router, from the CloudFront VPC origin only"
  ip_protocol                  = "tcp"
  from_port                    = 20128
  to_port                      = 20128
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origins.id
}

resource "aws_cloudfront_distribution" "router" {
  enabled         = true
  comment         = "zhesen 9router dashboard"
  http_version    = "http2and3"
  price_class     = "PriceClass_200"
  is_ipv6_enabled = true

  origin {
    origin_id   = "ec2-9router"
    domain_name = var.instance_private_dns

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.router.id
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }

  default_cache_behavior {
    target_origin_id       = "ec2-9router"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"

    # 9router compresses its own responses.
    compress = false

    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}

# OmniRoute's dashboard, set up like 9router's: its own distribution, CloudFront reaching
# the container's host port directly, and OmniRoute's login (omniroute_password) guarding it.
resource "aws_cloudfront_vpc_origin" "omniroute" {
  vpc_origin_endpoint_config {
    name                   = "${var.name_prefix}-omniroute"
    arn                    = var.instance_arn
    http_port              = 20130
    https_port             = 443
    origin_protocol_policy = "http-only"

    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }

  tags = {
    Name = "${var.name_prefix}-omniroute"
  }
}

resource "aws_vpc_security_group_ingress_rule" "cloudfront_omniroute" {
  security_group_id            = var.security_group_id
  description                  = "OmniRoute, from the CloudFront VPC origin only"
  ip_protocol                  = "tcp"
  from_port                    = 20130
  to_port                      = 20130
  referenced_security_group_id = data.aws_security_group.cloudfront_vpc_origins.id
}

resource "aws_cloudfront_distribution" "omniroute" {
  enabled         = true
  comment         = "zhesen OmniRoute dashboard"
  http_version    = "http2and3"
  price_class     = "PriceClass_200"
  is_ipv6_enabled = true

  origin {
    origin_id   = "ec2-omniroute"
    domain_name = var.instance_private_dns

    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.omniroute.id
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
  }

  default_cache_behavior {
    target_origin_id       = "ec2-omniroute"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = false

    cache_policy_id          = data.aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}
