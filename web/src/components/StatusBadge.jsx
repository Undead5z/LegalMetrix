export function StatusBadge({ status }) {
  const labels = { PENDING_APPROVAL: 'PENDING VERIFICATION', APPROVED: 'APPROVED', REJECTED: 'REJECTED', SUSPENDED: 'SUSPENDED' }; const label = labels[status] || status?.replaceAll('_', ' ') || 'UNKNOWN';
  return <span className={`status status--${status || 'UNKNOWN'}`}>{label}</span>;
}
