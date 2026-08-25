# OCR pipeline

LegalMetrix uses local **Tesseract.js** OCR behind `backend/src/services/ocr.service.js`. Original uploads remain in `backend/uploads`; only an in-memory derivative is EXIF-rotated, resized, greyscaled, normalized, and sharpened for OCR. A low-resolution, low-contrast, or low-Laplacian-variance image returns `RECAPTURE_RECOMMENDED` and is not sent to OCR.

Tesseract returns text, image confidence, word bounding boxes, and source image ID. The declaration service then uses deterministic keyword/regex parsing for quantity, MRP, dates, emails, phones, contacts, origin, and named declaration lines. All 13 declared fields are persisted; absent values are `NULL`/`NOT_DETECTED` with confidence `0`. No AI provider is used and no value is invented.

The first Tesseract use downloads/caches English language data if it is not already cached; this is the only OCR runtime network dependency. If it cannot initialize or OCR fails, that image is recorded as `OCR_UNAVAILABLE`; other images and the inspection continue processing.
