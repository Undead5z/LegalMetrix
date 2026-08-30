const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const db = require('../db/database');
const { AppError } = require('../utils/http');
const ocrService = require('../services/ocr.service');
const extractionService = require('../services/declaration-extraction.service');
const visionExtractionService = require('../services/vision-extraction.service');
const evidenceMerger = require('../services/evidence-merger.service');
const ruleEngine = require('../services/rule-engine.service');
const pdfReportService = require('../services/pdf-report.service');
const { logAuditEvent } = require('../services/audit-log.service');

const createSchema = z.object({
  productName: z.string().trim().min(1).max(200),
  genericName: z.string().trim().max(200).optional().nullable(),
  brandName: z.string().trim().max(200).optional().nullable(),
  location: z.string().trim().max(300).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable()
});
const reviewSchema = z.object({ officerDecision: z.enum(['CONFIRMED', 'REJECTED']), officerComment: z.string().trim().max(2000).optional().nullable() });
const adminDecisionSchema = z.object({
  decision: z.enum(['VERIFIED', 'POTENTIAL_NON_COMPLIANCE_CONFIRMED', 'ESCALATED_FOR_ENFORCEMENT_REVIEW']),
  findingIds: z.array(z.string().uuid()).max(20).optional().default([]),
  comment: z.string().trim().max(2000).optional().nullable()
}).superRefine((data, context) => {
  if (data.decision !== 'VERIFIED' && !data.findingIds.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['findingIds'], message: 'Select at least one automated finding that supports this decision.' });
});

const inspectionQuery = `SELECT i.*, p.product_name, p.generic_name, p.brand_name,
  u.full_name AS officer_name, u.email AS officer_email, admin.full_name AS admin_decider_name,
  selected_finding.status AS admin_decision_finding_status, selected_finding.message AS admin_decision_finding_message, selected_rule.rule_code AS admin_decision_rule_code,
  (SELECT COUNT(*) FROM findings f WHERE f.inspection_id = i.id) AS findings_count,
  (SELECT COUNT(*) FROM findings f WHERE f.inspection_id = i.id AND f.status = 'POTENTIAL_NON_COMPLIANCE') AS potential_issues_count,
  (SELECT group_concat(COALESCE(r.name, f.message), ' · ') FROM findings f LEFT JOIN rules r ON r.id = f.rule_id WHERE f.inspection_id = i.id AND f.status = 'POTENTIAL_NON_COMPLIANCE') AS potential_issue_summary,
  (SELECT id FROM inspection_images img WHERE img.inspection_id = i.id AND img.image_type = 'FRONT' ORDER BY img.created_at LIMIT 1) AS front_image_id
  FROM inspections i JOIN products p ON p.id = i.product_id JOIN users u ON u.id = i.officer_id
  LEFT JOIN users admin ON admin.id = i.admin_decided_by
  LEFT JOIN findings selected_finding ON selected_finding.id = i.admin_decision_finding_id
  LEFT JOIN rules selected_rule ON selected_rule.id = selected_finding.rule_id`;

function isAdmin(user) { return ['MASTER_ADMIN', 'ADMIN'].includes(user.role); }
function fetchInspection(id) { return db.prepare(`${inspectionQuery} WHERE i.id = ?`).get(id); }
function assertOfficerOwner(inspection, user) { assertAccess(inspection, user); if (user.role !== 'FIELD_OFFICER' || inspection.officer_id !== user.sub) throw new AppError(403, 'Only the assigned Field Officer can perform this workflow action.'); }
function assertAccess(inspection, user) {
  if (!inspection) throw new AppError(404, 'Inspection was not found.');
  if (!isAdmin(user) && inspection.officer_id !== user.sub) throw new AppError(403, 'You cannot access this inspection.');
}
function removeStoredFiles(paths) { const uploadsRoot = path.resolve(__dirname, '../../uploads'); for (const storedPath of paths.filter(Boolean)) { const absolute = path.resolve(__dirname, '../..', storedPath); if (absolute.startsWith(`${uploadsRoot}${path.sep}`)) fs.rmSync(absolute, { force: true }); } }
function decisionFindingIds(inspection) {
  try {
    const ids = JSON.parse(inspection.admin_decision_finding_ids_json || '[]');
    if (Array.isArray(ids) && ids.length) return ids;
  } catch { /* Legacy or malformed data falls back to the original single selection. */ }
  return inspection.admin_decision_finding_id ? [inspection.admin_decision_finding_id] : [];
}
function inspectionResponse(inspection) {
  const images = db.prepare('SELECT * FROM inspection_images WHERE inspection_id = ? ORDER BY created_at').all(inspection.id);
  const declarations = db.prepare('SELECT * FROM declarations WHERE inspection_id = ? ORDER BY created_at').all(inspection.id);
  const findings = db.prepare(`SELECT f.*, r.rule_code, r.legal_reference FROM findings f LEFT JOIN rules r ON r.id = f.rule_id WHERE f.inspection_id = ? ORDER BY f.created_at`).all(inspection.id);
  const reports = db.prepare('SELECT * FROM reports WHERE inspection_id = ? ORDER BY created_at DESC').all(inspection.id);
  const ids = decisionFindingIds(inspection);
  const byId = new Map(findings.map(finding => [finding.id, finding]));
  const adminDecisionFindings = ids.map(id => byId.get(id)).filter(Boolean);
  return { ...inspection, images, declarations, findings, reports, adminDecisionFindings };
}

function createInspection(req, res) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Inspection product details are invalid.', parsed.error.flatten());
  const data = parsed.data;
  const productId = crypto.randomUUID();
  const inspectionId = crypto.randomUUID();
  const inspectionNumber = `LM-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO products (id, product_name, generic_name, brand_name) VALUES (?, ?, ?, ?)')
      .run(productId, data.productName, data.genericName || null, data.brandName || null);
    db.prepare('INSERT INTO inspections (id, inspection_number, product_id, officer_id, location, notes) VALUES (?, ?, ?, ?, ?, ?)')
      .run(inspectionId, inspectionNumber, productId, req.user.sub, data.location || null, data.notes || null);
  });
  transaction();
  logAuditEvent({ actorUserId: req.user.sub, inspectionId, action: 'INSPECTION_CREATED', metadata: { inspectionNumber } });
  res.status(201).json({ inspection: inspectionResponse(fetchInspection(inspectionId)) });
}

function listInspections(req, res) {
  const state = req.query.state; const issue = req.query.issue; const search = req.query.search?.trim(); const from = req.query.from; const to = req.query.to;
  const clauses = [];
  const values = [];
  if (!isAdmin(req.user)) { clauses.push('i.officer_id = ?'); values.push(req.user.sub); }
  if (state === 'PENDING_REVIEW') clauses.push("i.state = 'PENDING_REVIEW' AND i.admin_decision IS NULL");
  else if (state) { clauses.push('i.state = ?'); values.push(state); }
  if (issue === 'potential') clauses.push("(i.admin_decision IN ('POTENTIAL_NON_COMPLIANCE_CONFIRMED', 'ESCALATED_FOR_ENFORCEMENT_REVIEW') OR EXISTS (SELECT 1 FROM findings issue_finding WHERE issue_finding.inspection_id = i.id AND issue_finding.status = 'POTENTIAL_NON_COMPLIANCE'))");
  if (search) { clauses.push('(p.product_name LIKE ? OR i.inspection_number LIKE ? OR u.full_name LIKE ?)'); values.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (from) { clauses.push('date(i.created_at) >= date(?)'); values.push(from); }
  if (to) { clauses.push('date(i.created_at) <= date(?)'); values.push(to); }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const inspections = db.prepare(`${inspectionQuery}${where} ORDER BY i.created_at DESC`).all(...values);
  res.json({ inspections });
}

function getInspection(req, res) {
  const inspection = fetchInspection(req.params.id);
  assertAccess(inspection, req.user);
  res.json({ inspection: inspectionResponse(inspection) });
}
function deleteInspection(req, res) {
  const inspection = fetchInspection(req.params.id); assertAccess(inspection, req.user);
  const imageFiles = db.prepare('SELECT storage_path, ocr_storage_path FROM inspection_images WHERE inspection_id = ?').all(inspection.id).flatMap(image => [image.storage_path, image.ocr_storage_path]);
  const reportFiles = db.prepare('SELECT storage_path FROM reports WHERE inspection_id = ?').all(inspection.id).map(report => report.storage_path);
  db.transaction(() => { db.prepare('DELETE FROM inspections WHERE id = ?').run(inspection.id); const references = db.prepare('SELECT COUNT(*) count FROM inspections WHERE product_id = ?').get(inspection.product_id).count; if (!references) db.prepare('DELETE FROM products WHERE id = ?').run(inspection.product_id); })();
  removeStoredFiles([...imageFiles, ...reportFiles]);
  res.json({ deleted: true, inspectionId: inspection.id });
}

function addImages(req, res) {
  const inspection = fetchInspection(req.params.id);
  assertAccess(inspection, req.user);
  if (!req.files?.length) throw new AppError(400, 'Select at least one image to upload.');
  const imageType = ['FRONT', 'BACK', 'ADDITIONAL'].includes(req.body.imageType) ? req.body.imageType : 'ADDITIONAL';
  const limits = { FRONT: 1, BACK: 1, ADDITIONAL: 2 };
  const discardUploads = () => req.files.forEach(file => fs.rmSync(file.path, { force: true }));
  const existing = db.prepare('SELECT image_type, original_filename, size_bytes FROM inspection_images WHERE inspection_id = ?').all(inspection.id);
  const existingForType = existing.filter(image => image.image_type === imageType).length;
  if (existingForType + req.files.length > limits[imageType]) { discardUploads(); throw new AppError(400, `${imageType} evidence is limited to ${limits[imageType]} image${limits[imageType] === 1 ? '' : 's'}.`); }
  const duplicate = req.files.find(file => existing.some(image => image.original_filename === file.originalname && image.size_bytes === file.size));
  if (duplicate) { discardUploads(); throw new AppError(409, 'This evidence image has already been uploaded for this inspection.'); }
  const insert = db.prepare(`INSERT INTO inspection_images (id, inspection_id, image_type, original_filename, storage_path, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  const transaction = db.transaction(() => req.files.forEach((file) => insert.run(
    crypto.randomUUID(), inspection.id, imageType, file.originalname, path.relative(path.resolve(__dirname, '../..'), file.path).replace(/\\/g, '/'), file.mimetype, file.size
  )));
  transaction();
  db.prepare("UPDATE inspections SET state = 'DRAFT', vision_cache_key = NULL, vision_extraction_json = NULL, vision_diagnostics_json = NULL, vision_completed_at = NULL, admin_decision = NULL, admin_decision_comment = NULL, admin_decision_finding_id = NULL, admin_decision_finding_ids_json = NULL, admin_decided_by = NULL, admin_decided_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(inspection.id);
  db.prepare('DELETE FROM findings WHERE inspection_id = ?').run(inspection.id); db.prepare('DELETE FROM declarations WHERE inspection_id = ?').run(inspection.id);
  logAuditEvent({ actorUserId: req.user.sub, inspectionId: inspection.id, action: 'EVIDENCE_UPLOADED', metadata: { imageType, count: req.files.length } });
  res.status(201).json({ inspection: inspectionResponse(fetchInspection(inspection.id)) });
}

async function analyzeInspection(req, res) {
  const inspection = fetchInspection(req.params.id);
  assertAccess(inspection, req.user);
  const images = db.prepare('SELECT * FROM inspection_images WHERE inspection_id = ?').all(inspection.id);
  if (!images.length) throw new AppError(400, 'Upload package-label images before requesting analysis.');
  const recoveryState = inspection.state === 'PROCESSING' ? 'DRAFT' : inspection.state;
  try {
  db.prepare("UPDATE inspections SET state = 'PROCESSING', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(inspection.id);
  logAuditEvent({ actorUserId: req.user.sub, inspectionId: inspection.id, action: 'ANALYSIS_STARTED' });
  const ocr = await ocrService.readImages(images);
  const deterministicExtraction = await extractionService.extractDeclarations(ocr);
  const visionImages = images.map(image => ({ ...image, ocr_hint: ocr.images.find(result => result.imageId === image.id)?.normalizedText || '' }));
  const visionExtraction = await visionExtractionService.extractVisually({ inspectionId: inspection.id, images: visionImages });
  const extraction = { ...deterministicExtraction, declarations: evidenceMerger.mergeEvidence(deterministicExtraction.declarations, visionExtraction.candidates, images) };
  const save = db.transaction(() => {
    // New analysis replaces prior findings, so any administrator decision based on them is cleared.
    db.prepare('UPDATE inspections SET admin_decision = NULL, admin_decision_comment = NULL, admin_decision_finding_id = NULL, admin_decision_finding_ids_json = NULL, admin_decided_by = NULL, admin_decided_at = NULL WHERE id = ?').run(inspection.id);
    db.prepare('DELETE FROM findings WHERE inspection_id = ?').run(inspection.id);
    db.prepare('DELETE FROM declarations WHERE inspection_id = ?').run(inspection.id);
    const updateImage = db.prepare('UPDATE inspection_images SET quality_state = ?, quality_reason = ?, ocr_text = ?, normalized_ocr_text = ?, ocr_confidence = ?, ocr_status = ?, ocr_error = ?, ocr_storage_path = ?, preprocessing_json = ? WHERE id = ?');
    for (const result of ocr.images) updateImage.run(result.state === 'COMPLETED' ? 'ACCEPTABLE' : 'REVIEW_REQUIRED', result.reason, result.text, result.normalizedText, result.confidence, result.state, result.state === 'COMPLETED' ? null : result.reason, result.ocrStoragePath, JSON.stringify(result.quality), result.imageId);
    const insert = db.prepare('INSERT INTO declarations (id, inspection_id, field_name, value, detection_state, confidence, source_image_id, bounding_box_json, extraction_method, extraction_state, ocr_evidence, extraction_source, visual_evidence_description, ocr_candidate_json, vision_candidate_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const declaration of extraction.declarations) insert.run(crypto.randomUUID(), inspection.id, declaration.field, declaration.value, declaration.value ? 'DETECTED' : 'NOT_DETECTED', declaration.confidence, declaration.sourceImageId, declaration.boundingBox ? JSON.stringify(declaration.boundingBox) : null, ['OCR_DETECTED', 'NOT_DETECTED'].includes(declaration.extractionSource) ? 'OCR_DETERMINISTIC' : 'OCR_VISION_HYBRID', declaration.extractionState, declaration.ocrEvidence, declaration.extractionSource, declaration.visualEvidenceDescription, declaration.ocrCandidate ? JSON.stringify(declaration.ocrCandidate) : null, declaration.visionCandidate ? JSON.stringify(declaration.visionCandidate) : null);
    db.prepare('UPDATE inspections SET ai_extraction_json = ?, ai_diagnostics_json = ?, vision_extraction_json = ?, vision_diagnostics_json = ? WHERE id = ?').run(JSON.stringify(visionExtraction.candidates), JSON.stringify(visionExtraction.diagnostics), JSON.stringify(visionExtraction.candidates), JSON.stringify(visionExtraction.diagnostics), inspection.id);
  });
  save();
  const savedDeclarations = db.prepare('SELECT * FROM declarations WHERE inspection_id = ?').all(inspection.id).map(item => ({ ...item, field: item.field_name, sourceImageId: item.source_image_id }));
  const completedOcr = ocr.images.filter(item => item.state === 'COMPLETED');
  const assessment = await ruleEngine.assessDeclarations({ inspectionId: inspection.id, declarations: savedDeclarations, ocrConfidence: completedOcr.length ? Math.min(...completedOcr.map(item => item.confidence || 0)) : 0 });
  const saveFindings = db.transaction(() => {
    db.prepare('DELETE FROM findings WHERE inspection_id = ?').run(inspection.id);
    const insert = db.prepare('INSERT INTO findings (id, inspection_id, rule_id, declaration_id, status, message, evidence_json, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    assessment.findings.forEach(finding => insert.run(crypto.randomUUID(), inspection.id, finding.ruleId, finding.evidence[0]?.declarationId || null, finding.status, finding.explanation, JSON.stringify({ field: finding.field, observedValue: finding.observedValue, evidence: finding.evidence, legalReference: finding.legalReference, ruleVersion: finding.ruleVersion }), finding.confidence));
  });
  saveFindings();
  db.prepare("UPDATE inspections SET state = 'PENDING_REVIEW', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(inspection.id);
  logAuditEvent({ actorUserId: req.user.sub, inspectionId: inspection.id, action: 'ANALYSIS_COMPLETED', metadata: { ocrState: ocr.state, visionFallback: Boolean(visionExtraction.diagnostics?.fallbackUsed) } });
  res.status(202).json({ inspection: inspectionResponse(fetchInspection(inspection.id)), analysis: { state: ocr.state, message: 'Preliminary analysis completed and stored.', ocr, ocrOnlyExtraction: deterministicExtraction, extraction, aiExtraction: visionExtraction.diagnostics, visionExtraction: visionExtraction.diagnostics, assessment } });
  } catch (error) {
    db.prepare('UPDATE inspections SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(recoveryState, inspection.id);
    throw error;
  }
}

function getImageFile(req, res) {
  const inspection = fetchInspection(req.params.id); assertAccess(inspection, req.user);
  const image = db.prepare('SELECT * FROM inspection_images WHERE id = ? AND inspection_id = ?').get(req.params.imageId, inspection.id);
  if (!image) throw new AppError(404, 'Inspection image was not found.');
  res.type(image.mime_type).sendFile(path.resolve(__dirname, '../..', image.storage_path));
}

function reviewFinding(req, res) {
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Review details are invalid.', parsed.error.flatten());
  const finding = db.prepare('SELECT * FROM findings WHERE id = ?').get(req.params.id);
  if (!finding) throw new AppError(404, 'Finding was not found.');
  const inspection = fetchInspection(finding.inspection_id);
  assertOfficerOwner(inspection, req.user);
  if (inspection.state !== 'PENDING_REVIEW') throw new AppError(409, 'Findings can only be reviewed while the inspection is pending Field Officer review.');
  db.prepare(`UPDATE findings SET officer_decision = ?, officer_comment = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(parsed.data.officerDecision, parsed.data.officerComment || null, req.user.sub, finding.id);
  const unreviewed = db.prepare('SELECT COUNT(*) AS count FROM findings WHERE inspection_id = ? AND officer_decision IS NULL').get(finding.inspection_id).count;
  if (!unreviewed) { db.prepare("UPDATE inspections SET state = 'OFFICER_REVIEW_COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(finding.inspection_id); logAuditEvent({ actorUserId: req.user.sub, inspectionId: finding.inspection_id, action: 'OFFICER_REVIEW_COMPLETED' }); }
  logAuditEvent({ actorUserId: req.user.sub, inspectionId: finding.inspection_id, findingId: finding.id, action: `FINDING_${parsed.data.officerDecision}` });
  res.json({ finding: db.prepare('SELECT * FROM findings WHERE id = ?').get(finding.id) });
}

async function setAdminDecision(req, res) {
  const parsed = adminDecisionSchema.safeParse(req.body);
  if (!parsed.success) throw new AppError(400, 'Administrator decision is invalid.', parsed.error.flatten());
  const inspection = fetchInspection(req.params.id);
  assertAccess(inspection, req.user);
  if (!isAdmin(req.user)) throw new AppError(403, 'Only an authorized Administrator can record a final administrative outcome.');
  if (!['OFFICER_REVIEW_COMPLETED', 'ADMIN_REVIEW_PENDING'].includes(inspection.state)) throw new AppError(409, 'Complete Field Officer review before recording an administrative outcome.');
  const { decision } = parsed.data;
  const findingIds = [...new Set(parsed.data.findingIds || [])];
  if (decision !== 'VERIFIED') {
    const placeholders = findingIds.map(() => '?').join(', ');
    const selectedFindings = db.prepare(`SELECT id FROM findings WHERE inspection_id = ? AND status IN ('POTENTIAL_NON_COMPLIANCE', 'REVIEW_REQUIRED') AND id IN (${placeholders})`).all(inspection.id, ...findingIds);
    if (selectedFindings.length !== findingIds.length) throw new AppError(400, 'Select only potential non-compliance or review-required findings from this inspection.');
  }
  const unresolved = db.prepare("SELECT COUNT(*) AS count FROM findings WHERE inspection_id = ? AND (officer_decision IS NULL OR (status IN ('POTENTIAL_NON_COMPLIANCE','REVIEW_REQUIRED') AND officer_decision <> 'REJECTED'))").get(inspection.id).count;
  const conflicts = db.prepare("SELECT COUNT(*) AS count FROM declarations WHERE inspection_id = ? AND extraction_state = 'NEEDS_REVIEW'").get(inspection.id).count;
  // Automated findings remain intact as decision-support evidence. An authorized Admin may manually verify after visually reviewing the submitted evidence.
  const manualOverride = decision === 'VERIFIED' && (unresolved > 0 || conflicts > 0);
  const state = decision;
  db.prepare(`UPDATE inspections SET admin_decision = ?, admin_decision_comment = ?, admin_decision_finding_id = ?, admin_decision_finding_ids_json = ?, admin_decided_by = ?, admin_decided_at = CURRENT_TIMESTAMP, state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(decision, parsed.data.comment || null, findingIds[0] || null, findingIds.length ? JSON.stringify(findingIds) : null, req.user.sub, state, inspection.id);
  logAuditEvent({ actorUserId: req.user.sub, inspectionId: inspection.id, action: 'ADMIN_DECISION_RECORDED', metadata: { finalDecision: decision, findingIds, automatedFindingsRemaining: unresolved, extractionConflictsRemaining: conflicts, manualOverride } });
  const reports = db.prepare("SELECT report_number FROM reports WHERE inspection_id = ? AND status = 'GENERATED'").all(inspection.id);
  for (const report of reports) await pdfReportService.generateReport({ inspectionId: inspection.id, reportNumber: report.report_number });
  res.json({ inspection: inspectionResponse(fetchInspection(inspection.id)), reportsRefreshed: reports.length });
}

async function requestReport(req, res) {
  const inspection = fetchInspection(req.params.id);
  assertAccess(inspection, req.user);
  const reportId = crypto.randomUUID();
  const reportNumber = `LMR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  db.prepare('INSERT INTO reports (id, inspection_id, report_number, status, generated_by) VALUES (?, ?, ?, ?, ?)')
    .run(reportId, inspection.id, reportNumber, 'NOT_IMPLEMENTED', req.user.sub);
  try {
    const generation = await pdfReportService.generateReport({ inspectionId: inspection.id, reportNumber });
    db.prepare("UPDATE reports SET status = 'GENERATED', storage_path = ?, generated_at = CURRENT_TIMESTAMP WHERE id = ?").run(generation.storagePath, reportId);
    logAuditEvent({ actorUserId: req.user.sub, inspectionId: inspection.id, reportId, action: 'REPORT_GENERATED', metadata: { reportNumber } });
    res.status(201).json({ report: db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId), generation });
  } catch (error) {
    db.prepare("UPDATE reports SET status = 'FAILED' WHERE id = ?").run(reportId);
    throw new AppError(500, `Inspection report could not be generated: ${error.message}`);
  }
}

function listReports(req, res) {
  const clause = isAdmin(req.user) ? " WHERE r.status = 'GENERATED'" : " WHERE i.officer_id = ? AND r.status = 'GENERATED'";
  const reports = db.prepare(`SELECT r.*, i.inspection_number, p.product_name FROM reports r JOIN inspections i ON i.id = r.inspection_id JOIN products p ON p.id = i.product_id${clause} ORDER BY r.created_at DESC`)
    .all(...(isAdmin(req.user) ? [] : [req.user.sub]));
  res.json({ reports });
}
function deleteReport(req, res) {
  const report = db.prepare('SELECT r.*, i.officer_id FROM reports r JOIN inspections i ON i.id = r.inspection_id WHERE r.id = ?').get(req.params.id);
  if (!report) throw new AppError(404, 'Report was not found.');
  if (!isAdmin(req.user) && report.officer_id !== req.user.sub) throw new AppError(403, 'You cannot delete this report.');
  db.prepare('DELETE FROM reports WHERE id = ?').run(report.id); removeStoredFiles([report.storage_path]);
  res.json({ deleted: true, reportId: report.id });
}
function getReportFile(req, res) {
  const report = db.prepare('SELECT r.*, i.officer_id FROM reports r JOIN inspections i ON i.id = r.inspection_id WHERE r.id = ? AND r.status = ?').get(req.params.id, 'GENERATED');
  if (!report) throw new AppError(404, 'Generated report was not found.');
  if (!isAdmin(req.user) && report.officer_id !== req.user.sub) throw new AppError(403, 'You cannot access this report.');
  if (!report.storage_path) throw new AppError(404, 'Generated report file is unavailable.');
  const filePath = path.resolve(__dirname, '../..', report.storage_path);
  if (req.query.download === '1') { logAuditEvent({ actorUserId: req.user.sub, inspectionId: report.inspection_id, reportId: report.id, action: 'REPORT_DOWNLOADED', metadata: { reportNumber: report.report_number } }); return res.download(filePath, `${report.report_number}.pdf`); }
  res.type('application/pdf'); res.set('Content-Disposition', `inline; filename="${report.report_number}.pdf"`); return res.sendFile(filePath);
}

module.exports = { createInspection, listInspections, getInspection, deleteInspection, addImages, getImageFile, analyzeInspection, reviewFinding, setAdminDecision, requestReport, listReports, deleteReport, getReportFile };
