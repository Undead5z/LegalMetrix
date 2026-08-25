const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const db = require('../db/database');

const rootDir = path.resolve(__dirname, '../..');
const disclaimer = 'LegalMetrix provides AI-assisted preliminary compliance assessment. Final determination and statutory action remain with the competent authorized authority.';
const ascii = value => String(value ?? '').replace(/₹/g, 'Rs. ').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, ' ');
const pdfEscape = value => ascii(value).replace(/([\\()])/g, '\\$1');
function wrap(value, width = 92) {
  const words = ascii(value || '-').split(/\s+/); const lines = []; let line = '';
  for (const word of words) { if (`${line} ${word}`.trim().length > width && line) { lines.push(line); line = word; } else line = `${line} ${word}`.trim(); }
  if (line) lines.push(line); return lines.length ? lines : ['-'];
}
function storedReportData(inspectionId) {
  const inspection = db.prepare(`SELECT i.*, p.product_name, p.generic_name, p.brand_name, u.full_name AS officer_name, u.email AS officer_email
    FROM inspections i JOIN products p ON p.id=i.product_id JOIN users u ON u.id=i.officer_id WHERE i.id=?`).get(inspectionId);
  if (!inspection) throw new Error('Inspection was not found for report generation.');
  const declarations = db.prepare(`SELECT d.*, img.image_type AS source_side FROM declarations d LEFT JOIN inspection_images img ON img.id=d.source_image_id WHERE d.inspection_id=? ORDER BY d.created_at`).all(inspectionId);
  const findings = db.prepare(`SELECT f.*, r.rule_code, r.legal_reference, r.version AS rule_version, reviewer.full_name AS reviewer_name
    FROM findings f LEFT JOIN rules r ON r.id=f.rule_id LEFT JOIN users reviewer ON reviewer.id=f.reviewed_by WHERE f.inspection_id=? ORDER BY f.created_at`).all(inspectionId);
  const images = db.prepare('SELECT * FROM inspection_images WHERE inspection_id=? ORDER BY created_at').all(inspectionId);
  return { inspection, declarations, findings, images };
}
function textLines(data, reportNumber) {
  const { inspection: i, declarations, findings } = data; const lines = [];
  const add = (label, value) => wrap(`${label}: ${value ?? '-'}`).forEach(line => lines.push(line));
  lines.push('LEGALMETRIX - INSPECTION REPORT', ''); add('Report Number', reportNumber); add('Inspection ID', i.id); add('Inspection Number', i.inspection_number); add('Product', i.product_name); add('Category', i.generic_name || 'Not recorded'); add('Brand', i.brand_name || 'Not recorded'); add('Inspection Date/Time', `${i.created_at} UTC`); add('Officer', `${i.officer_name} (${i.officer_email})`); add('Inspection Status', i.state); add('Location', i.location || 'Not recorded'); lines.push('', 'EXTRACTED DECLARATIONS');
  for (const d of declarations) { add(ascii(d.field_name).replace(/_/g, ' ').toUpperCase(), `${d.value || 'Not detected'} | Confidence ${Math.round((d.confidence || 0) * 100)}% | ${d.extraction_state || d.detection_state} | Source ${d.source_side || '-'} | Method ${d.extraction_source || d.extraction_method}`); if (d.ocr_evidence) add('OCR evidence', d.ocr_evidence); }
  lines.push('', 'AUTOMATED FINDINGS AND OFFICER VERIFICATION');
  for (const f of findings) { add('Finding', `${f.status} | ${f.message}`); add('Rule', `${f.rule_code || 'Unavailable'} | Version ${f.rule_version || '-'}`); add('Confidence', `${Math.round((f.confidence || 0) * 100)}%`); add('Verified legal reference', f.legal_reference && f.legal_reference !== 'LEGAL_REFERENCE_PENDING_VERIFICATION' ? f.legal_reference : 'No verified legal reference supplied'); add('Officer decision', f.officer_decision || 'Not reviewed'); if (f.reviewer_name) add('Reviewed by', `${f.reviewer_name} at ${f.reviewed_at || '-'}`); if (f.officer_comment) add('Officer comment', f.officer_comment); lines.push(''); }
  const refs = [...new Set(findings.map(f => f.legal_reference).filter(ref => ref && ref !== 'LEGAL_REFERENCE_PENDING_VERIFICATION'))]; lines.push('APPLICABLE VERIFIED LEGAL REFERENCES'); lines.push(...(refs.length ? refs.flatMap(ref => wrap(ref)) : ['None supplied; manual legal-reference verification remains required.']), '', 'SUPPORTING PHOTOGRAPHS / EVIDENCE', `${data.images.length} original evidence image(s) attached on the following pages.`, '', 'DISCLAIMER', ...wrap(disclaimer));
  return lines;
}
function buildPdf(textPages, imagePages) {
  const objects = [null, null, null, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')];
  const pageIds = [];
  const addObject = content => { objects.push(Buffer.isBuffer(content) ? content : Buffer.from(content)); return objects.length - 1; };
  for (const lines of textPages) { const commands = ['BT', '/F1 9 Tf', '11 TL', '46 795 Td', ...lines.map(line => `(${pdfEscape(line)}) Tj T*`), 'ET'].join('\n'); const contentId = addObject(`<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`); const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`); pageIds.push(pageId); }
  for (const image of imagePages) { const imageHeader = Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.buffer.length} >>\nstream\n`); const imageId = addObject(Buffer.concat([imageHeader, image.buffer, Buffer.from('\nendstream')])); const scale = Math.min(520 / image.width, 680 / image.height); const w = image.width * scale; const h = image.height * scale; const x = (612 - w) / 2; const y = 65 + (680 - h) / 2; const commands = `BT /F1 11 Tf 46 806 Td (${pdfEscape(`${image.side} - ${image.filename}`)}) Tj ET\nq ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im1 Do Q`; const contentId = addObject(`<< /Length ${Buffer.byteLength(commands)} >>\nstream\n${commands}\nendstream`); const pageId = addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`); pageIds.push(pageId); }
  objects[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'); objects[2] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
  const parts = [Buffer.from('%PDF-1.4\n%LegalMetrix\n')]; const offsets = [0]; let offset = parts[0].length;
  for (let id = 1; id < objects.length; id++) { offsets[id] = offset; const object = Buffer.concat([Buffer.from(`${id} 0 obj\n`), objects[id], Buffer.from('\nendobj\n')]); parts.push(object); offset += object.length; }
  const xrefOffset = offset; let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`; for (let id = 1; id < objects.length; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`; xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(Buffer.from(xref)); return Buffer.concat(parts);
}
async function generateReport({ inspectionId, reportNumber }) {
  const data = storedReportData(inspectionId); const lines = textLines(data, reportNumber); const textPages = []; for (let i = 0; i < lines.length; i += 66) textPages.push(lines.slice(i, i + 66));
  const imagePages = [];
  for (const image of data.images) { const source = path.resolve(rootDir, image.storage_path); const converted = await sharp(source).rotate().resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 82 }).toBuffer({ resolveWithObject: true }); imagePages.push({ buffer: converted.data, width: converted.info.width, height: converted.info.height, side: image.image_type, filename: image.original_filename }); }
  const outputDir = path.resolve(rootDir, 'uploads/reports'); await fs.promises.mkdir(outputDir, { recursive: true }); const outputPath = path.join(outputDir, `${reportNumber}.pdf`); await fs.promises.writeFile(outputPath, buildPdf(textPages, imagePages));
  return { state: 'GENERATED', message: 'Inspection PDF generated from stored inspection data.', storagePath: path.relative(rootDir, outputPath).replace(/\\/g, '/'), pageCount: textPages.length + imagePages.length };
}
module.exports = { generateReport, storedReportData };
