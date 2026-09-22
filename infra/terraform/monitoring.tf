resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
}

# The subscription is pending until the confirmation link in the mail is clicked.
resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  instance_dimensions = {
    InstanceId = aws_instance.supabase.id
  }
}

# Underlying hardware. `arn:aws:automate:<region>:ec2:recover` migrates the
# instance to healthy hardware, keeping the instance id, the private IP and the volume.
resource "aws_cloudwatch_metric_alarm" "system_check" {
  alarm_name          = "${local.name_prefix}-status-check-system"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = ["arn:aws:automate:${var.region}:ec2:recover", aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# The guest itself. Recovery does not help here, so this one only notifies.
resource "aws_cloudwatch_metric_alarm" "instance_check" {
  alarm_name          = "${local.name_prefix}-status-check-instance"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_Instance"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "cpu" {
  alarm_name          = "${local.name_prefix}-cpu-high"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# A t4g on `standard` credits throttles to its baseline once the balance runs
# out, which reads as a slow database rather than an outage.
resource "aws_cloudwatch_metric_alarm" "cpu_credits" {
  alarm_name          = "${local.name_prefix}-cpu-credits-low"
  namespace           = "AWS/EC2"
  metric_name         = "CPUCreditBalance"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 30
  comparison_operator = "LessThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# CWAgent metrics. These stay in INSUFFICIENT_DATA until cloud-init has started
# the agent on a fresh instance.
resource "aws_cloudwatch_metric_alarm" "memory" {
  alarm_name          = "${local.name_prefix}-memory-high"
  namespace           = "CWAgent"
  metric_name         = "mem_used_percent"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  dimensions          = local.instance_dimensions
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "disk" {
  alarm_name          = "${local.name_prefix}-disk-high"
  namespace           = "CWAgent"
  metric_name         = "disk_used_percent"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  dimensions          = merge(local.instance_dimensions, { path = "/" })
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# Filtered on the region so the existing account-wide budgets are unaffected.
resource "aws_budgets_budget" "seoul" {
  name         = "${local.name_prefix}-${var.region}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Region"
    values = [var.region]
  }

  notification {
    notification_type          = "ACTUAL"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }

  notification {
    notification_type          = "FORECASTED"
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    subscriber_email_addresses = [var.alert_email]
  }
}
