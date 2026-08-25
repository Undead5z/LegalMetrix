# LegalMetrix MVP foundation

## Architecture

The web and mobile clients call one Express API. Express persists structured inspection data in SQLite and stores image files on a private local filesystem path (`backend/uploads/`); SQLite stores image metadata only. The processing pipeline is intentionally modular:

```
inspection images → OCR service → declaration extraction → deterministic rule engine → findings → officer review → PDF report
```

The current service implementations return `NOT_IMPLEMENTED` and create no declarations or findings. Regulatory logic must be stored in `rules`, not in client components or OCR code. Exact legal citations are not seeded; future supplied citations must be used, otherwise retain `LEGAL_REFERENCE_PENDING_VERIFICATION`.

## Database

`backend/src/db/schema.sql` is idempotently applied at backend start.

| Table | Purpose |
|---|---|
| `users` | Authenticated `ADMIN` and `OFFICER` accounts with bcrypt password hashes. |
| `products` | Product identity recorded per MVP inspection. |
| `inspections` | Officer-owned inspection, location/notes, and workflow state. |
| `inspection_images` | Evidence metadata, type, MIME type, private storage path, and quality state. |
| `declarations` | Future extracted declarations with value, confidence, source image, and bounding box. |
| `rules` | Version-aware, updateable regulatory requirement data and legal-reference field. |
| `findings` | Separate automated status/evidence and officer decision/comment fields. |
| `reports` | Requested/generated report metadata; no PDF is currently generated. |

Inspection states are `DRAFT`, `PROCESSING`, `PENDING_REVIEW`, `VERIFIED`, and `REPORT_GENERATED`. Finding states are restricted to `PASS`, `POTENTIAL_NON_COMPLIANCE`, `REVIEW_REQUIRED`, and `NOT_APPLICABLE`.

## API

All routes other than login require `Authorization: Bearer <JWT>`.

| Method | Path | Current behavior |
|---|---|---|
| `POST` | `/api/auth/login` | Validates credentials and returns JWT plus safe user data. |
| `POST` | `/api/inspections` | Creates a product and officer-owned `DRAFT` inspection. |
| `POST` | `/api/inspections/:id/images` | Accepts multipart `images` (up to 6) plus `imageType`; validates and stores private files. |
| `POST` | `/api/inspections/:id/analyze` | Invokes all processing interfaces; returns `NOT_IMPLEMENTED`, no invented results. |
| `GET` | `/api/inspections` | Lists inspections visible to the caller; officers see only their own. |
| `GET` | `/api/inspections/:id` | Returns inspection, evidence metadata, declarations, findings, reports. |
| `PATCH` | `/api/findings/:id/review` | Prepares officer confirmation/rejection for real future findings. |
| `POST` | `/api/inspections/:id/report` | Records a report request and returns `NOT_IMPLEMENTED` PDF-generation state. |
| `GET` | `/api/dashboard/stats` | Database-derived counts only, scoped to caller role. |
| `GET` | `/api/reports` | Additional endpoint used by the functional web Reports screen. |
| `GET` | `/health` | Unauthenticated backend health check. |

## Verification completed

- `backend`: schema initialized successfully and Express imported successfully.
- Authentication: seeded officer login verified via `POST /api/auth/login`.
- Inspection creation: authenticated `POST /api/inspections` verified; test data was then reset by recreating the database with seed users only.
- `web`: Vite dev server started successfully and `npm run build` succeeded.
- `mobile`: Expo Metro started successfully and Android bundle export succeeded.
- Client navigation is implemented for all requested screens.

## Current limitations / intentional placeholders

1. OCR, CV quality assessment, declaration extraction, deterministic rule validation, and PDF file generation are `NOT_IMPLEMENTED` by design for this run.
2. The SQLite database and uploaded image storage are local-MVP only; no backup, encryption-at-rest, virus scanning, or retention policy is yet configured.
3. Camera/gallery features require a device/emulator and runtime permission; physical devices must use a LAN-reachable API URL.
4. There is no offline queue/sync, password reset, user administration UI, audit log, report download, or product deduplication yet.
5. `PENDING_REVIEW` after analysis means the processing request completed but has no implemented automated assessment; it is not a compliance conclusion.
6. Browser CORS is permissive for local development and must be restricted for deployment.

## Files to modify in future runs

- OCR adapter: `backend/src/services/ocr.service.js`
- Structured declaration mapping: `backend/src/services/declaration-extraction.service.js`
- Versioned deterministic assessment: `backend/src/services/rule-engine.service.js`, `backend/src/db/schema.sql`
- PDF implementation: `backend/src/services/pdf-report.service.js`
- Processing orchestration/API persistence: `backend/src/controllers/inspection.controller.js`
- Officer-review web UI: `web/src/pages/InspectionDetailPage.jsx`
- Field capture and multi-image/offline improvements: `mobile/App.js`
- API policy, upload hardening, production CORS: `backend/src/routes/index.js`, `backend/src/app.js`, `backend/src/config/env.js`
