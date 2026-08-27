[CmdletBinding()]
param(
  [string]$IPAddress,
  [ValidateRange(1, 65535)]
  [int]$BackendPort = 4000
)

# Refresh the phone's backend address every time the mobile app is started.
$scriptRoot = $PSScriptRoot
& (Join-Path $scriptRoot 'update-mobile-api-url.ps1') -IPAddress $IPAddress -BackendPort $BackendPort
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Push-Location (Join-Path (Split-Path -Parent $scriptRoot) 'mobile')
try {
  npx expo start --clear
} finally {
  Pop-Location
}
