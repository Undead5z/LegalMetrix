import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { request } from '../lib/api';
import { useAuth } from '../lib/auth';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

const filterKeys = ['search', 'state', 'issue', 'from', 'to'];
const displayStatus = inspection => inspection.admin_decision === 'PRODUCT_REJECTED' ? 'PRODUCT_REJECTED' : inspection.admin_decision === 'POTENTIAL_ISSUE' ? 'POTENTIAL_ISSUE' : inspection.state;
function issueSummary(inspection) {
  if (inspection.potential_issues_count) {
    const label = String(inspection.potential_issue_summary || 'Issue').split(' · ')[0].replace(/\s+declaration$/i, '');
    return `${inspection.potential_issues_count} potential issue${inspection.potential_issues_count === 1 ? '' : 's'}: ${label}`;
  }
  return inspection.admin_decision === 'PRODUCT_REJECTED' || inspection.admin_decision === 'POTENTIAL_ISSUE' ? 'Admin-marked potential issue' : 'No potential issues';
}

export function InspectionsPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filters = Object.fromEntries(filterKeys.map(key => [key, searchParams.get(key) || '']));
  const query = searchParams.toString();

  useEffect(() => {
    setError('');
    request(`/inspections?${query}`, { token }).then(response => setItems(response.inspections)).catch(e => setError(e.message));
  }, [token, query]);

  function updateFilters(changes) {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    setSearchParams(next);
  }

  const showingPotentialIssues = filters.issue === 'potential';
  const title = filters.state === 'VERIFIED' ? 'Verified inspections' : showingPotentialIssues ? 'Potential issues' : filters.state === 'PENDING_REVIEW' ? 'Awaiting review' : 'Inspections';

  return <>
    <section className="page-heading"><div><span className="eyebrow">INSPECTION REPOSITORY</span><h2>{title}</h2><p>Review field-officer records, assessment outcomes, and evidence. New inspections are created only in the Field Officer mobile app.</p></div></section>
    {error && <p className="form-error">{error}</p>}
    <section className="panel form-panel">
      <div className="filter-chip-row" aria-label="Inspection shortcuts">
        <button className={`filter-chip ${!filters.state && !filters.issue ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ state: '', issue: '' })}>All inspections</button>
        <button className={`filter-chip ${filters.state === 'VERIFIED' ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ state: 'VERIFIED', issue: '' })}>Verified</button>
        <button className={`filter-chip ${showingPotentialIssues ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ issue: 'potential', state: '' })}>Potential issues</button>
        <button className={`filter-chip ${filters.state === 'PENDING_REVIEW' && !showingPotentialIssues ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ state: 'PENDING_REVIEW', issue: '' })}>Awaiting review</button>
        <button className={`filter-chip ${filtersOpen ? 'filter-chip--active' : ''}`} onClick={() => setFiltersOpen(open => !open)}>{filtersOpen ? 'Hide filters' : 'Filters'}</button>
      </div>
      {filtersOpen && <div className="form-grid"><label>Search<input value={filters.search} onChange={event => updateFilters({ search: event.target.value })} placeholder="Product, number, officer" /></label><label>Status<select value={filters.state} onChange={event => updateFilters({ state: event.target.value, issue: event.target.value ? '' : filters.issue })}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="PROCESSING">Processing</option><option value="PENDING_REVIEW">Pending review</option><option value="VERIFIED">Verified</option></select></label><label>From<input type="date" value={filters.from} onChange={event => updateFilters({ from: event.target.value })} /></label><label>To<input type="date" value={filters.to} onChange={event => updateFilters({ to: event.target.value })} /></label></div>}
    </section>
    <section className="panel">{items.length ? <div className="data-table inspection-table"><div className="row inspection-row table-head"><span>Product / inspection</span><span>Officer</span><span>Date / findings</span><span>Status</span><span>Potential issue details</span></div>{items.map(item => <Link className="row inspection-row" to={`/inspections/${item.id}`} key={item.id}><strong>{item.product_name}<small>{item.inspection_number}</small></strong><span>{item.officer_name}</span><span>{new Date(item.created_at + 'Z').toLocaleDateString()}<small>{item.findings_count} findings</small></span><StatusBadge status={displayStatus(item)} /><span className="issue-summary">{issueSummary(item)}</span></Link>)}</div> : <EmptyState title="No inspections found" detail="Adjust the filters to view another set of inspection records." />}</section>
  </>;
}
