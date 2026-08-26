const fs = require('fs');
const path = require('path');
const db = require('../src/db/database');

const rootDir = path.resolve(__dirname, '../..');
const level = confidence => confidence >= .85 ? 'HIGH_CONFIDENCE' : confidence >= .65 ? 'MEDIUM_CONFIDENCE' : confidence > 0 ? 'LOW_CONFIDENCE' : 'NOT_DETECTED';
const percent = value => Number(((value || 0) * 100).toFixed(1));
const countBy = (rows, key) => rows.reduce((result, row) => ({ ...result, [row[key] || 'UNKNOWN']: (result[row[key] || 'UNKNOWN'] || 0) + 1 }), {});

const inspectionRows = db.prepare(`SELECT i.*, p.product_name, p.generic_name, p.brand_name
  FROM inspections i JOIN products p ON p.id = i.product_id ORDER BY i.created_at`).all();
const allImages = db.prepare('SELECT id, inspection_id, image_type, ocr_confidence, ocr_status, quality_state FROM inspection_images').all();
const allDeclarations = db.prepare('SELECT * FROM declarations').all();
const allFindings = db.prepare(`SELECT f.*, r.rule_code FROM findings f LEFT JOIN rules r ON r.id = f.rule_id`).all();
const allReports = db.prepare('SELECT id, inspection_id, report_number, status, generated_at, created_at FROM reports').all();

const inspections = inspectionRows.map(inspection => {
  const images = allImages.filter(image => image.inspection_id === inspection.id);
  const declarations = allDeclarations.filter(item => item.inspection_id === inspection.id);
  const findings = allFindings.filter(item => item.inspection_id === inspection.id);
  const reports = allReports.filter(item => item.inspection_id === inspection.id);
  const detected = declarations.filter(item => item.value);
  const ocrValues = images.map(item => item.ocr_confidence).filter(value => typeof value === 'number');
  const declarationConfidence = detected.map(item => item.confidence || 0);
  return {
    inspectionNumber: inspection.inspection_number,
    product: { name: inspection.product_name, category: inspection.generic_name, brand: inspection.brand_name },
    inspectionStatus: inspection.state,
    createdAt: inspection.created_at,
    imageSummary: { count: images.length, ocrStatusCounts: countBy(images, 'ocr_status'), qualityStateCounts: countBy(images, 'quality_state'), meanOcrConfidencePercent: ocrValues.length ? percent(ocrValues.reduce((sum, value) => sum + value, 0) / ocrValues.length) : null, minimumOcrConfidencePercent: ocrValues.length ? percent(Math.min(...ocrValues)) : null },
    outputMetrics: { declarationSlots: declarations.length, detectedDeclarations: detected.length, fieldCoveragePercent: declarations.length ? Number((detected.length * 100 / declarations.length).toFixed(1)) : 0, meanDetectedOutputConfidencePercent: declarationConfidence.length ? percent(declarationConfidence.reduce((sum, value) => sum + value, 0) / declarationConfidence.length) : null, outputConfidenceLevel: declarationConfidence.length ? level(declarationConfidence.reduce((sum, value) => sum + value, 0) / declarationConfidence.length) : 'NOT_DETECTED', findingStatusCounts: countBy(findings, 'status') },
    declarations: declarations.map(item => ({ field: item.field_name, value: item.value, outputConfidencePercent: percent(item.confidence), outputConfidenceLevel: level(item.confidence || 0), extractionState: item.extraction_state, extractionSource: item.extraction_source, sourceImageSide: images.find(image => image.id === item.source_image_id)?.image_type || null, visualEvidenceDescription: item.visual_evidence_description || null })),
    findings: findings.map(item => ({ ruleCode: item.rule_code, status: item.status, outputConfidencePercent: percent(item.confidence), outputConfidenceLevel: level(item.confidence || 0), officerDecision: item.officer_decision || null, reviewedAt: item.reviewed_at || null })),
    reports: reports.map(item => ({ reportNumber: item.report_number, status: item.status, generatedAt: item.generated_at || null, createdAt: item.created_at }))
  };
});

const detectedAll = allDeclarations.filter(item => item.value);
const ocrAll = allImages.map(item => item.ocr_confidence).filter(value => typeof value === 'number');
const dataset = {
  datasetName: 'LegalMetrix Project Inspection Dataset',
  generatedAt: new Date().toISOString(),
  source: 'Current SQLite database records only',
  accuracyMethodology: { groundTruthAccuracyAvailable: false, groundTruthAccuracyPercent: null, reason: 'The database contains extraction confidence and officer decisions, but no field-by-field verified ground-truth labels. Confidence is not equivalent to accuracy.', confidenceLevels: { HIGH_CONFIDENCE: '85% or higher', MEDIUM_CONFIDENCE: '65% to 84.9%', LOW_CONFIDENCE: '0.1% to 64.9%', NOT_DETECTED: '0%' } },
  measuredProjectMetrics: { inspections: inspectionRows.length, reports: allReports.length, images: allImages.length, declarations: allDeclarations.length, findings: allFindings.length, detectedDeclarations: detectedAll.length, declarationFieldCoveragePercent: allDeclarations.length ? Number((detectedAll.length * 100 / allDeclarations.length).toFixed(1)) : 0, meanDetectedOutputConfidencePercent: detectedAll.length ? percent(detectedAll.reduce((sum, item) => sum + (item.confidence || 0), 0) / detectedAll.length) : null, meanImageOcrConfidencePercent: ocrAll.length ? percent(ocrAll.reduce((sum, value) => sum + value, 0) / ocrAll.length) : null, extractionSourceCounts: countBy(allDeclarations, 'extraction_source'), findingStatusCounts: countBy(allFindings, 'status'), reportStatusCounts: countBy(allReports, 'status') },
  inspections
};
const outputPath = path.join(rootDir, 'exports', 'legalmetrix-project-dataset.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(dataset, null, 2)}\n`);
console.log(JSON.stringify({ outputPath: path.relative(rootDir, outputPath), metrics: dataset.measuredProjectMetrics }, null, 2));
