# Read-only AWS access for /admin/health (issue #58, phase 6). A Vercel function
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
