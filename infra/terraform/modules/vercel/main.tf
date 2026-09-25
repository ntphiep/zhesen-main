# AWS access for the admin console (issues #58, #63 to #65). A Vercel function
# exchanges its OIDC token for this role through STS, so no long-lived key exists.
# The project uses team issuer mode: the token's `iss` is oidc.vercel.com/<team>.
# https://vercel.com/docs/oidc/aws

resource "aws_iam_openid_connect_provider" "vercel" {
  url            = "https://oidc.vercel.com/${var.team_slug}"
  client_id_list = ["https://vercel.com/${var.team_slug}"]
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.vercel.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "oidc.vercel.com/${var.team_slug}:aud"
      values   = ["https://vercel.com/${var.team_slug}"]
    }
    # Production only: a preview deployment runs any branch's code.
    condition {
      test     = "StringEquals"
      variable = "oidc.vercel.com/${var.team_slug}:sub"
      values   = ["owner:${var.team_slug}:project:${var.project}:environment:production"]
    }
  }
}

resource "aws_iam_role" "health" {
  name               = "${var.name_prefix}-vercel-health"
  assume_role_policy = data.aws_iam_policy_document.trust.json
}

data "aws_iam_policy_document" "health" {
  # Neither accepts a resource narrower than "*".
  statement {
    sid       = "ReadMetricsAlarms"
    actions   = ["cloudwatch:GetMetricData", "cloudwatch:DescribeAlarms"]
    resources = ["*"]
  }

  statement {
    sid       = "ListDumps"
    actions   = ["s3:ListBucket"]
    resources = [var.backup_bucket_arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["postgres/*"]
    }
  }
}

resource "aws_iam_role_policy" "health" {
  name   = "${var.name_prefix}-vercel-health"
  role   = aws_iam_role.health.id
  policy = data.aws_iam_policy_document.health.json
}

# The admin console's writes (issues #63 to #65), on the same role so AWS_ROLE_ARN in
# Vercel stays as it is. Everything that changes the instance is scoped to it; the reads
# AWS only grants on "*" are kept in their own statement.
data "aws_iam_policy_document" "operate" {
  statement {
    sid = "DescribeAnywhere"
    actions = [
      "ec2:DescribeInstances", "ec2:DescribeInstanceStatus", "ec2:DescribeImages", "ec2:DescribeVolumes", "ec2:DescribeInstanceTypes",
      "ssm:GetCommandInvocation", "ce:GetCostAndUsage", "ce:GetCostForecast", "pricing:GetProducts",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "PowerTheInstance"
    actions   = ["ec2:StartInstances", "ec2:StopInstances", "ec2:RebootInstances", "ec2:ModifyInstanceAttribute"]
    resources = [var.instance_arn]
  }

  statement {
    sid     = "RunShellOnTheInstance"
    actions = ["ssm:SendCommand"]
    resources = [
      var.instance_arn,
      "arn:aws:ssm:${var.region}::document/AWS-RunShellScript",
    ]
  }

  # SecureString under the account's aws/ssm key, which any principal in the account may
  # decrypt through SSM, so no kms statement is needed.
  statement {
    sid       = "ReadRescueSecret"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.region}:${var.account_id}:parameter${var.ssm_prefix}/admin_rescue_secret"]
  }

  statement {
    sid       = "AlertTheOwner"
    actions   = ["sns:Publish"]
    resources = [var.alerts_topic_arn]
  }
}

resource "aws_iam_role_policy" "operate" {
  name   = "${var.name_prefix}-vercel-operate"
  role   = aws_iam_role.health.id
  policy = data.aws_iam_policy_document.operate.json
}
