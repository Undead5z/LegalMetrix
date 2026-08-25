const assert = require('assert');
const { mergeEvidence } = require('../src/services/evidence-merger.service');
const images = [{ id: 'front', image_type: 'FRONT' }, { id: 'back', image_type: 'BACK' }, { id: 'extra', image_type: 'ADDITIONAL' }];
const base = field => ({ field, value: null, confidence: 0, sourceImageId: null, extractionState: 'NOT_DETECTED', ocrEvidence: null });
const ocr = [
  { ...base('net_quantity'), value: '250 ml', confidence: .72, sourceImageId: 'back', extractionState: 'DETECTED', ocrEvidence: 'NET CONTENT 250 ml' },
  { ...base('mrp'), value: '₹88.40', confidence: .7, sourceImageId: 'extra', extractionState: 'DETECTED', ocrEvidence: 'MRP Rs. 88.40' },
  { ...base('manufacturer'), value: 'Alpha Laboratories', confidence: .8, sourceImageId: 'back', extractionState: 'DETECTED', ocrEvidence: 'Mfd. by Alpha Laboratories' },
  base('consumer_care_email')
];
const vision = [
  { field: 'net_quantity', value: '250ml', confidence: .91, state: 'DETECTED', sourceSide: 'BACK', visualEvidenceDescription: 'Quantity printed beside the lower back panel.' },
  { field: 'mrp', value: '₹89.40', confidence: .87, state: 'DETECTED', sourceSide: 'ADDITIONAL', visualEvidenceDescription: 'Price printed on the bottom stamp.' },
  { field: 'consumer_care_email', value: 'care@example.test', confidence: .88, state: 'DETECTED', sourceSide: 'BACK', visualEvidenceDescription: 'Email printed in the consumer-care block.' }
];
const merged = mergeEvidence(ocr, vision, images);
assert.equal(merged.find(x => x.field === 'net_quantity').extractionSource, 'HYBRID_CONFIRMED');
const conflict = merged.find(x => x.field === 'mrp'); assert.equal(conflict.extractionSource, 'REVIEW_REQUIRED'); assert(conflict.ocrCandidate && conflict.visionCandidate);
assert.equal(merged.find(x => x.field === 'manufacturer').extractionSource, 'OCR_DETECTED');
assert.equal(merged.find(x => x.field === 'consumer_care_email').extractionSource, 'VISION_ASSISTED');
console.log('Evidence-aware merger tests passed.');
