# OCR and AI analysis pipeline

The active `analyzeInspection()` path is:

```text
Evidence image
→ preprocessing and image-quality assessment
→ Tesseract OCR
→ deterministic declaration candidates
+ Vision AI visual candidates
→ evidence merger
→ structured declarations
→ deterministic rule engine
→ automated findings for human review
```

## OCR and deterministic candidates

`ocr.service.js` keeps original uploads private in `backend/uploads` and processes in-memory derivatives for OCR: orientation correction, resize, greyscale/normalization, and sharpening. Poor evidence can be marked `RECAPTURE_RECOMMENDED` rather than treated as reliable text.

`declaration-extraction.service.js` derives deterministic candidates from OCR text. Missing or unreadable values remain missing; the service does not fabricate declarations.

## Vision AI and merger

`vision-extraction.service.js` is part of the live controller path when configured. It produces visual candidates and diagnostics. `evidence-merger.service.js` reconciles OCR and Vision evidence, retaining uncertainty such as `NEEDS_REVIEW` when evidence conflicts. A provider failure/fallback is diagnostic information, not a compliance conclusion.

## Real-world limitations and human review

Real packaged labels can contain curved packaging, glare, very small text, decorative graphics, low contrast, and perspective distortion. These are expected evidence conditions, not application failures. OCR confidence is a confidence estimate for one extracted value; it is not a measured accuracy rate.

Automated findings are preliminary. Field Officers review findings, then an authorized Admin/Master Admin inspects original evidence and records the final prototype outcome. Admin verification may explicitly override incomplete/uncertain automated output while preserving the original declarations, findings, Admin note, and audit trail.

## Accuracy evaluation

Accuracy must be measured separately against real package photographs and manually verified ground truth. Compare each extracted declaration and rule result with expected values; do not report synthetic accuracy figures or equate confidence with accuracy.

`semantic-extraction.service.js` is experimental/optional and is not invoked by `analyzeInspection()`.
