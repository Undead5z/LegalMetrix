# Testing strategy

## Functional testing

Run backend checks with `cd backend; npm test` and build the web client with `cd web; npm run build`.

Functional testing covers:

- authentication and application context (`MOBILE`/`WEB`)
- user registration, approval, suspension, and RBAC
- protected inspection access and evidence upload
- OCR and Vision AI/fallback orchestration
- deterministic extraction, evidence merger, and rules
- Field Officer finding review
- Admin final decisions and manual override audit metadata
- report generation and audit history
- allowed/rejected browser origins

## Dataset evaluation

There is no synthetic demo product dataset and no generated accuracy claim. Evaluate with real packaged-product photographs and manually annotated ground truth.

For each product, compare extracted declarations with verified values and compare actual rule results with expected rule results. Track product identifier, evidence, field-level confidence, correct/incorrect extraction, and expected/actual rule outcome.

Confidence is not accuracy. Confidence is an extraction/model estimate for an individual value; accuracy is calculated only from comparison with manually verified ground truth.
