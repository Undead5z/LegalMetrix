# Legal Metrology Rule Engine MVP

Rules live in SQLite `rules` and are seeded from `backend/src/config/mvp-rules.js`. Each versioned record has an ID, editable name, field, requirement, applicability, pending legal reference, version, effective-from/to dates, active status, validation type, and validation logic metadata. Update the configuration/version and rerun initialization to update a rule; do not place legal rule text in OCR or UI code.

The engine reads active rules and stored declarations. It performs presence, grouped-presence, MRP/quantity/date format checks, confidence review (below 0.65), and date conditional applicability. It stores an automated finding independently from officer confirmation/rejection. All unverified legal references remain `LEGAL_REFERENCE_PENDING_VERIFICATION`.

Automated results are only PASS, POTENTIAL_NON_COMPLIANCE, REVIEW_REQUIRED, or NOT_APPLICABLE. They are preliminary assessments; the web detail screen requires an officer to confirm or reject each finding.
