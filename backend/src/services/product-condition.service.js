const env = require('../config/env');
const { isDateReferencePointer } = require('./date-reference.service');

const PRODUCT_CONDITION = Object.freeze({
  VALID: 'VALID',
  NEAR_EXPIRY: 'NEAR_EXPIRY',
  EXPIRED: 'EXPIRED',
  UNKNOWN: 'UNKNOWN'
});

const reliable = declaration => Boolean(
  declaration?.value &&
  !declaration.date_reference_pointer &&
  !declaration.dateReferencePointer &&
  !isDateReferencePointer(declaration.value) &&
  Number(declaration.confidence || 0) >= 0.7 &&
  declaration.extraction_state === 'DETECTED' &&
  !['LOW_CONFIDENCE', 'NEEDS_REVIEW'].includes(declaration.extraction_state)
);

function utcDate(year, monthIndex, day) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === monthIndex && date.getUTCDate() === day ? date : null;
}

function parseAbsoluteDate(value) {
  const text = String(value || '').trim();
  let match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (match) return utcDate(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  // LegalMetrix is deployed for Indian packaged goods, so a labelled numeric
  // package date is interpreted as day/month/year. Two-digit years are rejected.
  match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) return utcDate(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = text.match(/^(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})$/i);
  if (!match) return null;
  const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(match[2].slice(0, 3).toLowerCase());
  return month < 0 ? null : utcDate(Number(match[3]), month, Number(match[1]));
}

function parseDuration(value) {
  const match = String(value || '').trim().match(/^(\d{1,3})\s*(days?|months?|years?)(?:\s+before\s+expiry)?$/i);
  return match ? { amount: Number(match[1]), unit: match[2].toLowerCase().replace(/s$/, '') } : null;
}

function addDuration(date, duration) {
  const result = new Date(date.getTime());
  if (duration.unit === 'day') result.setUTCDate(result.getUTCDate() + duration.amount);
  if (duration.unit === 'month') {
    const day = result.getUTCDate();
    result.setUTCDate(1);
    result.setUTCMonth(result.getUTCMonth() + duration.amount);
    const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
    result.setUTCDate(Math.min(day, daysInMonth));
  }
  if (duration.unit === 'year') {
    const month = result.getUTCMonth(); const day = result.getUTCDate();
    result.setUTCDate(1); result.setUTCFullYear(result.getUTCFullYear() + duration.amount); result.setUTCMonth(month);
    const daysInMonth = new Date(Date.UTC(result.getUTCFullYear(), month + 1, 0)).getUTCDate(); result.setUTCDate(Math.min(day, daysInMonth));
  }
  return result;
}

const displayDate = date => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

function evaluateProductCondition({ declarations, inspectionDate }) {
  const byField = new Map(declarations.map(item => [item.field_name || item.field, item]));
  const bestBefore = byField.get('best_before');
  const manufactured = byField.get('manufacturing_or_packing_date');
  if (!reliable(bestBefore)) return { productCondition: PRODUCT_CONDITION.UNKNOWN, reason: 'Best-before evidence is missing, ambiguous, or low confidence.' };

  let expiryDate = parseAbsoluteDate(bestBefore.value);
  let source = 'best-before date';
  if (!expiryDate) {
    const duration = parseDuration(bestBefore.value);
    const manufacturingDate = reliable(manufactured) ? parseAbsoluteDate(manufactured.value) : null;
    if (!duration || !manufacturingDate) return { productCondition: PRODUCT_CONDITION.UNKNOWN, reason: 'Best-before evidence cannot be safely converted to an expiry date.' };
    expiryDate = addDuration(manufacturingDate, duration);
    source = `manufacturing date plus ${duration.amount} ${duration.unit}${duration.amount === 1 ? '' : 's'}`;
  }

  const inspected = new Date(inspectionDate);
  if (Number.isNaN(inspected.getTime())) return { productCondition: PRODUCT_CONDITION.UNKNOWN, reason: 'Inspection date is unavailable for product-condition evaluation.' };
  const inspectionDay = Date.UTC(inspected.getUTCFullYear(), inspected.getUTCMonth(), inspected.getUTCDate());
  const expiryDay = Date.UTC(expiryDate.getUTCFullYear(), expiryDate.getUTCMonth(), expiryDate.getUTCDate());
  const daysRemaining = Math.floor((expiryDay - inspectionDay) / 86400000);
  if (daysRemaining < 0) return { productCondition: PRODUCT_CONDITION.EXPIRED, reason: `${source[0].toUpperCase()}${source.slice(1)} ${displayDate(expiryDate)} has passed.`, expiryDate: expiryDate.toISOString().slice(0, 10) };
  if (daysRemaining <= env.productConditionNearExpiryDays) return { productCondition: PRODUCT_CONDITION.NEAR_EXPIRY, reason: `${source[0].toUpperCase()}${source.slice(1)} ${displayDate(expiryDate)} is within ${env.productConditionNearExpiryDays} days.`, expiryDate: expiryDate.toISOString().slice(0, 10) };
  return { productCondition: PRODUCT_CONDITION.VALID, reason: `${source[0].toUpperCase()}${source.slice(1)} ${displayDate(expiryDate)} is beyond the near-expiry threshold.`, expiryDate: expiryDate.toISOString().slice(0, 10) };
}

module.exports = { PRODUCT_CONDITION, evaluateProductCondition, parseAbsoluteDate, parseDuration, addDuration };
