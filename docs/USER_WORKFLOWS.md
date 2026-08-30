# User workflows

## Field Officer mobile workflow

```text
Register
→ Admin Approval
→ Login Mobile
→ Create Inspection
→ Capture Evidence
→ Analyze
→ Review Findings
→ Complete Officer Review
```

Field Officers can capture and upload evidence, run analysis, inspect declarations, and confirm/reject individual findings. They cannot make final administrative outcomes.

## Admin web workflow

```text
Login Web
→ Inspect Submitted Record
→ Compare Automated Findings
→ View Original Evidence
→ Make Human Decision
→ VERIFIED | POTENTIAL_NON_COMPLIANCE_CONFIRMED | ESCALATED_FOR_ENFORCEMENT_REVIEW
→ Report / Audit Trail
```

If automated results are incomplete or uncertain, Admins review the original evidence. Selecting `VERIFIED` in this condition requires explicit manual-override confirmation and may include an Admin note. Automated findings are retained for traceability.
