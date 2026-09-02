export const INSPECTION_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  PROCESSING: 'PROCESSING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  OFFICER_REVIEW_COMPLETED: 'OFFICER_REVIEW_COMPLETED',
  VERIFIED: 'VERIFIED',
  POTENTIAL_NON_COMPLIANCE_CONFIRMED: 'POTENTIAL_NON_COMPLIANCE_CONFIRMED',
  ESCALATED_FOR_ENFORCEMENT_REVIEW: 'ESCALATED_FOR_ENFORCEMENT_REVIEW'
});

const LEGACY_STATUS_MAP = Object.freeze({
  PRODUCT_REJECTED: INSPECTION_STATUS.ESCALATED_FOR_ENFORCEMENT_REVIEW,
  POTENTIAL_ISSUE: INSPECTION_STATUS.POTENTIAL_NON_COMPLIANCE_CONFIRMED
});

export const INSPECTION_STATUS_META = Object.freeze({
  [INSPECTION_STATUS.DRAFT]: { label: 'DRAFT', filterLabel: 'Draft' },
  [INSPECTION_STATUS.PROCESSING]: { label: 'PROCESSING', filterLabel: 'Processing' },
  [INSPECTION_STATUS.PENDING_REVIEW]: { label: 'PENDING REVIEW', filterLabel: 'Pending review' },
  [INSPECTION_STATUS.OFFICER_REVIEW_COMPLETED]: { label: 'OFFICER REVIEW COMPLETED', filterLabel: 'Officer review completed' },
  [INSPECTION_STATUS.VERIFIED]: { label: 'VERIFIED', filterLabel: 'Verified' },
  [INSPECTION_STATUS.POTENTIAL_NON_COMPLIANCE_CONFIRMED]: { label: 'POTENTIAL NON-COMPLIANCE CONFIRMED', filterLabel: 'Potential non-compliance confirmed', isPotentialIssue: true },
  [INSPECTION_STATUS.ESCALATED_FOR_ENFORCEMENT_REVIEW]: { label: 'ESCALATED FOR ENFORCEMENT REVIEW', filterLabel: 'Escalated for Enforcement Review', isPotentialIssue: true }
});

export function normalizeInspectionStatus(status) {
  return LEGACY_STATUS_MAP[status] || status;
}

export function inspectionDisplayStatus(inspection) {
  return normalizeInspectionStatus(inspection.admin_decision || inspection.state);
}

export function isPotentialIssueStatus(status) {
  return Boolean(INSPECTION_STATUS_META[normalizeInspectionStatus(status)]?.isPotentialIssue);
}
