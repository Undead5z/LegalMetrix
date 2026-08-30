# LegalMetrix architecture

```text
FIELD OFFICER MOBILE                         ADMIN WEB COMMAND CENTRE
        │                                              │
        └─────────────── Backend API ──────────────────┘
                              │
                           Evidence
                              │
                 ┌────────────┴────────────┐
                 │                         │
               OCR                     Vision AI
                 │                         │
                 └────────────┬────────────┘
                              │
                       Evidence Merger
                              │
                      Structured Declarations
                              │
                         Rule Engine
                              │
                     Automated Findings
                              │
                         Human Review
                              │
                    Admin Final Decision
                              │
                 SQLite / Reports / Audit History
```

The API stores evidence privately and persists structured inspection data in SQLite. OCR, Vision AI, extraction, merger, and rules provide automated decision support. They do not replace Field Officer review or the authorized Admin/Master Admin human decision.
