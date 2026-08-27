[CmdletBinding()]
param(
  [string]$IPAddress,
  [ValidateRange(1, 65535)]
  [int]$BackendPort = 4000
)

# Run from any location. The script updates only mobile/.env, not application source files.
$repoRoot = Split-Path -Parent $PSScriptRoot
$mobileEnv = Join-Path $repoRoot 'mobile/.env'

if (-not $IPAddress) {
  $configuration = Get-NetIPConfiguration |
    Where-Object {
      $_.IPv4DefaultGateway -and
      $_.IPv4Address -and
      $_.NetAdapter.Status -eq 'Up' -and
      $_.IPv4Address.IPAddress -notmatch '^(127\.|169\.254\.)'
    } |
    Select-Object -First 1
  $IPAddress = $configuration.IPv4Address[0].IPAddress
}

if (-not $IPAddress) {
  throw 'No active LAN IPv4 address was found. Connect this computer to Wi-Fi/Ethernet, then run the script again or pass -IPAddress 192.168.x.x.'
}

$apiUrl = "http://${IPAddress}:$BackendPort/api"
Set-Content -Path $mobileEnv -Value "EXPO_PUBLIC_API_URL=$apiUrl" -Encoding utf8
Write-Host "Mobile API URL updated: $apiUrl" -ForegroundColor Green
Write-Host 'Restart Expo with: cd mobile; npx expo start --clear' -ForegroundColor Yellow
