resource "aws_s3_bucket" "assets" {
  bucket = local.assets_bucket
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# infra/supabase is the source of truth; the bucket is how the instance gets it.
# `etag = filemd5` makes an edited file a diff on the next plan.
resource "aws_s3_object" "assets" {
  for_each = local.asset_files

  bucket       = aws_s3_bucket.assets.id
  key          = "supabase/${each.value}"
  source       = "${path.module}/../supabase/${each.value}"
  etag         = filemd5("${path.module}/../supabase/${each.value}")
  content_type = lookup(local.content_types, lower(reverse(split(".", each.value))[0]), "application/octet-stream")
}

resource "aws_s3_bucket" "backups" {
  bucket = local.backup_bucket

  # A backup bucket that empties itself on `terraform destroy` is not a backup.
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket                  = aws_s3_bucket.backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "backups" {
  bucket = aws_s3_bucket.backups.id

  rule {
    id     = "expire-dumps"
    status = "Enabled"

    filter {}

    expiration {
      days = var.backup_retain_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}
