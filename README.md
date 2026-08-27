# LegalMetrix

AI-assisted packaged-commodity inspection support for SIH26034. LegalMetrix stores evidence and supports a future pipeline where **AI extracts → rules assess → officer verifies**. It is not an automated enforcement or adjudication authority.

## Applications

- `web/` — React + Vite enforcement dashboard.
- `mobile/` — React Native + Expo field workflow.
- `backend/` — Express, SQLite, authentication, private evidence uploads, and service interfaces.
- `docs/` — API and data-model notes.

## Development credentials

These users are seeded automatically and are **development only**. Change/remove them before deployment.

| Role | Email | Password |
|---|---|---|
| Master Admin | `admin@legalmetrix.local` | `Admin@123` |
| Field Officer | `officer@legalmetrix.local` | `Officer@123` |

Passwords are stored using bcrypt hashes, never plaintext.

## Start locally

Use three terminals from this project root.

```powershell
# Terminal 1: backend
cd backend
Copy-Item .env.example .env
npm install
npm run dev

# Terminal 2: web
cd web
Copy-Item .env.example .env
npm install
npm run dev

# Terminal 3: mobile
cd mobile
Copy-Item .env.example .env
# Set EXPO_PUBLIC_API_URL to the backend host reachable by the phone/emulator.
npm install
npm start
```

Web is served by Vite (normally `http://localhost:5173`); backend defaults to `http://localhost:4000`. The backend initializes `backend/data/legalmetrix.db` on startup.

For a physical phone, `localhost` is the phone, not the development computer. Start the mobile app with `./scripts/start-mobile.ps1` from PowerShell; it detects the current PC LAN IP, updates `mobile/.env`, and starts Expo automatically. See [docs/MOBILE_NETWORK.md](docs/MOBILE_NETWORK.md).

## Scope implemented in this foundation

- JWT login, bcrypt password verification, `ADMIN` / `OFFICER` access boundaries.
- SQLite schema, initialization, development seed users, inspection CRUD foundation.
- Private local image upload metadata and file validation (JPEG/PNG/WebP, max 10 MB/image).
- Web login, live database dashboard, inspection list/creation/detail pages, and report-request view.
- Mobile login, home, new inspection, camera/gallery capture, upload, processing/result state, and My Inspections.
- Isolated OCR, declaration extraction, rule-engine, and PDF service interfaces.

The four processing/report services deliberately return `NOT_IMPLEMENTED`. They generate **no invented OCR text, declarations, findings, or reports**.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for API, schema, status, and next-run guidance.
