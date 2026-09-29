output "domain_name" {
  value = aws_cloudfront_distribution.api.domain_name
}

output "router_domain_name" {
  value = aws_cloudfront_distribution.router.domain_name
}

output "omniroute_domain_name" {
  value = aws_cloudfront_distribution.omniroute.domain_name
}
