resource "aws_sesv2_email_identity" "sender" {
  email_identity = var.ses_sender_email
}

resource "aws_iam_user" "smtp" {
  name = "${local.name_prefix}-ses-smtp"
}

data "aws_iam_policy_document" "smtp" {
  statement {
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = [aws_sesv2_email_identity.sender.arn]
  }
}

resource "aws_iam_user_policy" "smtp" {
  name   = "${local.name_prefix}-ses-send"
  user   = aws_iam_user.smtp.name
  policy = data.aws_iam_policy_document.smtp.json
}

resource "aws_iam_access_key" "smtp" {
  user = aws_iam_user.smtp.name
}

resource "aws_ssm_parameter" "smtp" {
  for_each = {
    smtp_user = aws_iam_access_key.smtp.id

    # The secret access key run through AWS's SigV4 conversion. The derivation
    # is keyed on the provider region, so this password is valid for Seoul only.
    smtp_pass = aws_iam_access_key.smtp.ses_smtp_password_v4
  }

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "SecureString"
  value = each.value

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "smtp_config" {
  for_each = {
    smtp_host        = "email-smtp.${var.region}.amazonaws.com"
    smtp_port        = "587"
    smtp_admin_email = var.ses_sender_email
    smtp_sender_name = var.ses_sender_name
  }

  name  = "${local.ssm_prefix}/${each.key}"
  type  = "String"
  value = each.value
}
