const dateFields = new Set(['manufacturing_or_packing_date', 'best_before']);
const pointerPattern = /(?:see|refer(?:\s+to)?|printed)\s+(?:on\s+)?(?:top|bottom|side|pack|crimp|seal|below|above)|(?:expiry|exp(?:iry)?\s*date|best\s*before|mfg|manufactur(?:ing)?\s*date|pack(?:ing)?\s*date)\s+(?:is\s+)?(?:on\s+)?(?:top|bottom|side|pack|crimp|seal|below|above)/i;

function normalize(value) { return String(value || '').replace(/\s+/g, ' ').replace(/[.:;,_-]+$/g, '').trim(); }
function findDateReferencePointer(value) {
  const text = normalize(value);
  const match = text.match(pointerPattern);
  return match ? normalize(match[0]) : null;
}
function isDateReferencePointer(value) {
  const text = normalize(value);
  const pointer = findDateReferencePointer(text);
  if (!pointer) return false;
  // A real date alongside a pointer remains usable; the pointer is only supporting context.
  return !/\b\d{1,4}[/-]\d{1,2}(?:[/-]\d{2,4})?\b|\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(text);
}
function isDateField(field) { return dateFields.has(field); }
const pointerGuidance = 'Date information is referenced elsewhere on the package. Capture the top/crimp area.';

module.exports = { findDateReferencePointer, isDateReferencePointer, isDateField, pointerGuidance };
