const assert = require('assert');
const { PRODUCT_CONDITION, evaluateProductCondition } = require('../src/services/product-condition.service');

const inspectionDate = '2026-09-11T10:00:00Z';
const declaration = (field, value, confidence = 0.9, extractionState = 'DETECTED') => ({ field_name: field, value, confidence, extraction_state: extractionState });
const evaluate = declarations => evaluateProductCondition({ declarations, inspectionDate });

const valid = evaluate([declaration('best_before', '25/12/2026')]);
assert.equal(valid.productCondition, PRODUCT_CONDITION.VALID);
const near = evaluate([declaration('best_before', '25/09/2026')]);
assert.equal(near.productCondition, PRODUCT_CONDITION.NEAR_EXPIRY);
const expired = evaluate([declaration('best_before', '01/09/2026')]);
assert.equal(expired.productCondition, PRODUCT_CONDITION.EXPIRED);
assert.match(expired.reason, /has passed/i);
assert.equal(evaluate([]).productCondition, PRODUCT_CONDITION.UNKNOWN);
assert.equal(evaluate([declaration('best_before', '12 months')]).productCondition, PRODUCT_CONDITION.UNKNOWN);
const derived = evaluate([declaration('manufacturing_or_packing_date', '01/01/2026'), declaration('best_before', '12 months')]);
assert.equal(derived.productCondition, PRODUCT_CONDITION.VALID);
assert.equal(evaluate([declaration('best_before', '01/09/2026', 0.5)]).productCondition, PRODUCT_CONDITION.UNKNOWN);
assert.equal(evaluate([{ ...declaration('best_before', 'See top'), date_reference_pointer: 'See top' }]).productCondition, PRODUCT_CONDITION.UNKNOWN);
// Product condition is information only; this service never creates or mutates compliance findings.
assert.deepEqual(Object.keys(expired).sort(), ['expiryDate', 'productCondition', 'reason'].sort());
console.log('Product-condition tests passed.');
