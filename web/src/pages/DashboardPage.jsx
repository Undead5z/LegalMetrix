import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatCard } from '../components/StatCard';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

const displayStatus = inspection => inspection.admin_decision === 'PRODUCT_REJECTED' ? 'PRODUCT_REJECTED' : inspection.admin_decision === 'POTENTIAL_ISSUE' ? 'POTENTIAL_ISSUE' : inspection.state;

export function DashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([request('/dashboard/stats', { token }), request('/inspections', { token })])
      .then(([nextStats, response]) => { setStats(nextStats); setInspections(response.inspections.slice(0, 5)); })
      .catch(e => setError(e.message));
  }, [token]);

  const stateCount = state => stats?.inspectionsByState.find(item => item.state === state)?.count || 0;

  return <>
    <section className="page-heading">
      <div><span className="eyebrow">LIVE DATABASE VIEW</span><h2>Command centre</h2><p>Inspection activity, potential issues, and review status from the LegalMetrix repository.</p></div>
      <Link to="/inspections" className="button button--gold">View inspections</Link>
    </section>
    {error && <p className="form-error">{error}</p>}
    <div className="stat-grid">
      <StatCard label="Total inspections" value={stats?.totalInspections} detail="Open all inspection records" to="/inspections" />
      <StatCard label="Awaiting review" value={stateCount('PENDING_REVIEW')} detail="Open records awaiting review" to="/inspections?state=PENDING_REVIEW" />
      <StatCard label="Verified" value={stateCount('VERIFIED')} detail="Open verified inspection records" to="/inspections?state=VERIFIED" />
      <StatCard label="Potential issues" value={stats?.potentialIssues} detail="Open records with potential issues" to="/inspections?issue=potential" />
    </div>
    {stats?.userStats && <section className="panel access-overview"><div className="section-title"><div><span className="eyebrow">IDENTITY GOVERNANCE</span><h3>Operational access</h3><p>Live account status from the authorization database.</p></div><Link className="button button--secondary" to="/users">Manage users</Link></div><div className="access-stat-grid"><Link className="access-stat" to="/users"><span>Pending approvals</span><strong>{stats.userStats.pendingApprovals}</strong><small>Awaiting verification</small></Link><Link className="access-stat" to="/users"><span>Active Field Officers</span><strong>{stats.userStats.activeFieldOfficers}</strong><small>Approved mobile accounts</small></Link><Link className="access-stat" to="/users"><span>Active Admins</span><strong>{stats.userStats.activeAdmins}</strong><small>Approved web accounts</small></Link></div></section>}
    <section className="panel"><div className="section-title"><div><h3>Recent inspections</h3><p>Latest records accessible to your role.</p></div><Link to="/inspections">View all</Link></div>{!stats ? <p className="muted">Loading database records…</p> : inspections.length ? <div className="data-table"><div className="row table-head"><span>Inspection</span><span>Product</span><span>State</span><span>Created</span></div>{inspections.map(item => <Link className="row" to={`/inspections/${item.id}`} key={item.id}><span>{item.inspection_number}</span><strong>{item.product_name}</strong><StatusBadge status={displayStatus(item)} /><span>{new Date(item.created_at + 'Z').toLocaleDateString()}</span></Link>)}</div> : <EmptyState title="No inspections yet" detail="Field officers can create inspections in the mobile app." />}</section>
  </>;
}
