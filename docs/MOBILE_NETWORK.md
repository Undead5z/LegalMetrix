# Mobile backend connectivity

## Network-independent physical-device setup

A phone cannot reach a backend that is listening only on a developer PC's local LAN when the phone changes Wi-Fi or uses mobile data. For network-independent use, deploy the LegalMetrix backend behind a publicly reachable HTTPS URL and set it in `mobile/.env`:

```text
EXPO_PUBLIC_API_URL=https://your-legalmetrix-api.example.com/api
```

Restart Expo after changing this value:

```powershell
cd mobile
npx expo start --clear
```

The phone and backend can then use different Wi-Fi networks or mobile data. Do not use `localhost` or `127.0.0.1`; on a phone they refer to the phone itself.

## Local LAN development

The existing LAN helper scripts remain available for local-only development:

```powershell
./scripts/start-mobile.ps1
# or
./scripts/update-mobile-api-url.ps1
```

They intentionally use the current PC LAN address and therefore require the phone and PC to be on a reachable local network. They are not a substitute for a deployed HTTPS backend.
