# Opens the 9router dashboard at http://localhost:20128/dashboard for as long as this runs.
# Needs the SSM Session Manager plugin; the dashboard listens on the host's loopback only.
#
#   pwsh infra/supabase/bin/router-tunnel.ps1

$ErrorActionPreference = 'Stop'

$region = 'ap-northeast-2'
$target = terraform -chdir="$PSScriptRoot/../../terraform" output -raw instance_id
if (-not $target) { throw 'terraform output instance_id was empty' }

Write-Host "Forwarding localhost:20128 to $target port 20128. Ctrl+C to stop."

aws ssm start-session `
  --region $region `
  --target $target `
  --document-name AWS-StartPortForwardingSession `
  --parameters '{"portNumber":["20128"],"localPortNumber":["20128"]}'
