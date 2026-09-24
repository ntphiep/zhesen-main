output "instance_id" {
  value = aws_instance.supabase.id
}

output "instance_arn" {
  value = aws_instance.supabase.arn
}

output "private_dns" {
  value = aws_instance.supabase.private_dns
}

output "security_group_id" {
  value = aws_security_group.supabase.id
}

output "vpc_id" {
  value = data.aws_vpc.default.id
}
