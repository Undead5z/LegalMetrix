const { findDateReferencePointer, isDateField, isDateReferencePointer, pointerGuidance } = require('./date-reference.service');

function canonical(field, value) {
  let normalized = String(value || '').toLowerCase().replace(/₹/g, 'rs').replace(/rupees?|inr/g, 'rs').replace(/[^a-z0-9]/g, '');
  if (['mrp', 'unit_sale_price'].includes(field)) normalized = normalized.replace(/^rs/, '');
  return normalized;
}
function pointerFor(field, item) {
  if (!isDateField(field)) return null;
  return item?.dateReferencePointer || (isDateReferencePointer(item?.value) ? findDateReferencePointer(item.value) : null);
}
function ocrCandidate(item) {
  const pointer = pointerFor(item.field, item);
  if (item.value) return { value: item.value, confidence: item.confidence, state: item.extractionState, sourceImageId: item.sourceImageId, evidence: item.ocrEvidence, dateReferencePointer: item.dateReferencePointer || null };
  return pointer ? { value: null, confidence: 0, state: 'REVIEW_REQUIRED', sourceImageId: item.sourceImageId, evidence: item.ocrEvidence || pointer, dateReferencePointer: pointer } : null;
}
function unresolvedPointer(item, ocr, vision) {
  const pointer = pointerFor(item.field, ocr) || pointerFor(item.field, vision);
  return { ...item, value: null, confidence: 0, sourceImageId: null, extractionState: 'REVIEW_REQUIRED', ocrEvidence: pointer, extractionSource: 'REFERENCE_POINTER', dateReferencePointer: pointer, ocrCandidate: ocr, visionCandidate: vision, visualEvidenceDescription: pointerGuidance };
}

function mergeEvidence(ocrDeclarations, visionCandidates, images) {
  const visionByField = new Map(visionCandidates.filter(candidate => candidate.value || candidate.dateReferencePointer).map(candidate => [candidate.field, candidate]));
  return ocrDeclarations.map(item => {
    const vision = visionByField.get(item.field);
    const ocr = ocrCandidate(item);
    const ocrPointer = pointerFor(item.field, ocr);
    const visionPointer = pointerFor(item.field, vision);
    const visionImage = vision?.value ? images.find(image => image.image_type === vision.sourceSide) : null;
    if (!ocr && !vision) return { ...item, extractionSource: 'NOT_DETECTED', ocrCandidate: null, visionCandidate: null, visualEvidenceDescription: null };
    if (ocrPointer && (!vision || visionPointer)) return unresolvedPointer(item, ocr, vision);
    if (!ocr && visionPointer) return unresolvedPointer(item, ocr, vision);
    if (ocrPointer && vision?.value) return { ...item, value: vision.value, confidence: vision.confidence, sourceImageId: visionImage?.id || null, extractionState: vision.state, ocrEvidence: `Reference: ${ocrPointer} | Vision (${vision.sourceSide}): ${vision.visualEvidenceDescription}`, extractionSource: 'VISION_ASSISTED', dateReferencePointer: ocrPointer, ocrCandidate: ocr, visionCandidate: vision, visualEvidenceDescription: vision.visualEvidenceDescription };
    if (ocr && visionPointer) return { ...item, value: ocr.value, confidence: ocr.confidence, sourceImageId: ocr.sourceImageId, extractionState: ocr.state, ocrEvidence: `${ocr.evidence || ocr.value} | Reference: ${visionPointer}`, extractionSource: 'OCR_DETECTED', dateReferencePointer: visionPointer, ocrCandidate: ocr, visionCandidate: vision, visualEvidenceDescription: vision.visualEvidenceDescription };
    if (ocr && !vision) return { ...item, extractionSource: 'OCR_DETECTED', ocrCandidate: ocr, visionCandidate: null, visualEvidenceDescription: null };
    if (!ocr && vision) return { ...item, value: vision.value, confidence: vision.confidence, sourceImageId: visionImage?.id || null, extractionState: vision.state, ocrEvidence: `Vision (${vision.sourceSide}): ${vision.visualEvidenceDescription}`, extractionSource: 'VISION_ASSISTED', ocrCandidate: null, visionCandidate: vision, visualEvidenceDescription: vision.visualEvidenceDescription };
    if (canonical(item.field, ocr.value) === canonical(item.field, vision.value)) { const confidence = Math.min(.95, Math.max(ocr.confidence || 0, vision.confidence || 0) + .1); return { ...item, confidence, extractionState: confidence >= .65 ? 'DETECTED' : 'LOW_CONFIDENCE', ocrEvidence: `OCR: ${ocr.evidence || ocr.value} | Vision (${vision.sourceSide}): ${vision.visualEvidenceDescription}`, extractionSource: 'HYBRID_CONFIRMED', ocrCandidate: ocr, visionCandidate: vision, visualEvidenceDescription: vision.visualEvidenceDescription }; }
    return { ...item, confidence: Math.min(ocr.confidence || 0, vision.confidence || 0, .6), extractionState: 'NEEDS_REVIEW', ocrEvidence: `OCR candidate: ${ocr.value} (${ocr.evidence || 'no OCR evidence'}) | Vision candidate: ${vision.value} (${vision.sourceSide}: ${vision.visualEvidenceDescription})`, extractionSource: 'REVIEW_REQUIRED', ocrCandidate: ocr, visionCandidate: vision, visualEvidenceDescription: vision.visualEvidenceDescription };
  });
}
module.exports = { mergeEvidence, canonical };
