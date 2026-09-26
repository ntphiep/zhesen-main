resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
}

# The admin console forwards every message to Slack and Telegram (lib/admin/alerts.ts).
# SNS posts a SubscriptionConfirmation there first, which the route confirms itself.
resource "aws_sns_topic_subscription" "alerts_https" {
  topic_arn              = aws_sns_topic.alerts.arn
  protocol               = "https"
  endpoint               = var.alert_endpoint
  endpoint_auto_confirms = true
}

# A topic policy replaces the default one, so its account statement is kept. Budgets
# cannot publish without its own statement; CloudWatch is named for the same reason.
# https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-sns-policy.html
data "aws_iam_policy_document" "alerts" {
  statement {
    sid = "AccountDefault"
    actions = [
      "SNS:GetTopicAttributes", "SNS:SetTopicAttributes", "SNS:AddPermission", "SNS:RemovePermission",
      "SNS:DeleteTopic", "SNS:Subscribe", "SNS:ListSubscriptionsByTopic", "SNS:Publish",
    ]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "AWS"
      identifiers = ["*"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceOwner"
      values   = [var.account_id]
    }
  }

  statement {
    sid       = "BudgetsPublish"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["budgets.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:budgets::${var.account_id}:*"]
    }
  }

  statement {
    sid       = "CloudWatchPublish"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [var.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

# Filtered on the region so the existing account-wide budgets are unaffected.
resource "aws_budgets_budget" "seoul" {
  name         = "${var.name_prefix}-${var.region}-monthly"
  budget_type  = "COST"
  limit_amount = tostring(var.budget_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name   = "Region"
    values = [var.region]
  }

  notification {
    notification_type         = "ACTUAL"
    comparison_operator       = "GREATER_THAN"
    threshold                 = 80
    threshold_type            = "PERCENTAGE"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  notification {
    notification_type         = "FORECASTED"
    comparison_operator       = "GREATER_THAN"
    threshold                 = 100
    threshold_type            = "PERCENTAGE"
    subscriber_sns_topic_arns = [aws_sns_topic.alerts.arn]
  }

  depends_on = [aws_sns_topic_policy.alerts]
}
