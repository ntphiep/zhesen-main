# Snapshots the root volume by tag, 30 minutes before bin/backup.sh takes its
# logical dump. The two are independent: a snapshot restores the whole host, a
# dump restores one database into a new one.
resource "aws_dlm_lifecycle_policy" "root_volume" {
  description        = "${local.name_prefix} daily root volume snapshot"
  execution_role_arn = aws_iam_role.dlm.arn
  state              = "ENABLED"

  policy_details {
    resource_types = ["VOLUME"]

    target_tags = {
      Backup = "zhesen"
    }

    schedule {
      name      = "daily-0300-utc"
      copy_tags = true

      create_rule {
        interval      = 24
        interval_unit = "HOURS"
        times         = ["03:00"]
      }

      retain_rule {
        count = var.snapshot_retain_days
      }
    }
  }

  depends_on = [aws_iam_role_policy_attachment.dlm]
}
