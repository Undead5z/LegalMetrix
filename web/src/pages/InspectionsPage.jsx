import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { request } from '../lib/api';
import { useAuth } from '../lib/auth';
import { INSPECTION_STATUS, INSPECTION_STATUS_META, inspectionDisplayStatus, isPotentialIssueStatus } from '../lib/inspection-status';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';

const filterKeys = ['search', 'state', 'issue', 'productCondition', 'from', 'to'];
const productConditionValues = ['EXPIRED', 'NEAR_EXPIRY', 'VALID', 'UNKNOWN'];
const statusFilterValues = Object.values(INSPECTION_STATUS);
function issueSummary(inspection) {
  const status = inspectionDisplayStatus(inspection);
  if (status === INSPECTION_STATUS.VERIFIED) return 'No potential issues';
  if (isPotentialIssueStatus(status)) {
    const labels = String(inspection.admin_potential_issue_summary || '').split(' | ').filter(Boolean);
    return labels.length ? `${labels.length} potential issue${labels.length === 1 ? '' : 's'}: ${labels.join(' and ')}` : 'Potential outcome ? no finding selected';
  }
  if (inspection.potential_issues_count) {
    const label = String(inspection.potential_issue_summary || 'Issue').split(' ? ')[0].replace(/\s+declaration$/i, '');
    return `${inspection.potential_issues_count} preliminary potential issue${inspection.potential_issues_count === 1 ? '' : 's'}: ${label}`;
  }
  return 'No potential issues';
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
  const showingProductCondition = Boolean(filters.productCondition);
  const title = filters.state === INSPECTION_STATUS.VERIFIED ? 'Verified inspections' : showingPotentialIssues ? 'Potential issues' : filters.state === INSPECTION_STATUS.PENDING_REVIEW ? 'Awaiting review' : 'Inspections';

  return <>
    <section className="page-heading"><div><span className="eyebrow gold-label">INSPECTION REPOSITORY</span><h2>{title}</h2><p>Review field-officer records, assessment outcomes, and evidence. New inspections are created only in the Field Officer mobile app.</p></div></section>
    {error && <p className="form-error">{error}</p>}
    <section className="panel form-panel">
      <div className="filter-chip-row" aria-label="Inspection shortcuts">
        <button className={`filter-chip ${!filters.state && !filters.issue && !filters.productCondition ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ state: '', issue: '', productCondition: '' })}>All inspections</button>
        <button className={`filter-chip ${filters.state === INSPECTION_STATUS.VERIFIED ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ state: INSPECTION_STATUS.VERIFIED, issue: '', productCondition: '' })}>Verified</button>
        <button className={`filter-chip ${showingPotentialIssues ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ issue: 'potential', state: '', productCondition: '' })}>Potential issues</button><button className={`filter-chip ${filters.productCondition === 'EXPIRED' ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ productCondition: filters.productCondition === 'EXPIRED' ? '' : 'EXPIRED' })}>Expired products</button>
        <button className={`filter-chip ${filters.state === INSPECTION_STATUS.PENDING_REVIEW && !showingPotentialIssues ? 'filter-chip--active' : ''}`} onClick={() => updateFilters({ state: INSPECTION_STATUS.PENDING_REVIEW, issue: '', productCondition: '' })}>Awaiting review</button>
        <button className={`filter-chip ${filtersOpen ? 'filter-chip--active' : ''}`} onClick={() => setFiltersOpen(open => !open)}>{filtersOpen ? 'Hide filters' : 'Filters'}</button>
      </div>
      {filtersOpen && <div className="form-grid"><label>Search<input value={filters.search} onChange={event => updateFilters({ search: event.target.value })} placeholder="Product, number, officer" /></label><label>Status<select value={filters.state} onChange={event => updateFilters({ state: event.target.value, issue: event.target.value ? '' : filters.issue })}><option value="">All statuses</option>{statusFilterValues.map(status => <option value={status} key={status}>{INSPECTION_STATUS_META[status].filterLabel}</option>)}</select></label><label>Product condition<select value={filters.productCondition} onChange={event => updateFilters({ productCondition: event.target.value })}><option value="">All conditions</option>{productConditionValues.map(condition => <option value={condition} key={condition}>{condition.replaceAll('_', ' ')}</option>)}</select></label><label>From<input type="date" value={filters.from} onChange={event => updateFilters({ from: event.target.value })} /></label><label>To<input type="date" value={filters.to} onChange={event => updateFilters({ to: event.target.value })} /></label></div>}
    </section>
    <section className="panel">{items.length ? <div className="data-table inspection-table"><div className="row inspection-row table-head"><span>Product / inspection</span><span>Officer</span><span>Date / findings</span><span>Status</span><span>Potential issue details</span></div>{items.map(item => <Link className="row inspection-row" to={`/inspections/${item.id}`} key={item.id}><strong>{item.product_name}<small>{item.inspection_number}</small></strong><span>{item.officer_name}</span><span>{new Date(item.created_at + 'Z').toLocaleDateString()}<small>{' '}{item.findings_count} findings</small></span><StatusBadge status={inspectionDisplayStatus(item)} /><span className="issue-summary">{showingProductCondition ? `Product condition: ${(item.product_condition || 'UNKNOWN').replaceAll('_', ' ')}` : issueSummary(item)}</span></Link>)}</div> : <EmptyState title="No inspections found" detail="Adjust the filters to view another set of inspection records." />}</section>
  </>;
}
