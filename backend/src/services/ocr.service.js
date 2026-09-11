const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { recognize, PSM } = require('tesseract.js');
const env = require('../config/env');
const { resolveStoredPath, toStoredPath } = require('./storage.service');

const QUALITY_STATE = Object.freeze({ ACCEPTABLE: 'ACCEPTABLE', REVIEW_REQUIRED: 'REVIEW_REQUIRED' });
function variance(values) { const mean = values.reduce((a, b) => a + b, 0) / values.length; return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length; }
function normalizeOcrText(text = '') {
  return text.replace(/\bN[E3]T\s*QUA[NM][T1I]?(?:[T1I]TY)?\b/gi, 'NET QUANTITY')
    .replace(/\bM\s*\.?\s*R\s*\.?\s*P\s*\.?\b/gi, 'MRP')
    .replace(/\bMANUFA[CG]TUR(?:ED|ER)?\b/gi, 'MANUFACTURED')
    .replace(/\bCONSUME[R8]\s*CA[R8]E\b/gi, 'CONSUMER CARE')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

async function evaluateImageQuality(image) {
  const source = resolveStoredPath(image.storage_path);
  const metadata = await sharp(source).metadata();
  const sample = await sharp(source).rotate().resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const contrast = Math.sqrt(variance([...sample.data]));
  const tooSmall = (metadata.width || 0) * (metadata.height || 0) < 100000;
  const tooLowContrast = contrast < 10;
  const qualityState = tooSmall || tooLowContrast ? QUALITY_STATE.REVIEW_REQUIRED : QUALITY_STATE.ACCEPTABLE;
  const reason = tooSmall ? 'Image resolution is too low.' : tooLowContrast ? 'Label contrast is too low.' : null;
  return { qualityState, reason, metrics: { width: metadata.width, height: metadata.height, contrast: Number(contrast.toFixed(1)), orientation: metadata.orientation || 1 } };
}

async function prepareImage(image) {
  const source = resolveStoredPath(image.storage_path);
  const quality = await evaluateImageQuality(image);
  if (quality.qualityState === QUALITY_STATE.REVIEW_REQUIRED) return { ...quality, processed: null, outputPath: null };
  // This derivative is OCR-only. The original uploaded evidence is never modified.
  const processed = await sharp(source).rotate().resize({ width: 3000, withoutEnlargement: false }).grayscale().normalise().median(3).sharpen({ sigma: 1.2 }).png().toBuffer();
  const outputDir = path.join(env.uploadDir, 'ocr'); fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${image.id}.png`); await fs.promises.writeFile(outputPath, processed);
  return { ...quality, processed, outputPath: toStoredPath(outputPath), metrics: { ...quality.metrics, ocrWidth: 3000 } };
}

async function recognizeRegions(buffer) {
  const meta = await sharp(buffer).metadata(); const width = meta.width; const height = meta.height;
  const regions = [{ name: 'full', buffer }, { name: 'top', buffer: await sharp(buffer).extract({ left: 0, top: 0, width, height: Math.floor(height * 0.58) }).png().toBuffer() }, { name: 'bottom', buffer: await sharp(buffer).extract({ left: 0, top: Math.floor(height * 0.42), width, height: height - Math.floor(height * 0.42) }).png().toBuffer() }];
  const outputs = [];
  for (const region of regions) { const { data } = await recognize(region.buffer, 'eng', { tessedit_pageseg_mode: PSM.SPARSE_TEXT }); outputs.push({ ...region, data }); }
  const lines = [...new Set(outputs.flatMap(output => (output.data.text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)))];
  const textOutputs = outputs.filter(output => (output.data.text || '').trim());
  const confidence = textOutputs.length ? textOutputs.reduce((sum, output) => sum + (output.data.confidence || 0), 0) / textOutputs.length : 0;
  const words = outputs.flatMap(output => (output.data.words || []).map(word => ({ text: word.text, confidence: Number(((word.confidence || 0) / 100).toFixed(2)), boundingBox: word.bbox, region: output.name })));
  return { text: lines.join('\n'), confidence: Number((confidence / 100).toFixed(2)), words };
}

async function readImages(images) {
  const results = [];
  for (const image of images) try {
    const prepared = await prepareImage(image);
    if (prepared.qualityState === QUALITY_STATE.REVIEW_REQUIRED) { results.push({ imageId: image.id, state: 'RECAPTURE_RECOMMENDED', qualityState: prepared.qualityState, text: null, normalizedText: null, confidence: 0, boundingBoxes: [], quality: prepared.metrics, ocrStoragePath: null, reason: prepared.reason }); continue; }
    const ocr = await recognizeRegions(prepared.processed);
    results.push({ imageId: image.id, state: 'COMPLETED', qualityState: prepared.qualityState, text: ocr.text, normalizedText: normalizeOcrText(ocr.text), confidence: ocr.confidence, boundingBoxes: ocr.words, quality: prepared.metrics, ocrStoragePath: prepared.outputPath, reason: null });
  } catch (error) { results.push({ imageId: image.id, state: 'OCR_UNAVAILABLE', qualityState: QUALITY_STATE.REVIEW_REQUIRED, text: null, normalizedText: null, confidence: 0, boundingBoxes: [], quality: null, ocrStoragePath: null, reason: `OCR could not run: ${error.message}` }); }
  return { state: results.some(x => x.state === 'COMPLETED') ? 'COMPLETED' : 'REVIEW_REQUIRED', images: results };
}
module.exports = { QUALITY_STATE, evaluateImageQuality, readImages, normalizeOcrText };
