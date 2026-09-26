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
# prefixes are all reachable from the origin. The edge answers only the three
# prefixes the app uses, so nothing else is exposed to the internet. /ai/v1/ is
# 9router's API, which checks its own key.
resource "aws_cloudfront_function" "api_paths" {
  name    = "${var.name_prefix}-api-paths"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Allow only /auth/v1/, /rest/v1/ and /ai/v1/"

  code = <<-JS
    function handler(event) {
      var uri = event.request.uri;
      if (uri.startsWith('/auth/v1/') || uri.startsWith('/rest/v1/') || uri.startsWith('/ai/v1/')) {
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
