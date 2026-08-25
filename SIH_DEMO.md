# LegalMetrix SIH live demonstration

## Controlled records already prepared

| Product | Controlled condition | Measured result |
|---|---|---|
| Demo Product A | Clear FRONT and BACK labels; golden fallback | 6 PASS findings; VERIFIED; generated report stored |
| Demo Product B | MRP deliberately omitted | 5 PASS and 1 POTENTIAL_NON_COMPLIANCE; PENDING_REVIEW |
| Demo Product C | Blurred, low-resolution label | 5 REVIEW_REQUIRED and 1 NOT_APPLICABLE; recapture recommended |

The exact measured run is stored in `backend/data/sih-demo-metrics.json`. These are execution results, not estimates.

## Demo credentials

- Officer: `officer@legalmetrix.local` / `Officer@123`
- Administrator: `admin@legalmetrix.local` / `Admin@123`

These are development demo credentials only.

## Golden live path

Use the exact controlled files:

- `backend/demo-assets/demo-product-a-front.jpg`
- `backend/demo-assets/demo-product-a-back.jpg`

Copy them to the demonstration phone gallery before the event if the mobile app will be used.

1. Log in as the field officer.
2. Create **Demo Product A - Live**.
3. Upload the controlled front image as FRONT.
4. Upload the controlled back image as BACK.
5. Run preliminary analysis.
6. Show OCR, extracted declarations, and findings.
7. Confirm each finding with an officer comment.
8. Confirm the inspection changes to VERIFIED.
9. Open the dashboard to show the same inspection state.
10. Request a report.
11. Open Reports, then View PDF and Download.

The golden path does not depend on AI availability: deterministic extraction reads the controlled labels, while AI failure uses the visible fallback path.

## Prepared fallback

If live capture, Wi-Fi, Expo, or the external AI provider delays the demonstration, search for **Demo Product A**. A fully processed VERIFIED version and generated report are retained in SQLite. Demo Product B and Demo Product C are also retained for the missing-field and recapture branches.

## Before presenting

1. Start the backend: `cd backend && npm run dev`.
2. Confirm `http://<current-PC-IP>:4000/api/health` from the phone.
3. Confirm `mobile/.env` uses that same PC IP, then restart Expo with a cleared cache.
4. Start the dashboard: `cd web && npm run dev`.
5. Log in once on both clients.
6. Open Reports and verify the prepared Demo Product A PDF.

## Rebuild only the controlled demo data

From `backend`:

```powershell
npm run prepare-sih-demo -- --reset
```

This removes and recreates records tagged `[SIH_DEMO:*]` only, regenerates the controlled images, runs OCR/extraction/rules/officer verification/report generation, and replaces the measured-results JSON. Without `--reset`, the processed golden fallback is preserved.
