const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { createWorker, PSM } = require('tesseract.js');
const env = require('../config/env');
const { resolveStoredPath, toStoredPath } = require('./storage.service');
const { logMemory } = require('./memory-diagnostics.service');

// Railway's 512 MB tier cannot afford Sharp's default cache or parallel workers.
sharp.cache({ memory: 32, files: 0, items: 32 });
sharp.concurrency(1);

const QUALITY_STATE = Object.freeze({ ACCEPTABLE: 'ACCEPTABLE', REVIEW_REQUIRED: 'REVIEW_REQUIRED' });
const OCR_WIDTH = 1800;
function varianceFromBytes(bytes) { let sum = 0; for (const value of bytes) sum += value; const mean = sum / bytes.length; let squared = 0; for (const value of bytes) squared += (value - mean) ** 2; return squared / bytes.length; }
function normalizeOcrText(text = '') {
  return text.replace(/\bN[E3]T\s*QUA[NM][T1I]?(?:[T1I]TY)?\b/gi, 'NET QUANTITY')
    .replace(/\bM\s*\.?\s*R\s*\.?\s*P\s*\.?\b/gi, 'MRP')
    .replace(/\bMANUFA[CG]TUR(?:ED|ER)?\b/gi, 'MANUFACTURED')
    .replace(/\bCONSUME[R8]\s*CA[R8]E\b/gi, 'CONSUMER CARE')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
function storedQuality(image) {
  if (![QUALITY_STATE.ACCEPTABLE, QUALITY_STATE.REVIEW_REQUIRED].includes(image.quality_state)) return null;
  try {
    const metrics = JSON.parse(image.preprocessing_json || '{}');
    return { qualityState: image.quality_state, reason: image.quality_reason || null, metrics };
  } catch { return null; }
}
async function evaluateImageQuality(image) {
  const stored = storedQuality(image);
  if (stored) return stored;
  const source = resolveStoredPath(image.storage_path);
  const metadata = await sharp(source).metadata();
  const sample = await sharp(source).rotate().resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true }).grayscale().raw().toBuffer({ resolveWithObject: true });
  const contrast = Math.sqrt(varianceFromBytes(sample.data));
  const tooSmall = (metadata.width || 0) * (metadata.height || 0) < 100000;
  const tooLowContrast = contrast < 10;
  const qualityState = tooSmall || tooLowContrast ? QUALITY_STATE.REVIEW_REQUIRED : QUALITY_STATE.ACCEPTABLE;
  const reason = tooSmall ? 'Image resolution is too low.' : tooLowContrast ? 'Label contrast is too low.' : null;
  return { qualityState, reason, metrics: { width: metadata.width, height: metadata.height, contrast: Number(contrast.toFixed(1)), orientation: metadata.orientation || 1 } };
}
async function prepareImage(image) {
  const quality = await evaluateImageQuality(image);
  if (quality.qualityState === QUALITY_STATE.REVIEW_REQUIRED) return { ...quality, processedPath: null, outputPath: null };
  const storedPath = image.ocr_storage_path && resolveStoredPath(image.ocr_storage_path);
  if (storedPath && fs.existsSync(storedPath)) return { ...quality, processedPath: storedPath, outputPath: image.ocr_storage_path };
  const outputDir = path.join(env.uploadDir, 'ocr'); fs.mkdirSync(outputDir, { recursive: true });
  const absoluteOutputPath = path.join(outputDir, `${image.id}.png`);
  await sharp(resolveStoredPath(image.storage_path)).rotate().resize({ width: OCR_WIDTH, withoutEnlargement: true }).grayscale().normalise().median(3).sharpen({ sigma: 1.2 }).png().toFile(absoluteOutputPath);
  logMemory(`after preprocessing image ${image.id}`);
  return { ...quality, processedPath: absoluteOutputPath, outputPath: toStoredPath(absoluteOutputPath), metrics: { ...quality.metrics, ocrWidth: OCR_WIDTH } };
}
function appendOcrData(summary, data, region) {
  for (const line of (data.text || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean)) summary.lines.add(line);
  if ((data.text || '').trim()) { summary.confidenceTotal += data.confidence || 0; summary.confidenceCount += 1; }
  for (const word of data.words || []) summary.words.push({ text: word.text, confidence: Number(((word.confidence || 0) / 100).toFixed(2)), boundingBox: word.bbox, region });
}
async function recognizePath(worker, imagePath, region, summary) {
  const { data } = await worker.recognize(imagePath);
  appendOcrData(summary, data, region);
}
async function recognizeRegions(worker, processedPath, imageId) {
  const summary = { lines: new Set(), words: [], confidenceTotal: 0, confidenceCount: 0 };
  await recognizePath(worker, processedPath, 'full', summary);
  const metadata = await sharp(processedPath).metadata();
  const width = metadata.width; const height = metadata.height;
  const tempDir = path.join(env.uploadDir, 'ocr', '.regions'); fs.mkdirSync(tempDir, { recursive: true });
  const regions = [
    ['top', { left: 0, top: 0, width, height: Math.floor(height * 0.58) }],
    ['bottom', { left: 0, top: Math.floor(height * 0.42), width, height: height - Math.floor(height * 0.42) }]
  ];
  for (const [region, crop] of regions) {
    const temporaryPath = path.join(tempDir, `${imageId}-${region}-${crypto.randomUUID()}.png`);
    try {
      await sharp(processedPath).extract(crop).png().toFile(temporaryPath);
      await recognizePath(worker, temporaryPath, region, summary);
    } finally {
      fs.rmSync(temporaryPath, { force: true });
    }
  }
  return { text: [...summary.lines].join('\n'), confidence: Number(((summary.confidenceCount ? summary.confidenceTotal / summary.confidenceCount : 0) / 100).toFixed(2)), words: summary.words };
}
async function readImages(images, { onProgress } = {}) {
  const results = []; let worker = null;
  try {
    for (const [index, image] of images.entries()) {
      try {
        onProgress?.(`before OCR image ${index + 1}`); logMemory(`before OCR image ${index + 1}`);
        const prepared = await prepareImage(image);
        if (prepared.qualityState === QUALITY_STATE.REVIEW_REQUIRED) { results.push({ imageId: image.id, state: 'RECAPTURE_RECOMMENDED', qualityState: prepared.qualityState, text: null, normalizedText: null, confidence: 0, boundingBoxes: [], quality: prepared.metrics, ocrStoragePath: null, reason: prepared.reason }); continue; }
        if (!worker) { logMemory('before Tesseract worker initialization'); worker = await createWorker('eng'); await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT }); logMemory('after Tesseract worker initialization'); }
        const ocr = await recognizeRegions(worker, prepared.processedPath, image.id);
        results.push({ imageId: image.id, state: 'COMPLETED', qualityState: prepared.qualityState, text: ocr.text, normalizedText: normalizeOcrText(ocr.text), confidence: ocr.confidence, boundingBoxes: ocr.words, quality: prepared.metrics, ocrStoragePath: prepared.outputPath, reason: null });
        onProgress?.(`after OCR image ${index + 1}`); logMemory(`after OCR image ${index + 1}`);
      } catch (error) {
        results.push({ imageId: image.id, state: 'OCR_UNAVAILABLE', qualityState: QUALITY_STATE.REVIEW_REQUIRED, text: null, normalizedText: null, confidence: 0, boundingBoxes: [], quality: null, ocrStoragePath: null, reason: `OCR could not run: ${error.message}` });
      }
    }
  } finally {
    if (worker) { await worker.terminate(); logMemory('after Tesseract worker termination'); }
  }
  return { state: results.some(item => item.state === 'COMPLETED') ? 'COMPLETED' : 'REVIEW_REQUIRED', images: results };
}
module.exports = { QUALITY_STATE, OCR_WIDTH, evaluateImageQuality, readImages, normalizeOcrText };
