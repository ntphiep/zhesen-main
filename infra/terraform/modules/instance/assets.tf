# infra/supabase is the source of truth; this bucket is how the instance gets it.
resource "aws_s3_bucket" "assets" {
  bucket = var.assets_bucket
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

locals {
  content_types = {
    "yml"      = "application/yaml"
    "yaml"     = "application/yaml"
    "sh"       = "text/x-shellscript"
    "sql"      = "application/sql"
    "ps1"      = "text/plain"
    "md"       = "text/markdown"
    "template" = "text/plain"
  }
}

# `etag = filemd5` makes an edited file a diff on the next plan.
resource "aws_s3_object" "assets" {
  for_each = fileset(var.stack_dir, "**")

  bucket       = aws_s3_bucket.assets.id
  key          = "supabase/${each.value}"
  source       = "${var.stack_dir}/${each.value}"
  etag         = filemd5("${var.stack_dir}/${each.value}")
  content_type = lookup(local.content_types, lower(reverse(split(".", each.value))[0]), "application/octet-stream")
}
