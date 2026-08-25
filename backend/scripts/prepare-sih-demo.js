const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('../src/db/database');
const env = require('../src/config/env');
const authController = require('../src/controllers/auth.controller');
const inspectionController = require('../src/controllers/inspection.controller');
const dashboardController = require('../src/controllers/dashboard.controller');
const ocrService = require('../src/services/ocr.service');
const extractionService = require('../src/services/declaration-extraction.service');

const root = path.resolve(__dirname, '..');
const assetDir = path.join(root, 'demo-assets');
const metricsPath = path.join(root, 'data', 'sih-demo-metrics.json');
function responseCapture() { return { code: 200, body: null, status(code) { this.code = code; return this; }, json(value) { this.body = value; return value; } }; }
function xml(value) { return value.replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char]); }
function labelSvg(title, lines, { width = 1400, height = 1800, lowContrast = false } = {}) {
  const foreground = lowContrast ? '#aaa' : '#111'; const background = lowContrast ? '#bbb' : '#fff';
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${background}"/><rect x="35" y="35" width="${width - 70}" height="${height - 70}" rx="20" fill="none" stroke="${foreground}" stroke-width="5"/><text x="70" y="125" font-family="Arial, sans-serif" font-size="58" font-weight="bold" fill="${foreground}">${xml(title)}</text>${lines.map((line, index) => `<text x="70" y="${235 + index * 82}" font-family="Arial, sans-serif" font-size="42" fill="${foreground}">${xml(line)}</text>`).join('')}</svg>`);
}
async function createAssets() {
  await fs.promises.mkdir(assetDir, { recursive: true });
  const assets = {
    aFront: { name: 'demo-product-a-front.jpg', svg: labelSvg('DEMO PRODUCT A - FRONT', ['PRODUCT NAME: Demo Product A', 'PACKED BY: SIH Demo Foods Pvt Ltd', 'NET QUANTITY: 500 g']) },
    aBack: { name: 'demo-product-a-back.jpg', svg: labelSvg('DEMO PRODUCT A - BACK', ['MANUFACTURED BY: SIH Demo Foods Pvt Ltd', 'ADDRESS: 10 Innovation Road New Delhi 110001', 'MRP: Rs 120.00', 'MFG DATE: 08/2026', 'BEST BEFORE: 12 MONTHS FROM PACKING', 'CONSUMER CARE: +91 9876543210', 'EMAIL: care@demo.example', 'COUNTRY OF ORIGIN: India', 'UNIT SALE PRICE: Rs 0.24 per g']) },
    b: { name: 'demo-product-b-missing-mrp.jpg', svg: labelSvg('DEMO PRODUCT B - MISSING MRP', ['PRODUCT NAME: Demo Product B', 'MANUFACTURED BY: SIH Demo Foods Pvt Ltd', 'ADDRESS: 10 Innovation Road New Delhi 110001', 'NET QUANTITY: 250 g', 'MFG DATE: 08/2026', 'BEST BEFORE: 12 MONTHS FROM PACKING', 'CONSUMER CARE: +91 9876543210', 'EMAIL: care@demo.example', 'COUNTRY OF ORIGIN: India']) },
    c: { name: 'demo-product-c-poor.jpg', svg: labelSvg('DEMO C', ['blurred low resolution label'], { width: 260, height: 260, lowContrast: true }) },
    rotation: { name: 'rotation-orientation-test.jpg', svg: labelSvg('ROTATION TEST', ['PRODUCT NAME: Rotation Test', 'NET QUANTITY: 100 g'], { width: 1000, height: 1300 }) }
  };
  for (const asset of Object.values(assets)) {
    const target = path.join(assetDir, asset.name);
    if (asset === assets.c) await sharp(asset.svg).blur(6).jpeg({ quality: 45 }).toFile(target);
    else if (asset === assets.rotation) await sharp(asset.svg).rotate(-90).withMetadata({ orientation: 6 }).jpeg({ quality: 95 }).toFile(target);
    else await sharp(asset.svg).jpeg({ quality: 95 }).toFile(target);
    asset.path = target; asset.storagePath = path.relative(root, target).replace(/\\/g, '/');
  }
  return assets;
}
function removeDemoData() {
  const rows = db.prepare("SELECT i.id, i.product_id FROM inspections i WHERE i.notes LIKE '[SIH_DEMO:%'").all();
  for (const row of rows) { const reports = db.prepare('SELECT storage_path FROM reports WHERE inspection_id=?').all(row.id); for (const report of reports) if (report.storage_path) fs.rmSync(path.resolve(root, report.storage_path), { force: true }); db.prepare('DELETE FROM inspections WHERE id=?').run(row.id); db.prepare('DELETE FROM products WHERE id=?').run(row.product_id); }
}
function addImage(inspectionId, officer, asset, imageType) {
  const stat = fs.statSync(asset.path); const res = responseCapture();
  inspectionController.addImages({ params: { id: inspectionId }, user: officer, body: { imageType }, files: [{ path: asset.path, originalname: asset.name, mimetype: 'image/jpeg', size: stat.size }] }, res); return res.body.inspection;
}
async function analyze(inspectionId, officer) { const res = responseCapture(); const started = performance.now(); await inspectionController.analyzeInspection({ params: { id: inspectionId }, user: officer }, res); return { response: res.body, processingMs: Math.round(performance.now() - started) }; }
function summarize(name, analysis) {
  const declarations = analysis.response.analysis.extraction.declarations; const findings = analysis.response.analysis.assessment.findings; const detected = declarations.filter(item => item.value).length; const review = findings.filter(item => item.status === 'REVIEW_REQUIRED').length;
  return { product: name, processingMs: analysis.processingMs, fieldsDetected: detected, fieldsTotal: declarations.length, extractionSuccessPercent: Number((detected * 100 / declarations.length).toFixed(1)), findingCounts: findings.reduce((counts, finding) => ({ ...counts, [finding.status]: (counts[finding.status] || 0) + 1 }), {}), reviewFindingCount: review, totalFindingCount: findings.length, reviewRatePercent: Number((review * 100 / findings.length).toFixed(1)), ocr: analysis.response.analysis.ocr.images.map(image => ({ state: image.state, confidencePercent: Math.round(image.confidence * 100), quality: image.quality, reason: image.reason })) };
}
async function main() {
  const reset = process.argv.includes('--reset'); if (reset) removeDemoData();
  const assets = await createAssets();
  const login = responseCapture(); authController.login({ body: { email: 'officer@legalmetrix.local', password: 'Officer@123' } }, login); const officer = { sub: login.body.user.id, role: login.body.user.role, email: login.body.user.email };
  const existing = db.prepare("SELECT id FROM inspections WHERE notes='[SIH_DEMO:GOLDEN_FALLBACK]' LIMIT 1").get();
  if (existing) { console.log(`SIH demo fallback already exists (${existing.id}). Use --reset to rebuild and remeasure.`); if (fs.existsSync(metricsPath)) console.log(fs.readFileSync(metricsPath, 'utf8')); return; }
  const originalAiKey = env.aiExtractionApiKey; env.aiExtractionApiKey = '';
  const create = (productName, notes) => { const res = responseCapture(); inspectionController.createInspection({ user: officer, body: { productName, genericName: 'Controlled SIH demonstration package', brandName: 'LegalMetrix Demo', location: 'SIH Live Demonstration', notes } }, res); return res.body.inspection; };
  try {
    const a = create('Demo Product A', '[SIH_DEMO:GOLDEN_FALLBACK]'); addImage(a.id, officer, assets.aFront, 'FRONT'); addImage(a.id, officer, assets.aBack, 'BACK'); const resultA = await analyze(a.id, officer);
    for (const finding of resultA.response.inspection.findings) { const review = responseCapture(); inspectionController.reviewFinding({ params: { id: finding.id }, user: officer, body: { officerDecision: 'CONFIRMED', officerComment: 'Verified against controlled SIH golden-demo evidence.' } }, review); }
    const reportRes = responseCapture(); await inspectionController.requestReport({ params: { id: a.id }, user: officer }, reportRes); const reportFile = path.resolve(root, reportRes.body.report.storage_path); const reportBytes = fs.statSync(reportFile).size;
    const b = create('Demo Product B', '[SIH_DEMO:MISSING_MRP]'); addImage(b.id, officer, assets.b, 'FRONT'); const resultB = await analyze(b.id, officer);
    const c = create('Demo Product C', '[SIH_DEMO:POOR_IMAGE]'); addImage(c.id, officer, assets.c, 'FRONT'); const resultC = await analyze(c.id, officer);
    const rotationOcr = await ocrService.readImages([{ id: 'rotation-test', storage_path: assets.rotation.storagePath, image_type: 'FRONT' }]); const rotationExtraction = await extractionService.extractDeclarations(rotationOcr);
    const list = responseCapture(); inspectionController.listInspections({ user: { sub: 'admin-check', role: 'ADMIN' }, query: { search: 'Demo Product A' } }, list); const dashboard = responseCapture(); dashboardController.getStats({ user: { sub: 'admin-check', role: 'ADMIN' } }, dashboard);
    const metrics = { measuredAt: new Date().toISOString(), aiUnavailableFallbackTested: [resultA, resultB, resultC].every(result => result.response.analysis.aiExtraction.fallbackUsed), clearImage: summarize('Demo Product A', resultA), missingField: summarize('Demo Product B', resultB), poorImage: summarize('Demo Product C', resultC), rotation: { ocrState: rotationOcr.images[0].state, confidencePercent: Math.round(rotationOcr.images[0].confidence * 100), productNameDetected: rotationExtraction.declarations.some(item => item.field === 'product_name' && item.value) }, multipleImages: { tested: resultA.response.analysis.ocr.images.length > 1, imageCount: resultA.response.analysis.ocr.images.length }, report: { status: reportRes.body.report.status, pageCount: reportRes.body.generation.pageCount, bytes: reportBytes }, mobileToDashboardVisibility: { visible: list.body.inspections.some(item => item.id === a.id), dashboardTotalInspections: dashboard.body.totalInspections }, fallbackInspectionId: a.id };
    await fs.promises.mkdir(path.dirname(metricsPath), { recursive: true }); await fs.promises.writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`); console.log(JSON.stringify(metrics, null, 2));
  } finally { env.aiExtractionApiKey = originalAiKey; }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { main };
