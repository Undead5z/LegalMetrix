# LegalMetrix

LegalMetrix is an AI-assisted packaged-commodity compliance-screening hackathon MVP. It stores original label evidence and produces a preliminary assessment; it does **not** adjudicate, ban products, or take statutory action.

## Applications

- **React Native + Expo** — Field Officer mobile app for registration, evidence capture, analysis, and finding review.
- **React + Vite** — Admin Web Command Centre for users, inspections, evidence review, final human decisions, reports, and audit history.
- **Node.js + Express + SQLite** — authenticated API, private evidence storage, processing orchestration, rules, reports, and audit logs.

## Active processing path

```text
Image Capture
→ Image Processing
→ Tesseract OCR + Vision AI
→ Deterministic Candidate Extraction
→ Evidence Merger
→ Structured Declarations
→ Deterministic Rule Engine
→ Field Officer Review
→ Admin Human Decision
→ Report + Audit History
```

The live `analyzeInspection()` path calls `ocr.service.js`, `declaration-extraction.service.js`, `vision-extraction.service.js`, `evidence-merger.service.js`, and `rule-engine.service.js`. `semantic-extraction.service.js` is experimental and is not in the live path.

## Human-in-the-Loop Decision Model

OCR, Vision AI, and deterministic rules provide a preliminary automated assessment. Real package labels may be incomplete, curved, reflective, or difficult to read. An authorized `ADMIN` or `MASTER_ADMIN` can inspect the original submitted evidence and make the final prototype decision.

```text
AI extracts → Rules assess → Human verifies
```

**Automated finding ≠ final Admin decision.** When automated findings, missing declarations, or extraction conflicts remain, verifying requires an explicit manual-override confirmation and supports an optional Admin note. The original automated findings are preserved and audit metadata records the override.

## Roles, accounts, and inspection flow

Roles: `MASTER_ADMIN`, `ADMIN`, `FIELD_OFFICER`.

Account states: `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `SUSPENDED`.

```text
DRAFT → PROCESSING → PENDING_REVIEW → OFFICER_REVIEW_COMPLETED
  → VERIFIED | POTENTIAL_NON_COMPLIANCE_CONFIRMED | ESCALATED_FOR_ENFORCEMENT_REVIEW
```

Field Officers cannot set final outcomes. Escalation means the case needs further examination beyond this prototype.

## Real product dataset strategy

No synthetic inspection/demo dataset is included or generated. Evaluation uses real package photographs with manually verified ground truth. For each product, retain:

- product identifier and original evidence images
- manually verified declarations/ground truth
- LegalMetrix extracted declaration and extraction confidence
- correct/incorrect extraction result
- expected and actual rule result

Recommended ground-truth fields: product name, manufacturer, net quantity, MRP, manufacturing/packing date, best before, consumer care, and unit sale price.

**Confidence is not accuracy.** Confidence is the OCR/model confidence for one extracted value. Accuracy is measured later by comparing extracted values with manually verified ground truth. A value with 95% confidence does not prove 95% accuracy.

## Local setup

Use Node.js 22 LTS and Git. See [docs/NEW_PC_SETUP.md](docs/NEW_PC_SETUP.md).

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item web/.env.example web/.env
Copy-Item mobile/.env.example mobile/.env

cd backend; npm install; npm run dev
cd ../web; npm install; npm run dev
cd ../mobile; npm install; npx expo start -c --lan
```

Backend health: `http://localhost:4000/api/health`; web: `http://localhost:5173`.

Optional Vision AI uses the OpenRouter-compatible configuration in `backend/.env.example`; set `VISION_AI_API_KEY` locally. `CORS_ORIGINS` is the comma-separated browser allow-list. Native Expo requests do not send an Origin header.

## Development bootstrap accounts

Development-only seeded accounts:

| Role | Email | Password |
|---|---|---|
| Master Admin | `admin@legalmetrix.local` | `Admin@123` |
| Field Officer | `officer@legalmetrix.local` | `Officer@123` |

Change/remove development credentials before deployment. SQLite initialization keeps bootstrap users and verified LegalMetrix rules; it does not generate synthetic product inspections.
