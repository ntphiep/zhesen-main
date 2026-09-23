output "instance_id" {
  description = "EC2 instance running the Supabase stack."
  value       = aws_instance.supabase.id
}

output "cloudfront_domain" {
  description = "Distribution domain name."
  value       = aws_cloudfront_distribution.api.domain_name
}

output "api_url" {
  description = "Value for NEXT_PUBLIC_SUPABASE_URL on Vercel."
  value       = local.api_url
}

output "assets_bucket" {
  description = "Bucket holding infra/supabase, synced by cloud-init."
  value       = local.assets_bucket
}

output "backup_bucket" {
  description = "Bucket holding the pg_dump files."
  value       = local.backup_bucket
}

output "sns_topic_arn" {
  description = "Alarm topic."
  value       = aws_sns_topic.alerts.arn
}

output "ssm_session_command" {
  description = "Shell on the instance. No SSH key and no inbound port."
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.supabase.id}"
}

output "studio_tunnel_command" {
  description = "Studio at http://localhost:8000 while this runs."
  value       = "aws ssm start-session --region ${var.region} --target ${aws_instance.supabase.id} --document-name AWS-StartPortForwardingSession --parameters '{\"portNumber\":[\"80\"],\"localPortNumber\":[\"8000\"]}'"
}

output "vercel_health_role_arn" {
  description = "Value for AWS_ROLE_ARN on Vercel, read by lib/admin/aws.ts."
  value       = aws_iam_role.vercel_health.arn
}
