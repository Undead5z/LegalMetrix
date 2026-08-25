function canonical(field, value) {
  let normalized = String(value || '').toLowerCase().replace(/₹/g, 'rs').replace(/rupees?|inr/g, 'rs').replace(/[^a-z0-9]/g, '');
  if (['mrp', 'unit_sale_price'].includes(field)) normalized = normalized.replace(/^rs/, '');
  return normalized;
}
function ocrCandidate(item) { return item.value ? { value: item.value, confidence: item.confidence, state: item.extractionState, sourceImageId: item.sourceImageId, evidence: item.ocrEvidence } : null; }
function mergeEvidence(ocrDeclarations, visionCandidates, images) {
  const visionByField = new Map(visionCandidates.filter(candidate => candidate.value).map(candidate => [candidate.field, candidate]));
  return ocrDeclarations.map(item => {
    const vision = visionByField.get(item.field); const ocr = ocrCandidate(item); const visionImage = vision ? images.find(image => image.image_type === vision.sourceSide) : null;
    if (!ocr && !vision) return { ...item, extractionSource: 'NOT_DETECTED', ocrCandidate: null, visionCandidate: null, visualEvidenceDescription: null };
    if (ocr && !vision) return { ...item, extractionSource: 'OCR_DETECTED', ocrCandidate: ocr, visionCandidate: null, visualEvidenceDescription: null };
    if (!ocr && vision) return { ...item, value: vision.value, confidence: vision.confidence, sourceImageId: visionImage?.id || null, extractionState: vision.state, ocrEvidence: `Vision (${vision.sourceSide}): ${vision.visualEvidenceDescription}`, extractionSource: 'VISION_ASSISTED', ocrCandidate: null, visionCandidate: vision, visualEvidenceDescription: vision.visualEvidenceDescription };
    if (canonical(item.field, ocr.value) === canonical(item.field, vision.value)) { const confidence = Math.min(.95, Math.max(ocr.confidence || 0, vision.confidence || 0) + .1); return { ...item, confidence, extractionState: confidence >= .65 ? 'DETECTED' : 'LOW_CONFIDENCE', ocrEvidence: `OCR: ${ocr.evidence || ocr.value} | Vision (${vision.sourceSide}): ${vision.visualEvidenceDescription}`, extractionSource: 'HYBRID_CONFIRMED', ocrCandidate: ocr, visionCandidate: vision, visualEvidenceDescription: vision.visualEvidenceDescription }; }
    return { ...item, confidence: Math.min(ocr.confidence || 0, vision.confidence || 0, .6), extractionState: 'NEEDS_REVIEW', ocrEvidence: `OCR candidate: ${ocr.value} (${ocr.evidence || 'no OCR evidence'}) | Vision candidate: ${vision.value} (${vision.sourceSide}: ${vision.visualEvidenceDescription})`, extractionSource: 'REVIEW_REQUIRED', ocrCandidate: ocr, visionCandidate: vision, visualEvidenceDescription: vision.visualEvidenceDescription };
  });
}
module.exports = { mergeEvidence, canonical };
