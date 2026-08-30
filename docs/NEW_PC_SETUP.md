# LegalMetrix: Windows new-PC setup

## Prerequisites

Install Git and **Node.js 22 LTS**. The repository currently locks `better-sqlite3` 11.x, which has no Windows prebuilt binary for Node 24 (ABI 137). Node 22 LTS is the compatible runtime; do not use Node 24 for the backend unless the native dependency is intentionally upgraded in a future change.

```powershell
winget install --id Git.Git -e
# Run the following from an Administrator PowerShell if Node 24 is installed.
winget uninstall --id OpenJS.NodeJS.LTS -e
$msi = "$env:TEMP\node-v22.23.2-x64.msi"
Invoke-WebRequest https://nodejs.org/dist/v22.23.2/node-v22.23.2-x64.msi -OutFile $msi
Start-Process msiexec.exe -Verb RunAs -Wait -ArgumentList "/i `"$msi`" /qn /norestart"
```

Open a new PowerShell window and verify:

```powershell
git --version
node --version # expected v22.23.2
npm --version
```

## Clone and install

```powershell
git clone https://github.com/Undead5z/LegalMetrix.git
cd LegalMetrix

Copy-Item backend/.env.example backend/.env
Copy-Item web/.env.example web/.env
Copy-Item mobile/.env.example mobile/.env

cd backend; npm install; cd ..
cd web; npm install; cd ..
cd mobile; npm install; cd ..
```

`backend/.env` defaults to port 4000 and host `0.0.0.0`. Keep the development `JWT_SECRET` placeholder only for local development; replace it with a long random secret before deployment. `AI_EXTRACTION_API_KEY` is optional and stays blank by default. It is backend-only: do not put API keys in `web/.env` or `mobile/.env`.

## Database and development accounts

The backend automatically creates `backend/data/legalmetrix.db`, applies idempotent schema/migrations, creates `backend/uploads`, seeds MVP rules, and seeds these development-only approved users:

| Role | Email | Password |
| --- | --- | --- |
| Master Admin | `admin@legalmetrix.local` | `Admin@123` |
| Field Officer | `officer@legalmetrix.local` | `Officer@123` |

Do not use these credentials in deployment.

## Start the applications

Use three PowerShell terminals from the repository root:

```powershell
# Terminal 1
cd backend
npm run dev

# Terminal 2
cd web
npm run dev

# Terminal 3
cd mobile
npx expo start -c --lan
```

Backend health: <http://localhost:4000/api/health> (expects `{"status":"ok",...}`).

Web: <http://localhost:5173>.

## Phone/LAN setup

With the PC and phone on the same Wi-Fi, refresh the mobile API URL before starting Expo:

```powershell
# From repository root
.\scripts\update-mobile-api-url.ps1
Get-Content mobile/.env
# Or do both refresh and start in one command:
.\scripts\start-mobile.ps1
```

The script uses the active Wi-Fi/Ethernet IPv4 from Windows and writes only:

```text
EXPO_PUBLIC_API_URL=http://<current-PC-LAN-IP>:4000/api
```

To inspect it manually:

```powershell
ipconfig
```

Use the active Wi-Fi/Ethernet IPv4, never `localhost`, `127.0.0.1`, or a virtual adapter. Test from the phone browser first:

```text
http://<current-PC-LAN-IP>:4000/api/health
```

If it fails, confirm same Wi-Fi, backend output says `0.0.0.0:4000`, correct IPv4, then (only if needed) add a Private-profile firewall rule from an Administrator PowerShell:

```powershell
New-NetFirewallRule -DisplayName 'LegalMetrix backend (Private)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -Profile Private
```

## Troubleshooting

- **`Could not locate the bindings file` / `node-v137`**: Node 24 is active. Install Node 22 LTS as above, then clean only the backend installation:

  ```powershell
  cd backend
  Remove-Item -Recurse -Force node_modules
  npm install
  node -e "const Database=require('better-sqlite3'); const db=new Database(':memory:'); db.close(); console.log('better-sqlite3 OK')"
  ```

- **Phone cannot reach API**: do not troubleshoot Expo until the phone browser can open the LAN health URL.
- **Port 4000 already in use**: `Get-NetTCPConnection -LocalPort 4000`, stop the owning development process, then restart the backend.
- **API key later required**: set only `AI_EXTRACTION_API_KEY` in `backend/.env`; restart the backend. The application boots without it and uses its supported safe fallback behavior.

## Validation

```powershell
cd web
npm run build

cd ../backend
npm run init-db
# then start npm run dev and call /api/health
```
