const db = require('../db/database');
const CONFIDENCE_REVIEW_THRESHOLD = 0.65;
const fieldsFor = { business_information: ['manufacturer','packer','importer'], consumer_care_information: ['consumer_care_phone','consumer_care_email'], date_declaration: ['manufacturing_or_packing_date','best_before'] };
function selected(rule, declarations) { const fields = fieldsFor[rule.declaration_field] || [rule.declaration_field]; return declarations.filter(item => fields.includes(item.field) && item.value); }
function valid(rule, values) {
  const value = values[0]?.value || '';
  if (rule.validation_type === 'FORMAT_MRP') return /^₹\s*\d+(?:\.\d{1,2})?$/.test(value);
  if (rule.validation_type === 'FORMAT_QUANTITY') return /^\d+(?:\.\d+)?\s*(kg|g|gm|grams?|ml|l|lit(?:re|er)?s?)$/i.test(value);
  if (rule.validation_type === 'FORMAT_DATE') return /\d{1,2}[\/-](?:\d{1,2}[\/-])?\d{2,4}|\d{1,3}\s*(?:days?|months?|years?)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4}/i.test(value);
  return true;
}
async function assessDeclarations({ inspectionId, declarations, ocrConfidence = 1 }) {
  const rules = db.prepare("SELECT * FROM rules WHERE status = 'ACTIVE' ORDER BY rule_code").all();
  const findings = rules.map(rule => {
    const values = selected(rule, declarations);
    if (rule.applicability === 'DATE_APPLICABLE' && !values.length) return { ruleId: rule.id, field: rule.declaration_field, observedValue: null, status: 'NOT_APPLICABLE', confidence: 0, explanation: 'Date declaration applicability could not be established from the available label text.', evidence: [], legalReference: rule.legal_reference, ruleVersion: rule.version };
    if (!values.length && ocrConfidence < CONFIDENCE_REVIEW_THRESHOLD) return { ruleId: rule.id, field: rule.declaration_field, observedValue: null, status: 'REVIEW_REQUIRED', confidence: ocrConfidence, explanation: 'Required declaration was not detected, but available label OCR is low confidence. Additional or clearer evidence and officer verification are required.', evidence: [], legalReference: rule.legal_reference, ruleVersion: rule.version };
    if (!values.length) return { ruleId: rule.id, field: rule.declaration_field, observedValue: null, status: 'POTENTIAL_NON_COMPLIANCE', confidence: 0, explanation: `${rule.requirement} Potential non-compliance detected — officer verification required.`, evidence: [], legalReference: rule.legal_reference, ruleVersion: rule.version };
    const confidence = Math.min(...values.map(item => item.confidence || 0));
    const evidence = values.map(item => ({ declarationId: item.id, sourceImageId: item.sourceImageId, value: item.value }));
    if (values.some(item => ['LOW_CONFIDENCE', 'NEEDS_REVIEW'].includes(item.extraction_state || item.extractionState))) return { ruleId: rule.id, field: rule.declaration_field, observedValue: values.map(x => x.value).join(' | '), status: 'REVIEW_REQUIRED', confidence, explanation: 'Declaration extraction is uncertain or contains conflicting candidates; officer verification required.', evidence, legalReference: rule.legal_reference, ruleVersion: rule.version };
    if (confidence < CONFIDENCE_REVIEW_THRESHOLD) return { ruleId: rule.id, field: rule.declaration_field, observedValue: values.map(x => x.value).join(' | '), status: 'REVIEW_REQUIRED', confidence, explanation: 'Declaration was detected with low confidence; officer verification required.', evidence, legalReference: rule.legal_reference, ruleVersion: rule.version };
    if (!valid(rule, values)) return { ruleId: rule.id, field: rule.declaration_field, observedValue: values.map(x => x.value).join(' | '), status: 'POTENTIAL_NON_COMPLIANCE', confidence, explanation: `Detected value does not match the MVP format check. Potential non-compliance detected — officer verification required.`, evidence, legalReference: rule.legal_reference, ruleVersion: rule.version };
    return { ruleId: rule.id, field: rule.declaration_field, observedValue: values.map(x => x.value).join(' | '), status: 'PASS', confidence, explanation: 'Required declaration was detected and passed the MVP deterministic check.', evidence, legalReference: rule.legal_reference, ruleVersion: rule.version };
  });
  return { state: 'COMPLETED', inspectionId, findings };
}
module.exports = { assessDeclarations, CONFIDENCE_REVIEW_THRESHOLD };
