import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

const links = [['/', 'Command centre'], ['/inspections', 'Inspections'], ['/reports', 'Reports'], ['/users', 'Users']];
export function ThemeToggle() { const { isDark, toggleTheme } = useTheme(); return <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}><span>{'\u2600'}</span><span className="theme-toggle-track"><i/></span><span>{'\u263E'}</span></button>; }

export function AppShell() {
  const { user, logout } = useAuth(); const { isDark } = useTheme();
  return <div className="app-shell"><aside className="sidebar"><NavLink className="brand" to="/"><img src={isDark ? '/legalmetrix-mark-dark.svg' : '/legalmetrix-mark-light.svg'} alt="LegalMetrix"/><div><span>Legal<span>Metrix</span></span><small>Compliance intelligence</small></div></NavLink><nav>{links.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'}>{label}</NavLink>)}</nav><div className="user-block"><div className="user-identity"><span className="avatar">{user?.fullName?.[0] || '?'}</span><div><strong>{user?.fullName || 'Authorized user'}</strong><small>{user?.role || 'SESSION'}</small></div></div><div className="user-actions"><ThemeToggle/><button className="text-button" onClick={logout}>Sign out <span aria-hidden="true">›</span></button></div></div></aside><main className="content"><header className="topbar"><div><span className="eyebrow">Department of Consumer Affairs · preliminary assessment</span><h1>LegalMetrix</h1></div><span className="secure-indicator">● Secure session</span></header><Outlet /></main></div>;
}
