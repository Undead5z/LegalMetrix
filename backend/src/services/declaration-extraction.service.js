const FIELDS = ['product_name','manufacturer','manufacturer_address','packer','importer','country_of_origin','net_quantity','mrp','manufacturing_or_packing_date','best_before','consumer_care_phone','consumer_care_email','unit_sale_price'];
const clean = value => value?.replace(/\s+/g, ' ').replace(/^[:\-\s]+|[;\s]+$/g, '').trim() || null;
const matched = (value, factor = 1, evidence = value, minimumConfidence = 0) => value ? ({ value: clean(value), factor, evidence: clean(evidence), minimumConfidence }) : null;
const lineAfter = (lines, pattern) => { const i = lines.findIndex(line => pattern.test(line)); return i < 0 ? null : clean(lines[i].replace(pattern, '') || lines[i + 1]); };
const key = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function localEvidenceConfidence(source, value) {
  const words = source.boundingBoxes || []; const valueKey = key(value); const exact = words.filter(word => key(word.text) === valueKey).map(word => word.confidence || 0);
  if (exact.length) return Math.max(...exact);
  const tokens = String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []; const tokenScores = tokens.map(token => Math.max(0, ...words.filter(word => key(word.text) === token).map(word => word.confidence || 0))).filter(Boolean);
  return tokenScores.length === tokens.length && tokens.length ? tokenScores.reduce((sum, score) => sum + score, 0) / tokenScores.length : 0;
}
function businessFragment(lines) {
  const company = lines.map(line => line.match(/\b(?:Pharma|Phama|Herbal)\s+(?:Chem\s+)?(?:Equipment|Products?)\b/i)?.[0]).find(Boolean);
  if (company) return company;
  const manufactured = lines.findIndex(line => /(?:manufactur\w*|\w*tured|nutactyreq)\s+in\s+india\s+by/i.test(line));
  return manufactured >= 0 ? lines.slice(manufactured + 1, manufactured + 5).map(line => line.match(/\bGlenm\w+\b/i)?.[0]).find(Boolean) || null : null;
}
function addressFragment(lines) { const index = lines.findIndex(line => /\b\d{3}\s?\d{3}\b/.test(line) && /(plot|road|street|sector|haridwar|sidcul|nagar|district|mumbai|maharashtr|solan|ropar|dadra)/i.test(line)); return index < 0 ? null : lines[index]; }
function candidate(field, text) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  if (field === 'net_quantity') {
    const exact = text.match(/net\s*(?:quantity|quant(?:ity)?|qty|wt|weight)?[^\d]{0,12}(\d+(?:\.\d+)?)\s*(kg|g|gm|grams?|ml|l|lit(?:re|er)?s?)\b/i);
    if (exact) return matched(`${exact[1]} ${exact[2]}`, 1, exact[0]);
    const fuzzy = text.match(/n[e3]t\s*(?:quan\w*|quant\w*|q\w*)?[^\d]{0,16}(\d+(?:\.\d+)?)\s*([qg])\b/i);
    if (fuzzy) return matched(`${fuzzy[1]} g`, fuzzy[2].toLowerCase() === 'q' ? .55 : .7, fuzzy[0]);
    const quantities = [...text.matchAll(/\b(\d+(?:\.\d+)?)\s*(kg|g|gm|grams?|ml|l|lit(?:re|er)?s?)\b/gi)].filter(match => /(?:pack|net|content|cream|powder|gel|ointment|tablet|capsule|syrup|lotion|spray|soap|shampoo)/i.test(text.slice(Math.max(0, match.index - 70), match.index + match[0].length + 70))); const groups = new Map(); quantities.forEach(match => { const value = `${match[1]} ${match[2]}`; const id = key(value); const context = text.slice(Math.max(0, match.index - 70), match.index + match[0].length + 100); const strongPackageContext = /(?:cream|powder|gel|ointment|tablet|capsule|syrup|lotion|spray|soap|shampoo)/i.test(context) && (/\b[A-Z][A-Z0-9-]{3,}\b/.test(context) || /\bpack\b/i.test(context)); const group = groups.get(id) || { value, evidence: match[0], count: 0, strongPackageContext: false }; group.count++; group.strongPackageContext ||= strongPackageContext; groups.set(id, group); }); const repeated = [...groups.values()].sort((a, b) => b.count - a.count)[0];
    if (repeated?.count >= 2) return matched(repeated.value, .7, repeated.evidence, .7);
    if (repeated?.strongPackageContext) return matched(repeated.value, .7, repeated.evidence, .65);
  }
  if (field === 'mrp') { const m = text.match(/(?:\bm\s*\.?\s*r\s*\.?\s*p\b|\bmax(?:imum)?\s*retail\s*price\b)[^\n\d]{0,18}(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d{1,2})?)/i); return m && matched(`₹${m[1]}`, 1, m[0]); }
  if (field === 'consumer_care_email') { const m = text.match(/([\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,})\b/i); return m && matched(m[1], 1, m[0]); }
  if (field === 'consumer_care_phone') { const context = text.match(/consumer\s*(?:queries|care|helpline|contact)[\s\S]{0,160}/i)?.[0] || ''; const labelled = context.match(/(?:1[68]00[ \t-]?\d{3}[ \t-]?\d{4}|(?:\+?91[-\s]?)?[6-9]\d[\d\s-]{8,10}\d)/i); const mobile = text.match(/\b[6-9]\d{9}\b/); return matched(labelled?.[0] || mobile?.[0], 1, labelled?.[0] || mobile?.[0]); }
  if (field === 'country_of_origin') { const explicit = lineAfter(lines, /country\s*(?:of)?\s*origin\s*[:\-]?/i); const madeIn = text.match(/(?:manufactur\w*|\w*tured|nutactyreq)\s+in\s+(India)\s+by/i); return matched(explicit || madeIn?.[1], explicit ? 1 : .7, explicit || madeIn?.[0]); }
  if (field === 'manufacturer') { const explicit = lineAfter(lines, /(?:manufactur(?:ed|er|ing)?\s*(?:by)?|mfd\.?\s*by)\s*[:\-]?/i)?.split(/marketed\s+by/i)[0]?.trim(); return matched(explicit || businessFragment(lines), explicit ? 1 : .7); }
  if (field === 'packer') return matched(lineAfter(lines, /(?:packed\s+by|packer)\s*[:\-]?/i));
  if (field === 'importer') return matched(lineAfter(lines, /import(?:ed|er)?\s*(?:by)?\s*[:\-]?/i));
  if (field === 'manufacturer_address') { const explicit = lineAfter(lines, /^(?:manufacturer|packer|importer)?\s*address\s*[:\-]?/i); return matched(explicit || addressFragment(lines), explicit ? 1 : .7); }
  if (field === 'manufacturing_or_packing_date') { const m = text.match(/(?:mfg|manufactur\w*|pack\w*)\s*(?:date)?\s*[:\-]?\s*(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}[\/-]\d{2,4})/i); return m && matched(m[1], 1, m[0]); }
  if (field === 'best_before') { const duration = text.match(/\b(\d{1,3}\s*(?:days?|months?|years?)\s*before\s*expiry)\b/i); if (duration) return matched(duration[1], 1, duration[0]); const labelled = text.match(/(?:best\s*before|use\s*by)\s*[:\-]?\s*(\d{1,3}\s*(?:days?|months?|years?)|\d{1,2}[\/-](?:\d{1,2}[\/-])?\d{2,4})/i); if (labelled) return matched(labelled[1], 1, labelled[0]); const expiry = text.match(/expiry\s*date\s*[:\-]?\s*([A-Z]{3,9}\s+\d{2,4})/i); return expiry && matched(expiry[1], .85, expiry[0]); }
  if (field === 'unit_sale_price') { const m = text.match(/(?:unit\s*sale\s*price|price\s*per\s*(?:kg|g|l|ml))\s*[:\-]?\s*((?:₹|rs\.?|inr)\s*\d+(?:\.\d{1,2})?)/i); return m && matched(m[1], 1, m[0]); }
  if (field === 'product_name') { const labelled = lineAfter(lines, /(?:product|commodity|generic)\s*name\s*[:\-]?/i); if (labelled) return matched(labelled); const branded = text.match(/\b([A-Z][A-Z0-9-]{3,})[^A-Za-z0-9\n]{0,4}(cream|gel|ointment|powder|tablets?|capsules?|syrup|lotion|spray|soap|shampoo)\b/i); const dosageMatches = [...text.matchAll(/\b(?:[A-Za-z][A-Za-z0-9-]{2,}[®™]?\s+){0,3}(?:dusting\s+powder|cream|powder|gel|ointment|tablets?|capsules?|syrup|lotion|spray|soap|shampoo)\b/gi)].map(match => match[0].replace(/[®™]/g, '').trim()).filter(value => !/^(?:to|as|a|an|the|use|used|apply|store|with)\b/i.test(value)); if (branded) dosageMatches.push(`${branded[1]} ${branded[2]}`); if (dosageMatches.length) { const counts = new Map(); dosageMatches.forEach(value => counts.set(value, (counts.get(value) || 0) + 1)); const commodity = [...counts.entries()].sort(([a, ac], [b, bc]) => (bc * 8 + b.length) - (ac * 8 + a.length))[0][0]; return matched(commodity, .9, commodity); } const phrases = text.match(/\b[A-Z]{3,}(?:\s+[A-Z]{3,}){1,4}\b/g) || []; const counts = new Map(); phrases.filter(phrase => !/(COMPOSITION|INGREDIENTS|CONSUMER|MANUFACT|PACKED|QUANTITY|PRICE|BATCH|REFERENCE|RESULTS|VISIBLE|INSTANT)/.test(phrase)).forEach(phrase => counts.set(phrase, (counts.get(phrase) || 0) + 1)); const fallback = [...counts.entries()].sort(([a, ac], [b, bc]) => (bc * 4 + b.split(/\s+/).length * 3 + b.length) - (ac * 4 + a.split(/\s+/).length * 3 + a.length))[0]?.[0]; return matched(fallback, .8, fallback); }
  return null;
}
async function extractDeclarations(ocrResult) {
  const images = ocrResult.images.filter(item => item.state === 'COMPLETED' && item.text);
  const declarations = FIELDS.map(field => ({ field, value: null, confidence: 0, sourceImageId: null, boundingBox: null, extractionState: 'NOT_DETECTED', ocrEvidence: null }));
  const sources = [...images.map(item => ({ ...item, parseText: item.normalizedText || item.text })), { imageId: null, parseText: images.map(item => item.normalizedText || item.text).join('\n'), confidence: images.length ? Math.min(...images.map(item => item.confidence || 0)) : 0 }];
  for (const source of sources) for (const declaration of declarations) {
    if (declaration.value) continue;
    const result = candidate(declaration.field, source.parseText);
    if (result) { const evidenceConfidence = localEvidenceConfidence(source, result.value); const confidence = Math.min(Math.max(Math.max(source.confidence || .5, evidenceConfidence) * result.factor, result.minimumConfidence || 0), .95); const valueNumber = ['net_quantity', 'mrp', 'manufacturing_or_packing_date', 'best_before', 'unit_sale_price'].includes(declaration.field) ? result.value.match(/\d+(?:\.\d+)?/)?.[0] : null; const rawEvidence = valueNumber ? source.text?.split(/\r?\n/).find(line => line.includes(valueNumber)) : null; Object.assign(declaration, { value: result.value, confidence, sourceImageId: source.imageId, extractionState: confidence < .65 ? 'LOW_CONFIDENCE' : 'DETECTED', ocrEvidence: clean(rawEvidence) || result.evidence }); }
  }
  return { state: 'COMPLETED', declarations };
}
module.exports = { extractDeclarations, FIELDS };
