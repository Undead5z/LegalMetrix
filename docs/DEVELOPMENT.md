# Development guide

## Current runtime architecture

`POST /api/inspections/:id/analyze` orchestrates the active backend path:

```text
Private evidence images
→ quality assessment and Tesseract OCR
→ deterministic declaration candidates
+ Vision AI candidates
→ evidence merger
→ persisted structured declarations
→ version-aware deterministic rule assessment
→ persisted automated findings
→ Field Officer review
→ Admin/Master Admin human final decision
→ PDF reports and audit history
```

`semantic-extraction.service.js` is experimental and is not called by this path.

## Workflow and human override

States: `DRAFT`, `PROCESSING`, `PENDING_REVIEW`, `OFFICER_REVIEW_COMPLETED`, then `VERIFIED`, `POTENTIAL_NON_COMPLIANCE_CONFIRMED`, or `ESCALATED_FOR_ENFORCEMENT_REVIEW`.

Only `ADMIN` and `MASTER_ADMIN` record final outcomes. Field Officers capture evidence, run analysis, and review individual findings. Automated findings, missing declarations, low confidence, and `NEEDS_REVIEW` conflicts are decision-support information. When verifying with such results remaining, the Admin UI requires explicit override confirmation and accepts an optional note. Findings and declarations are not modified to make them appear to pass.

`ADMIN_DECISION_RECORDED` audit metadata records the final decision, selected finding IDs, remaining automated finding/conflict counts, and `manualOverride` without storing credentials or secrets.

## Services

| Service | Active role |
|---|---|
| `ocr.service.js` | image quality assessment and local Tesseract OCR |
| `declaration-extraction.service.js` | deterministic declaration candidates |
| `vision-extraction.service.js` | configured Vision AI candidates and diagnostics/fallback |
| `evidence-merger.service.js` | reconciles OCR and Vision evidence |
| `rule-engine.service.js` | version-aware deterministic findings |
| `pdf-report.service.js` | report generation |
| `semantic-extraction.service.js` | experimental; not wired into analysis |

## Auth, RBAC, and CORS

Roles are `MASTER_ADMIN`, `ADMIN`, `FIELD_OFFICER`; account states are `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `SUSPENDED`. JWT-protected API access and account approval checks remain server-side. Field Officers log in through `MOBILE`; Admins through `WEB`.

Browser CORS is an allow-list from `CORS_ORIGINS`; default development origin is `http://localhost:5173`. Requests without an Origin header, such as Expo/native requests, remain supported.

## Theme and provider setup

Web theme state supports Light/Dark mode through CSS theme tokens; mobile exposes matching semantic theme values in `mobile/src/theme.js`.

Vision extraction uses the OpenRouter-compatible variables in `backend/.env.example`: `VISION_AI_PROVIDER`, `VISION_AI_BASE_URL`, `VISION_AI_API_KEY`, and `VISION_AI_MODEL`. Never commit a real API key.

## Testing and real-data evaluation

Run backend functional tests with `cd backend; npm test`; build web with `cd web; npm run build`.

Functional testing covers authentication, approval/RBAC, upload, OCR, Vision fallback, extraction, rules, review, Admin decision, reports, and CORS. Dataset evaluation is separate: use real packaged-product photographs and manually annotated ground truth. Record confidence separately from accuracy; do not derive accuracy percentages from model confidence.

SQLite initialization seeds required bootstrap accounts and LegalMetrix rules only. It does not create synthetic inspection or product data.
