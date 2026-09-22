data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-arm64-server-*"]
  }
}

resource "aws_instance" "supabase" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = data.aws_subnet.this.id
  vpc_security_group_ids = [aws_security_group.supabase.id]
  iam_instance_profile   = aws_iam_instance_profile.instance.name
  ebs_optimized          = true

  # Egress only: Docker Hub, SSM, S3 and SES, with no NAT gateway in the default
  # VPC. Nothing inbound reaches it; CloudFront arrives through the VPC origin ENI.
  associate_public_ip_address = true

  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"

    # 1 keeps the instance role on the host. The Docker bridge is one hop, so no
    # container can read the SSM parameters through it.
    http_put_response_hop_limit = 1
  }

  root_block_device {
    volume_type = "gp3"
    volume_size = var.root_volume_gb
    encrypted   = true

    # The volume holds the only copy of the database between backups, so it
    # outlives the instance. Backup=zhesen is what the DLM policy targets.
    delete_on_termination = false

    tags = {
      Name   = "${local.name_prefix}-supabase-root"
      Backup = "zhesen"
    }
  }

  # `unlimited` would let a CPU spike bill without a ceiling.
  credit_specification {
    cpu_credits = "standard"
  }

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    region        = var.region
    assets_bucket = local.assets_bucket
    backup_bucket = local.backup_bucket
    compose_dir   = local.compose_dir
  })

  # A new AMI or an edited user_data must never recreate the database host.
  # Both are applied by rebuilding deliberately, not by an apply.
  lifecycle {
    ignore_changes = [ami, user_data]
  }

  tags = {
    Name = "${local.name_prefix}-supabase"
  }

  # cloud-init syncs the bucket and renders .env from SSM on first boot. The URL
  # parameters are not listed: they carry the CloudFront domain, which exists
  # only after this instance does, so bootstrap.sh polls for them instead.
  depends_on = [
    aws_s3_object.assets,
    aws_ssm_parameter.generated,
    aws_ssm_parameter.smtp,
    aws_ssm_parameter.smtp_config,
  ]
}
