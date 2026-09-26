# Mobile LAN development

LegalMetrix mobile development uses the backend running on this Windows PC. A physical phone cannot use `localhost`, because on a phone it means the phone itself.

## Start the local backend

```powershell
cd backend
npm run dev
```

The backend listens on `0.0.0.0:4000` and the local health check is:

```text
http://localhost:4000/api/health
```

## Refresh the phone API URL

Keep the phone and PC on the same reachable Wi-Fi/Ethernet network. From the repository root:

```powershell
.\scripts\update-mobile-api-url.ps1
Get-Content mobile/.env
```

The helper finds the active Windows IPv4 address and writes:

```text
EXPO_PUBLIC_API_URL=http://<PC-LAN-IP>:4000/api
```

Do not commit `mobile/.env` and do not manually hardcode a previous LAN IP.

## Verify from the phone

Open this URL in the phone browser before opening Expo Go:

```text
http://<PC-LAN-IP>:4000/api/health
```

It should return `{"status":"ok",...}`.

## Start Expo

```powershell
.\scripts\start-mobile.ps1
```

The script refreshes `mobile/.env` and starts Expo with `--lan`. Scan the new QR code in Expo Go.

## Firewall troubleshooting

If the phone browser cannot reach `/api/health`, allow port 4000 for the active network profile from an elevated PowerShell:

```powershell
New-NetFirewallRule -DisplayName 'LegalMetrix backend LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -Profile Private
```

For a Windows network classified as Public, use `-Profile Public` instead.
