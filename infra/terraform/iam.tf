data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "instance" {
  name               = "${local.name_prefix}-instance"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

# AmazonSSMManagedInstanceCore replaces SSH; CloudWatchAgentServerPolicy lets the
# agent publish the memory and disk metrics the alarms read.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.name_prefix}-instance"
  role = aws_iam_role.instance.name
}

# The AWS-managed key that encrypts the SecureString parameters.
data "aws_kms_alias" "ssm" {
  name = "alias/aws/ssm"
}

data "aws_iam_policy_document" "instance" {
  # GetParametersByPath is authorised on the path itself, hence both forms.
  statement {
    sid     = "ReadOwnParameters"
    actions = ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"]
    resources = [
      "arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}",
      "arn:aws:ssm:${var.region}:${local.account_id}:parameter${local.ssm_prefix}/*",
    ]
  }

  statement {
    sid       = "DecryptSecureStrings"
    actions   = ["kms:Decrypt"]
    resources = [data.aws_kms_alias.ssm.target_key_arn]
  }

  statement {
    sid     = "ReadAssets"
    actions = ["s3:GetObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.assets.arn,
      "${aws_s3_bucket.assets.arn}/*",
    ]
  }

  statement {
    sid     = "WriteBackups"
    actions = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.backups.arn,
      "${aws_s3_bucket.backups.arn}/*",
    ]
  }

  statement {
    sid       = "BackupAlert"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }

  # PutMetricData carries no resource; DescribeVolumes is how the agent resolves
  # a mount point to a volume id for the disk dimension.
  statement {
    sid       = "AgentMetrics"
    actions   = ["cloudwatch:PutMetricData", "ec2:DescribeVolumes"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "instance" {
  name   = "${local.name_prefix}-instance"
  role   = aws_iam_role.instance.id
  policy = data.aws_iam_policy_document.instance.json
}

data "aws_iam_policy_document" "dlm_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["dlm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "dlm" {
  name               = "${local.name_prefix}-dlm"
  assume_role_policy = data.aws_iam_policy_document.dlm_assume.json
}

# Verified present only under the service-role path:
# aws iam get-policy --policy-arn arn:aws:iam::aws:policy/AWSDataLifecycleManagerServiceRole -> NoSuchEntity
resource "aws_iam_role_policy_attachment" "dlm" {
  role       = aws_iam_role.dlm.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSDataLifecycleManagerServiceRole"
}
