# Plain-text configuration the instance reads through bin/render-env.sh. Kept
# apart from the instance module because the values include the CloudFront
# domain, which exists only after the instance does; cloud-init polls for them.
resource "aws_ssm_parameter" "config" {
  for_each = var.parameters

  name  = "${var.ssm_prefix}/${each.key}"
  type  = "String"
  value = each.value
}
