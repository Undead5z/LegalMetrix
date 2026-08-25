import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const links = [['/', 'Command centre'], ['/inspections', 'Inspections'], ['/reports', 'Reports'], ['/users', 'Users']];

export function AppShell() {
  const { user, logout } = useAuth();
  return <div className="app-shell">
    <aside className="sidebar">
      <NavLink className="brand" to="/"><span>LM</span><div>LegalMetrix<small>Compliance intelligence</small></div></NavLink>
      <nav>{links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav>
      <div className="user-block"><span className="avatar">{user?.fullName?.[0] || '?'}</span><div><strong>{user?.fullName || 'Authorized user'}</strong><small>{user?.role || 'SESSION'}</small></div><button className="text-button" onClick={logout}>Sign out</button></div>
    </aside>
    <main className="content"><header className="topbar"><div><span className="eyebrow">Department of Consumer Affairs · preliminary assessment</span><h1>LegalMetrix</h1></div><span className="secure-indicator">● Secure session</span></header><Outlet /></main>
  </div>;
}
