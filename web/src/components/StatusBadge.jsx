import { INSPECTION_STATUS_META, normalizeInspectionStatus } from '../lib/inspection-status';

const accountLabels = { PENDING_APPROVAL: 'PENDING VERIFICATION', APPROVED: 'APPROVED', REJECTED: 'REJECTED', SUSPENDED: 'SUSPENDED' };

export function StatusBadge({ status }) {
  const normalizedStatus = normalizeInspectionStatus(status);
  const label = INSPECTION_STATUS_META[normalizedStatus]?.label || accountLabels[normalizedStatus] || normalizedStatus?.replaceAll('_', ' ') || 'UNKNOWN';
  return <span className={`status status--${normalizedStatus || 'UNKNOWN'}`}>{label}</span>;
}
