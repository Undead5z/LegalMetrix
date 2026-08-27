# Mobile network setup

The LegalMetrix backend listens on the network (`0.0.0.0`), but a physical phone needs the computer's current LAN IPv4 address. Do not edit application source code when that address changes.

## Start mobile with automatic IP refresh

Use this single command from the repository root whenever you start the mobile app:

```powershell
.\scripts\start-mobile.ps1
```

It detects the active Wi-Fi/Ethernet IPv4 address, updates `mobile/.env`, and starts Expo with a cleared cache. No source-code edit is required when the PC IP changes.

The lower-level update command is also available when needed:

```powershell
.\scripts\update-mobile-api-url.ps1
```

It writes only this setting to `mobile/.env`:

```text
EXPO_PUBLIC_API_URL=http://<current-PC-IP>:4000/api
```

If you use `update-mobile-api-url.ps1` directly, restart Expo so it reads the updated environment variable:

```powershell
cd mobile
npx expo start --clear
```

The phone and computer must be on the same Wi-Fi network. Allow Node.js/port 4000 through the Windows firewall if the phone still cannot connect.

## If automatic detection selects the wrong adapter

Pass the address explicitly:

```powershell
.\scripts\update-mobile-api-url.ps1 -IPAddress 192.168.1.25
```

Use the address shown by `ipconfig` under the active Wi-Fi or Ethernet adapter. Do not use `localhost`, `127.0.0.1`, or a virtual-adapter address on a physical phone.
