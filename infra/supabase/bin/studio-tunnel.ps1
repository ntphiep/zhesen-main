# Opens Studio at http://localhost:8000 for as long as this runs.
# Needs the SSM Session Manager plugin; there is no inbound port on the instance.
#
#   pwsh infra/supabase/bin/studio-tunnel.ps1

$ErrorActionPreference = 'Stop'

$region = 'ap-northeast-2'
$target = terraform -chdir="$PSScriptRoot/../../terraform" output -raw instance_id
if (-not $target) { throw 'terraform output instance_id was empty' }

Write-Host "Forwarding localhost:8000 to $target port 80. Ctrl+C to stop."

aws ssm start-session `
  --region $region `
  --target $target `
  --document-name AWS-StartPortForwardingSession `
  --parameters '{"portNumber":["80"],"localPortNumber":["8000"]}'
