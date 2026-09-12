const assert = require('assert');
const { candidate, extractDeclarations } = require('../src/services/declaration-extraction.service');
const { normalizeVisionCandidate } = require('../src/services/vision-extraction.service');
const { mergeEvidence } = require('../src/services/evidence-merger.service');

(async () => {
const mfgPointer = candidate('manufacturing_or_packing_date', 'MFG DATE / EXP DATE: SEE TOP');
assert.equal(mfgPointer.value, undefined);
assert.equal(mfgPointer.referencePointer.toLowerCase(), 'see top');
const expiryPointer = candidate('best_before', 'BEST BEFORE: SEE CRIMP');
assert.equal(expiryPointer.value, undefined);
assert.equal(expiryPointer.referencePointer.toLowerCase(), 'see crimp');
assert.equal(candidate('best_before', 'BEST BEFORE: 01/09/2026').value, '01/09/2026');

const crossImage = await extractDeclarations({ images: [
  { state: 'COMPLETED', imageId: 'back', text: 'MFG DATE / EXP DATE: SEE TOP', normalizedText: 'MFG DATE / EXP DATE: SEE TOP', confidence: .95, boundingBoxes: [] },
  { state: 'COMPLETED', imageId: 'additional', text: 'MFG DATE: 01/01/2026\nBEST BEFORE: 01/01/2028', normalizedText: 'MFG DATE: 01/01/2026\nBEST BEFORE: 01/01/2028', confidence: .9, boundingBoxes: [] }
] });
assert.equal(crossImage.declarations.find(item => item.field === 'manufacturing_or_packing_date').value, '01/01/2026');
assert.equal(crossImage.declarations.find(item => item.field === 'best_before').value, '01/01/2028');

const visionPointer = normalizeVisionCandidate({ field: 'best_before', value: 'See top', confidence: 1, state: 'DETECTED', sourceSide: 'BACK', visualEvidenceDescription: 'Best before is printed on the top.' });
assert.equal(visionPointer.value, null);
assert.equal(visionPointer.confidence, 0);
assert.equal(visionPointer.dateReferencePointer.toLowerCase(), 'see top');

const basePointer = { field: 'best_before', value: null, confidence: 0, sourceImageId: 'back', extractionState: 'REVIEW_REQUIRED', ocrEvidence: 'See top', dateReferencePointer: 'See top' };
const images = [{ id: 'back', image_type: 'BACK' }, { id: 'additional', image_type: 'ADDITIONAL' }];
const unresolved = mergeEvidence([basePointer], [visionPointer], images)[0];
assert.equal(unresolved.value, null);
assert.equal(unresolved.extractionState, 'REVIEW_REQUIRED');
assert.equal(unresolved.extractionSource, 'REFERENCE_POINTER');
const visionOnlyPointer = mergeEvidence([{ field: 'best_before', value: null, confidence: 0, sourceImageId: null, extractionState: 'NOT_DETECTED', ocrEvidence: null }], [visionPointer], images)[0];
assert.equal(visionOnlyPointer.value, null);
assert.equal(visionOnlyPointer.extractionSource, 'REFERENCE_POINTER');

const actualVision = { field: 'best_before', value: '01/09/2026', confidence: .9, state: 'DETECTED', sourceSide: 'ADDITIONAL', visualEvidenceDescription: 'Best before date visible on the top seal.' };
const resolved = mergeEvidence([basePointer], [actualVision], images)[0];
assert.equal(resolved.value, '01/09/2026');
assert.equal(resolved.extractionState, 'DETECTED');
console.log('Date-reference pointer tests passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
