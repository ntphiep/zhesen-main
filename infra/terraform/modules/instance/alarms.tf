locals {
  instance_dimensions = {
    InstanceId = aws_instance.supabase.id
  }
}

# Underlying hardware. `arn:aws:automate:<region>:ec2:recover` migrates the
# instance to healthy hardware, keeping the instance id, the private IP and the volume.
resource "aws_cloudwatch_metric_alarm" "system_check" {
  alarm_name          = "${var.name_prefix}-status-check-system"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = ["arn:aws:automate:${var.region}:ec2:recover", var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
}

# The guest itself. Recovery does not help here, so this one only notifies.
resource "aws_cloudwatch_metric_alarm" "instance_check" {
  alarm_name          = "${var.name_prefix}-status-check-instance"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "cpu" {
  alarm_name          = "${var.name_prefix}-cpu-high"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
}

# A t4g on `standard` credits throttles to its baseline once the balance runs
# out, which reads as a slow database rather than an outage.
resource "aws_cloudwatch_metric_alarm" "cpu_credits" {
  alarm_name          = "${var.name_prefix}-cpu-credits-low"
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 30
  comparison_operator = "LessThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
}

# CWAgent metrics. These stay in INSUFFICIENT_DATA until cloud-init has started
# the agent on a fresh instance.
resource "aws_cloudwatch_metric_alarm" "memory" {
  alarm_name          = "${var.name_prefix}-memory-high"
  namespace           = "CWAgent"
  metric_name         = "mem_used_percent"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
}

resource "aws_cloudwatch_metric_alarm" "disk" {
  alarm_name          = "${var.name_prefix}-disk-high"
  namespace           = "CWAgent"
  metric_name         = "disk_used_percent"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  dimensions          = merge(local.instance_dimensions, { path = "/" })
  alarm_actions       = [var.alerts_topic_arn]
  ok_actions          = [var.alerts_topic_arn]
}
