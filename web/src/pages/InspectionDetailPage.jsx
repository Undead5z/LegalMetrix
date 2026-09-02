import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { request } from '../lib/api';
import { useAuth } from '../lib/auth';
import { INSPECTION_STATUS, inspectionDisplayStatus, isPotentialIssueStatus } from '../lib/inspection-status';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { EvidenceImage } from '../components/EvidenceImage';
import { ActionDialog } from '../components/ActionDialog';

const selectableFinding = finding => ['POTENTIAL_NON_COMPLIANCE', 'REVIEW_REQUIRED'].includes(finding.status);
const legalReference = finding => finding.legal_reference === 'LEGAL_REFERENCE_PENDING_VERIFICATION' ? 'Legal reference pending verification' : finding.legal_reference;
const storedFindingIds = inspection => inspection?.adminDecisionFindings?.map(finding => finding.id) || [];

export function InspectionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [inspection, setInspection] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDecision, setPendingDecision] = useState(null);
  const [selectedFindingIds, setSelectedFindingIds] = useState([]); const [deleteDialog, setDeleteDialog] = useState(false); const [overrideDialog, setOverrideDialog] = useState(false);
  const isAdmin = ['MASTER_ADMIN', 'ADMIN'].includes(user?.role);

  const load = () => request(`/inspections/${id}`, { token }).then(response => {
    setInspection(response.inspection);
    setSelectedFindingIds(storedFindingIds(response.inspection));
  }).catch(e => setError(e.message));
  useEffect(() => { load(); }, [id, token]);

  async function analyze() { setBusy(true); setMessage(''); try { const result = await request(`/inspections/${id}/analyze`, { token, method: 'POST' }); setInspection(result.inspection); setMessage(result.analysis.message); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function report() { setBusy(true); setMessage(''); try { const result = await request(`/inspections/${id}/report`, { token, method: 'POST' }); setMessage(`${result.report.report_number}: ${result.generation.message}`); load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function removeInspection() { setDeleteDialog(true); }
  async function confirmRemoval() { setBusy(true); setError(''); try { await request(`/inspections/${id}`, { token, method: 'DELETE' }); navigate('/inspections', { replace: true }); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  async function review(findingId, officerDecision) { setBusy(true); setError(''); try { await request(`/findings/${findingId}/review`, { token, method: 'PATCH', body: { officerDecision } }); load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }
  function startDecision(decision) { setError(''); setPendingDecision(decision); if (decision === 'VERIFIED') setSelectedFindingIds([]); }
  function cancelDecision() { setError(''); setPendingDecision(null); setSelectedFindingIds(storedFindingIds(inspection)); }
  async function confirmDecision(overrideConfirmed = false, comment = null) {
    if (!pendingDecision) return;
    if (pendingDecision !== 'VERIFIED' && !selectedFindingIds.length) { setError('Select at least one automated finding before confirming this decision.'); return; }
    if (pendingDecision === 'VERIFIED' && verificationBlocked && !overrideConfirmed) { setOverrideDialog(true); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request(`/inspections/${id}/admin-decision`, { token, method: 'PATCH', body: { decision: pendingDecision, findingIds: selectedFindingIds, comment } });
      setInspection(result.inspection);
      setPendingDecision(null);
      setSelectedFindingIds(storedFindingIds(result.inspection));
      setMessage(`Administrator decision confirmed.${result.reportsRefreshed ? ` ${result.reportsRefreshed} existing report(s) refreshed.` : ''}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (error && !inspection) return <><Link className="back-link" to="/inspections">← Inspections</Link><p className="form-error">{error}</p></>;
  if (!inspection) return <p className="muted">Loading inspection…</p>;
  const aiDebug = (() => { try { return JSON.parse(inspection.ai_diagnostics_json || '{}'); } catch { return {}; } })();
  const choosingFinding = [INSPECTION_STATUS.POTENTIAL_NON_COMPLIANCE_CONFIRMED, INSPECTION_STATUS.ESCALATED_FOR_ENFORCEMENT_REVIEW].includes(pendingDecision);
  const presentationStatus = inspectionDisplayStatus(inspection);
  const potentialIssueDetail = inspection.potential_issues_count ? `${inspection.potential_issues_count} preliminary potential issue${inspection.potential_issues_count === 1 ? '' : 's'} identified.` : isPotentialIssueStatus(presentationStatus) ? 'Administrative potential issue decision recorded.' : 'No potential issues identified.';
  const verificationBlocked = inspection.findings.some(finding => !finding.officer_decision || (['POTENTIAL_NON_COMPLIANCE', 'REVIEW_REQUIRED'].includes(finding.status) && finding.officer_decision !== 'REJECTED')) || inspection.declarations.some(declaration => declaration.extraction_state === 'NEEDS_REVIEW');
  const verificationBlockMessage = 'Verification is unavailable while findings or OCR/Vision extraction conflicts remain unresolved.';

  return <>
    <Link className="back-link" to="/inspections">← Inspections</Link>
    <section className="page-heading detail-heading"><div><span className="eyebrow">{inspection.inspection_number}</span><h2>{inspection.product_name}</h2><p>{inspection.generic_name || 'Generic commodity name not recorded'} · Officer: {inspection.officer_name}</p></div><StatusBadge status={presentationStatus} /></section>
    {error && <p className="form-error">{error}</p>}{message && <p className="notice">{message}</p>}
    <div className="detail-grid">
      <section className="panel"><h3>Inspection record</h3><dl><dt>Brand</dt><dd>{inspection.brand_name || 'Not recorded'}</dd><dt>Location</dt><dd>{inspection.location || 'Not recorded'}</dd><dt>Created</dt><dd>{new Date(inspection.created_at + 'Z').toLocaleString()}</dd><dt>Notes</dt><dd>{inspection.notes || 'None'}</dd><dt>Potential issue details</dt><dd>{potentialIssueDetail}</dd></dl></section>
      <section className="panel"><h3>Actions</h3><p className="muted">Runs OCR-backed preliminary checks. The final administrator decision is recorded below the automated findings.</p><div className="action-stack"><button className="button button--secondary" disabled={busy || !inspection.images.length} onClick={analyze}>{busy ? 'Working…' : 'Re-run preliminary analysis'}</button><button className="button button--gold" disabled={busy} onClick={report}>Generate report</button><button className="button button--danger" disabled={busy} onClick={removeInspection}>Delete inspection</button></div></section>
    </div>
    <section className="panel"><div className="section-title"><div><h3>Evidence images</h3><p>Original files are retained privately; OCR quality is shown per image.</p></div><span>{inspection.images.length} attached</span></div>{inspection.images.length ? <div className="image-list">{inspection.images.map(image => <EvidenceImage key={image.id} inspectionId={inspection.id} image={image} token={token} />)}</div> : <EmptyState title="No images uploaded" detail="The Field Officer mobile workflow is used to capture package-label evidence." />}</section>
    <section className="panel"><div className="section-title"><div><h3>OCR debug</h3><p>Development diagnostics for stored evidence and OCR output.</p></div></div>{inspection.images.map(image => <div className="declaration" key={`ocr-${image.id}`}><strong>{image.image_type} — OCR {image.ocr_status || 'NOT_RUN'}</strong><small>Confidence: {image.ocr_confidence == null ? 'Not available' : `${Math.round(image.ocr_confidence * 100)}%`}</small>{image.ocr_error && <small>OCR error: {image.ocr_error}</small>}<strong>Raw OCR</strong><pre>{image.ocr_text || 'No OCR text stored for this image.'}</pre><strong>Normalized OCR</strong><pre>{image.normalized_ocr_text || 'No normalized OCR text stored for this image.'}</pre></div>)}</section>
    <section className="panel"><div className="section-title"><div><h3>AI extraction debug</h3><p>Development diagnostics only; extraction does not make legal conclusions.</p></div></div><dl><dt>AI service invoked</dt><dd>{aiDebug.invoked ? 'Yes' : 'No'}</dd><dt>Provider / model</dt><dd>{aiDebug.provider || 'Unavailable'} / {aiDebug.model || '—'}</dd><dt>Extraction success</dt><dd>{aiDebug.success ? 'Yes' : 'No'}</dd><dt>Fallback used</dt><dd>{aiDebug.fallbackUsed ? 'Yes' : 'No'}</dd>{aiDebug.error && <><dt>Diagnostic</dt><dd>{aiDebug.error}</dd></>}</dl></section>
    <section className="panel"><div className="section-title"><div><h3>Extracted declarations</h3><p>OCR and visual extraction results; missing fields remain not detected.</p></div></div>{inspection.declarations.length ? <div className="data-table"><div className="row table-head"><span>Field</span><span>Value / OCR evidence</span><span>Confidence</span><span>State</span></div>{inspection.declarations.map(declaration => <div className="row" key={declaration.id}><span>{declaration.field_name.replaceAll('_', ' ')}</span><strong>{declaration.value || 'Not detected'}<small>{declaration.ocr_evidence || 'No OCR evidence'} · Source: {inspection.images.find(image => image.id === declaration.source_image_id)?.image_type || '—'} · {declaration.extraction_source || 'DETERMINISTIC'}</small></strong><span>{Math.round((declaration.confidence || 0) * 100)}%</span><span>{declaration.extraction_state || declaration.detection_state}</span></div>)}</div> : <EmptyState title="No declarations extracted" detail="Run preliminary analysis after acceptable evidence images are available." />}</section>
    <section className="panel"><div className="section-title"><div><h3>Automated findings</h3><p>{choosingFinding ? 'Choose one or more findings that support the administrator decision. Click a circle again to clear it.' : 'Confirm or reject each finding, then use the administrator decision below if needed.'}</p></div></div>{inspection.findings.length ? <div className="findings-table">{inspection.findings.map(finding => <div className={`finding-row ${selectedFindingIds.includes(finding.id) ? 'finding-row--selected' : ''}`} key={finding.id}><div className="finding-status"><StatusBadge status={finding.status} /></div><div className="finding-copy"><strong>{finding.message}</strong><small>{finding.rule_code} - {legalReference(finding)}</small></div><span className="finding-review">{finding.officer_decision || 'UNREVIEWED'}</span><div className="finding-actions">{(!finding.officer_decision || isAdmin) && <><button className="text-button" disabled={busy} onClick={() => review(finding.id, 'CONFIRMED')}>Confirm</button><button className="text-button text-button--danger" disabled={busy} onClick={() => review(finding.id, 'REJECTED')}>Reject</button></>}</div>{choosingFinding && selectableFinding(finding) ? <button type="button" className={`finding-radio ${selectedFindingIds.includes(finding.id) ? 'finding-radio--selected' : ''}`} aria-label={`${selectedFindingIds.includes(finding.id) ? 'Clear' : 'Select'} finding`} aria-pressed={selectedFindingIds.includes(finding.id)} disabled={busy} onClick={() => setSelectedFindingIds(current => current.includes(finding.id) ? current.filter(id => id !== finding.id) : [...current, finding.id])} /> : <span className="finding-selector-spacer" />}</div>)}</div> : <EmptyState title="No automated findings" detail="Run preliminary analysis after acceptable evidence images are available." />}</section>
    {isAdmin && <section className="panel admin-decision-panel"><div className="section-title"><div><h3>Administrator decision</h3><p>Choose an outcome, select any supporting findings above, then confirm.</p></div>{inspection.admin_decision && <StatusBadge status={inspection.admin_decision} />}</div><div className="decision-actions"><button className={`button button--secondary ${pendingDecision === 'VERIFIED' ? 'button--selected' : ''}`} disabled={busy || inspection.state !== 'OFFICER_REVIEW_COMPLETED'} title={verificationBlocked ? 'Automated findings remain; an explicit human override confirmation will be required.' : ''} onClick={() => startDecision('VERIFIED')}>Mark verified</button>{(verificationBlocked || inspection.state !== 'OFFICER_REVIEW_COMPLETED') && <p className="muted">{verificationBlocked ? 'Automated findings remain. An authorized Admin may verify after manually reviewing the evidence and confirming an override.' : 'Field Officer review must be completed before an administrative outcome can be recorded.'}</p>}<button className={`button button--secondary ${pendingDecision === 'POTENTIAL_NON_COMPLIANCE_CONFIRMED' ? 'button--selected' : ''}`} disabled={busy} onClick={() => startDecision('POTENTIAL_NON_COMPLIANCE_CONFIRMED')}>Confirm potential non-compliance</button><button className={`button button--danger ${pendingDecision === 'ESCALATED_FOR_ENFORCEMENT_REVIEW' ? 'button--selected' : ''}`} disabled={busy} onClick={() => startDecision('ESCALATED_FOR_ENFORCEMENT_REVIEW')}>Escalate for Enforcement Review</button>{pendingDecision && <><button className="button button--gold" disabled={busy || (choosingFinding && !selectedFindingIds.length)} onClick={confirmDecision}>Confirm</button><button className="button button--secondary" disabled={busy} onClick={cancelDecision}>Cancel</button></>}</div>{inspection.admin_decision && <div className="decision-audit"><span>Current decision</span><strong>{inspection.admin_decision.replaceAll('_', ' ')}</strong><small>{inspection.adminDecisionFindings?.length || 0} supporting finding(s){inspection.admin_decider_name ? ` - confirmed by ${inspection.admin_decider_name}` : ''}</small></div>}</section>}
  {overrideDialog && <ActionDialog open title="Verify Inspection?" description="Automated analysis contains unresolved or low-confidence findings. By continuing, you confirm that you have manually reviewed the submitted evidence and are making an authorized human decision." confirmLabel="Verify inspection" requiresNote noteLabel="Optional Admin Note" loading={busy} error={error} onCancel={() => setOverrideDialog(false)} onConfirm={(note) => { setOverrideDialog(false); confirmDecision(true, note); }}/>}
  {deleteDialog && <ActionDialog open title={`Delete ${inspection.inspection_number}?`} description="This permanently removes its evidence, declarations, findings, and reports." confirmLabel="Delete inspection" variant="danger" loading={busy} error={error} onCancel={() => setDeleteDialog(false)} onConfirm={confirmRemoval}/>}</>;
}
