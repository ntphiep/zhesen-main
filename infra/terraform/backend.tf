# The bucket exists already and is versioned with SSE-S3. `use_lockfile` puts the
# lock beside the state object, so no DynamoDB table is needed.
# https://developer.hashicorp.com/terraform/language/backend/s3#use_lockfile
terraform {
  backend "s3" {
    bucket       = "zhesen-terraform-state-014498663963"
    key          = "zhesen/prod.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
