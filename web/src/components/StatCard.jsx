import { Link } from 'react-router-dom';

export function StatCard({ label, value, detail, to }) {
  const content = <><p>{label}</p><strong key={value ?? 'loading'} className={value == null ? 'stat-loading' : 'stat-value'}>{value ?? '—'}</strong>{detail && <span>{detail}</span>}</>;
  return to ? <Link to={to} className="stat-card stat-card--link" aria-label={`View ${label}`}>{content}</Link> : <section className="stat-card">{content}</section>;
}
