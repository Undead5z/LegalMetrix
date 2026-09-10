# Railway persistent SQLite migration

This procedure imports an existing LegalMetrix SQLite database and its private evidence files into a Railway volume without relying on Railway SFTP uploads.

## Railway variables

Configure the Railway service with:

```text
NODE_ENV=production
DATABASE_PATH=/app/persist/legalmetrix.db
UPLOAD_DIR=/app/persist/uploads
REPORT_DIR=/app/persist/uploads/reports
```

`NODE_ENV=production` prevents development bootstrap users from being created. The existing database is preserved; schema migrations and rules remain additive/non-destructive.

## What the importer does

The backend checks for both files below **before opening SQLite**:

```text
/app/persist/.incoming/legalmetrix.db
/app/persist/.incoming/IMPORT_NOW
```

When both exist, startup:

1. validates SQLite integrity and required tables;
2. verifies that users, inspections, and evidence image records exist;
3. backs up the current destination database;
4. replaces the destination database atomically;
5. removes stale destination WAL/SHM sidecars;
6. deletes the import marker/source after successful verification;
7. starts LegalMetrix normally.

If validation/import fails, the marker remains and startup fails instead of silently using an incomplete database.

## Stage the local database through Railway SSH

Run these commands from the repository root after `railway status` confirms the linked `LegalMetrix` service. The `railway ssh` command supports standard input, avoiding the SFTP timeout path.

First checkpoint the local database while the local backend is stopped, or use the already checkpointed `backend/data/legalmetrix-before-railway.db` snapshot.

```powershell
# Create the remote staging location.
railway ssh -s LegalMetrix -- sh -lc "mkdir -p /app/persist/.incoming /app/persist/uploads"

# Stream the checkpointed source DB to Railway. Windows tar preserves binary data.
tar -C backend/data -cf - legalmetrix-before-railway.db | railway ssh -s LegalMetrix -- sh -lc "tar -xf - -C /app/persist/.incoming && mv /app/persist/.incoming/legalmetrix-before-railway.db /app/persist/.incoming/legalmetrix.db"

# Check the uploaded source before enabling import.
railway ssh -s LegalMetrix -- sh -lc "ls -lh /app/persist/.incoming/legalmetrix.db && sha256sum /app/persist/.incoming/legalmetrix.db"
```

Compare the remote SHA-256 with:

```powershell
Get-FileHash backend/data/legalmetrix-before-railway.db -Algorithm SHA256
```

## Stream evidence files

The current local source has legacy DB paths such as `uploads/<file>`. The backend maps those safely to `UPLOAD_DIR` in production, so upload the **contents** of `backend/uploads` directly into `/app/persist/uploads`.

```powershell
tar -C backend/uploads -czf - . | railway ssh -s LegalMetrix -- sh -lc "tar -xzf - -C /app/persist/uploads"
```

Do not target `/app/persist/uploads/uploads`; that creates an incorrect nested directory.

For a large transfer, keep the terminal open. If the connection drops, rerun the same command; existing files are overwritten with the same names.

## Import safely on next deploy

Only after both the database and evidence files are staged:

```powershell
railway ssh -s LegalMetrix -- sh -lc "touch /app/persist/.incoming/IMPORT_NOW"
railway up --service LegalMetrix
```

The replacement happens at process startup before LegalMetrix opens the production SQLite database. Do not manually remove `legalmetrix.db-wal` or `legalmetrix.db-shm` while a running service owns the database.

## Verify after deploy

```powershell
railway ssh -s LegalMetrix -- npm run verify-evidence
```

Expected imported database counts for the current source:

```text
users: 7
inspections: 15
inspection_images: 35
```

The verifier reports missing referenced files, upload-file count, orphan files, and report references. It exits non-zero if any database-referenced file is missing.
