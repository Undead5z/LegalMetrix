export function StatCard({ label, value, detail }) {
  return <section className="stat-card"><p>{label}</p><strong key={value ?? 'loading'} className={value == null ? 'stat-loading' : 'stat-value'}>{value ?? '—'}</strong>{detail && <span>{detail}</span>}</section>;
}
