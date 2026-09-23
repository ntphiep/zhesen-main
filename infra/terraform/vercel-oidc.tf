# Read-only AWS access for /admin/health (issue #58, phase 6). A Vercel function
# exchanges its OIDC token for this role through STS, so no long-lived key exists.
# The project uses team issuer mode: the token's `iss` is oidc.vercel.com/<team>.
# https://vercel.com/docs/oidc/aws

resource "aws_iam_openid_connect_provider" "vercel" {
  url            = "https://oidc.vercel.com/${var.vercel_team_slug}"
  client_id_list = ["https://vercel.com/${var.vercel_team_slug}"]
}

data "aws_iam_policy_document" "vercel_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.vercel.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "oidc.vercel.com/${var.vercel_team_slug}:aud"
      values   = ["https://vercel.com/${var.vercel_team_slug}"]
    }
    # Production only: a preview deployment runs any branch's code.
    condition {
      test     = "StringEquals"
      variable = "oidc.vercel.com/${var.vercel_team_slug}:sub"
      values   = ["owner:${var.vercel_team_slug}:project:${var.vercel_project}:environment:production"]
    }
  }
}

resource "aws_iam_role" "vercel_health" {
  name               = "${local.name_prefix}-vercel-health"
  assume_role_policy = data.aws_iam_policy_document.vercel_trust.json
}

data "aws_iam_policy_document" "vercel_health" {
  # None of the three accepts a resource narrower than "*".
  statement {
    sid       = "ReadMetricsAlarmsSnapshots"
    actions   = ["cloudwatch:GetMetricData", "cloudwatch:DescribeAlarms", "ec2:DescribeSnapshots"]
    resources = ["*"]
  }

  statement {
    sid       = "ListDumps"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.backups.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["postgres/*"]
    }
  }
}

resource "aws_iam_role_policy" "vercel_health" {
  name   = "${local.name_prefix}-vercel-health"
  role   = aws_iam_role.vercel_health.id
  policy = data.aws_iam_policy_document.vercel_health.json
}
