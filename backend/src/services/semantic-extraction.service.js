const { z } = require('zod');
const env = require('../config/env');
const { FIELDS } = require('./declaration-extraction.service');
const candidateSchema = z.object({ field: z.enum(FIELDS), value: z.string().nullable(), confidence: z.number().min(0).max(1), state: z.enum(['DETECTED', 'LOW_CONFIDENCE', 'NOT_DETECTED']), sourceSide: z.enum(['FRONT', 'BACK', 'ADDITIONAL']).nullable(), ocrEvidence: z.string().nullable() });
const outputSchema = z.object({ declarations: z.array(candidateSchema) });
const structuredResponseFormat = { type: 'json_schema', json_schema: { name: 'legalmetrix_declarations', strict: true, schema: { type: 'object', additionalProperties: false, required: ['declarations'], properties: { declarations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'value', 'confidence', 'state', 'sourceSide', 'ocrEvidence'], properties: { field: { type: 'string', enum: FIELDS }, value: { type: ['string', 'null'] }, confidence: { type: 'number', minimum: 0, maximum: 1 }, state: { type: 'string', enum: ['DETECTED', 'LOW_CONFIDENCE', 'NOT_DETECTED'] }, sourceSide: { enum: ['FRONT', 'BACK', 'ADDITIONAL', null] }, ocrEvidence: { type: ['string', 'null'] } } } } } } } };
const focusPattern = /(?:product|commodity|generic|brand|manufact|\bmfd\b|pack(?:ed|er|ing)|import|address|country|origin|net|content|quantity|\bqty\b|\bmrp\b|retail|price|consumer|care|helpline|contact|email|best|before|use\s*by|expiry|\bexp\b|unit\s*sale|batch|india|phone|tel\b|toll|pharma|equipment|plot|sector|road|street|pvt\.?|ltd\.?|limited|cream|gel|ointment|powder|tablet|capsule|syrup|lotion|spray|soap|shampoo)/i;
function focusedOcr(text = '') {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean); const selected = new Set();
  lines.forEach((line, index) => { const alphanumeric = (line.match(/[a-z0-9]/gi) || []).length; const cleanLine = line.length >= 4 && line.length <= 120 && alphanumeric / line.length >= .58 && line.split(/\s+/).length <= 16; if (focusPattern.test(line) || /@/.test(line) || /\b[A-Z]{3,}(?:\s+[A-Z]{3,}){1,4}\b/.test(line) || cleanLine) for (let nearby = Math.max(0, index - 1); nearby <= Math.min(lines.length - 1, index + 1); nearby++) selected.add(nearby); });
  return [...selected].sort((a, b) => a - b).slice(0, 160).map(index => lines[index]).join('\n').slice(0, 7000);
}
const compactEvidence = images => images.map(image => ({ side: image.image_type, ocrConfidence: image.ocrConfidence ?? image.confidence, ocrText: focusedOcr(image.normalizedText || image.text), highConfidenceWords: image.boundingBoxes?.filter(word => word.confidence >= .5).slice(0, 24).map(word => ({ text: word.text, confidence: word.confidence })) })).filter(image => image.ocrText).map(image => JSON.stringify(image)).join('\n');
function parseModelOutput(content) {
  const raw = String(content || '').trim(); const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]; const marker = raw.search(/\{\s*"declarations"\s*:/);
  const cleaned = (fenced || (marker >= 0 ? raw.slice(marker, raw.lastIndexOf('}') + 1) : raw)).trim();
  const parsed = JSON.parse(cleaned || '{}'); const declarations = Array.isArray(parsed) ? parsed : parsed.declarations || parsed.fields || parsed.results;
  return outputSchema.parse({ declarations });
}
function evidenceSupported(candidate, images) {
  if (!candidate.value || !candidate.sourceSide || !candidate.ocrEvidence) return candidate.value === null;
  const source = images.find(image => image.image_type === candidate.sourceSide);
  if (!source) return false;
  const haystack = `${source.text || ''}\n${source.normalizedText || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  const evidence = candidate.ocrEvidence.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (evidence.length < 3 || !haystack.includes(evidence)) return false;
  const textualFields = ['product_name', 'manufacturer', 'manufacturer_address', 'packer', 'importer', 'consumer_care_phone', 'consumer_care_email'];
  if (textualFields.includes(candidate.field) && !evidence.includes(candidate.value.toLowerCase().replace(/[^a-z0-9]/g, ''))) return false;
  if (candidate.field === 'country_of_origin' && !/(country|origin|made\s+in)/i.test(candidate.ocrEvidence)) return false;
  if (candidate.field === 'consumer_care_phone' && candidate.value.replace(/\D/g, '').length < 8) return false;
  if (candidate.field === 'consumer_care_email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.value)) return false;
  if (['mrp', 'unit_sale_price'].includes(candidate.field) && !/\d/.test(candidate.value)) return false;
  if (candidate.field === 'net_quantity' && !/^\s*\d+(?:\.\d+)?\s*(?:kg|g|gm|grams?|ml|l|lit(?:re|er)?s?)\s*$/i.test(candidate.value)) return false;
  return true;
}
function normalizeCandidate(candidate) {
  if (!candidate.value) return { ...candidate, value: null, confidence: 0, state: 'NOT_DETECTED', sourceSide: null, ocrEvidence: null };
  return { ...candidate, state: candidate.confidence < .65 ? 'LOW_CONFIDENCE' : candidate.state === 'NOT_DETECTED' ? 'LOW_CONFIDENCE' : candidate.state };
}
async function extractSemantically(images) {
  const diagnostics = { invoked: false, provider: env.aiExtractionBaseUrl.includes('openrouter.ai') ? 'OpenRouter' : 'OpenAI-compatible', model: env.aiExtractionModel, inputOcrCharacterCount: compactEvidence(images).length, success: false, fallbackUsed: true, error: null, output: null };
  if (!env.aiExtractionApiKey) { diagnostics.error = 'AI extraction is not configured.'; return { candidates: [], diagnostics }; }
  diagnostics.invoked = true;
  const prompt = `Extract package-label declarations from OCR only. Return exactly one JSON object with a top-level "declarations" array and no other top-level key. Include one object for each allowed field using this shape: {"field":"allowed field","value":"string or null","confidence":0-1,"state":"DETECTED|LOW_CONFIDENCE|NOT_DETECTED","sourceSide":"FRONT|BACK|ADDITIONAL|null","ocrEvidence":"exact OCR fragment or null"}. Allowed fields: ${FIELDS.join(', ')}. For product_name, prefer an explicit brand plus product/dosage form over promotional claims. For manufacturer, use only text explicitly associated with manufactured by or Mfd. by; do not treat marketed by as manufacturer. Every non-null value must be supported by ocrEvidence copied exactly from ocrText for sourceSide. Do not infer, repair, or guess names, addresses, values, dates, prices, units, contacts, or legal conclusions. Use LOW_CONFIDENCE for ambiguous OCR and NOT_DETECTED when unsupported.\nOCR evidence:\n${compactEvidence(images)}`;
  let responseContent = '';
  try {
    const response = await fetch(env.aiExtractionBaseUrl, { method: 'POST', signal: AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${env.aiExtractionApiKey}`, 'Content-Type': 'application/json', ...(env.aiExtractionBaseUrl.includes('openrouter.ai') ? { 'HTTP-Referer': 'http://localhost:5173', 'X-Title': 'LegalMetrix' } : {}) }, body: JSON.stringify({ model: env.aiExtractionModel, temperature: 0, max_tokens: 2500, reasoning: { enabled: false }, response_format: structuredResponseFormat, messages: [{ role: 'system', content: 'Return strict JSON only with the required declarations array.' }, { role: 'user', content: prompt }] }) });
    if (!response.ok) throw new Error(`AI provider returned HTTP ${response.status}`);
    const payload = await response.json(); responseContent = payload.choices?.[0]?.message?.content || ''; const parsed = parseModelOutput(responseContent);
    const candidates = parsed.declarations.map(normalizeCandidate).filter(candidate => evidenceSupported(candidate, images));
    diagnostics.success = true; diagnostics.fallbackUsed = false; diagnostics.output = candidates;
    return { candidates, diagnostics };
  } catch (error) { diagnostics.error = error.message; if (responseContent) diagnostics.rawOutputPreview = responseContent.slice(0, 1200); return { candidates: [], diagnostics }; }
}
function canonical(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function mergeDeclarations(deterministic, candidates, images) {
  const byField = new Map(candidates.filter(item => item.value).map(item => [item.field, item]));
  return deterministic.map(item => {
    const ai = byField.get(item.field); if (!ai) return { ...item, extractionSource: 'DETERMINISTIC' };
    const sourceImage = images.find(image => image.image_type === ai.sourceSide);
    if (!item.value) return { ...item, value: ai.value, confidence: ai.confidence, sourceImageId: sourceImage?.imageId || null, extractionState: ai.state, ocrEvidence: ai.ocrEvidence, extractionSource: 'AI_ASSISTED' };
    if (canonical(item.value) === canonical(ai.value)) { const confidence = Math.min(.95, Math.max(item.confidence, ai.confidence) + .1); return { ...item, confidence, extractionState: confidence >= .65 ? 'DETECTED' : 'LOW_CONFIDENCE', ocrEvidence: `${item.ocrEvidence} | AI: ${ai.ocrEvidence}`, extractionSource: 'HYBRID' }; }
    return { ...item, confidence: Math.min(item.confidence, ai.confidence, .6), extractionState: 'NEEDS_REVIEW', ocrEvidence: `Deterministic: ${item.value} (${item.ocrEvidence}) | AI candidate: ${ai.value} (${ai.ocrEvidence})`, extractionSource: 'HYBRID_CONFLICT' };
  });
}
module.exports = { extractSemantically, mergeDeclarations };
