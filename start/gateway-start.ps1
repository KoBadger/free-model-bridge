# Our Free Model gateway autostart launcher (portable).
# Idempotent: exits silently when the gateway is already answering on the port.
# Created/installed by bin/setup.mjs of the free-model-bridge repo.
param(
  [string]$RepoDir = (Join-Path $env:USERPROFILE "Apps\our-free-model"),
  [int]$Port = 18900,
  [string]$DataDir = ""
)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
if ($DataDir) { $data = $DataDir }
elseif ($env:OFM_HOME) { $data = $env:OFM_HOME }
else { $data = Join-Path $env:USERPROFILE ".our-free-model" }
$log = Join-Path $data "service.out.log"
$err = Join-Path $data "service.err.log"

try {
  Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3 -ErrorAction Stop | Out-Null
  exit 0
} catch {}

Start-Process -FilePath $node `
  -ArgumentList @((Join-Path $RepoDir "packages\standalone\cli.mjs"), "--port", "$Port", "--no-lan") `
  -WorkingDirectory $data `
  -RedirectStandardOutput $log -RedirectStandardError $err `
  -WindowStyle Hidden
