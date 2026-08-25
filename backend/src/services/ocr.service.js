const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { recognize, PSM } = require('tesseract.js');

function variance(values) { const mean = values.reduce((a, b) => a + b, 0) / values.length; return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length; }
function normalizeOcrText(text = '') {
  return text.replace(/\bN[E3]T\s*QUA[NM][T1I]?(?:[T1I]TY)?\b/gi, 'NET QUANTITY')
    .replace(/\bM\s*\.?\s*R\s*\.?\s*P\s*\.?\b/gi, 'MRP')
    .replace(/\bMANUFA[CG]TUR(?:ED|ER)?\b/gi, 'MANUFACTURED')
    .replace(/\bCONSUME[R8]\s*CA[R8]E\b/gi, 'CONSUMER CARE')
    .replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
async function prepareImage(image) {
  const source = path.resolve(__dirname, '../..', image.storage_path);
  const metadata = await sharp(source).metadata();
  // This derivative is OCR-only. The original uploaded evidence is never modified.
  const processed = await sharp(source).rotate().resize({ width: 3000, withoutEnlargement: false }).grayscale().normalise().median(3).sharpen({ sigma: 1.2 }).png().toBuffer();
  const outputDir = path.resolve(__dirname, '../../uploads/ocr'); fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${image.id}.png`); await fs.promises.writeFile(outputPath, processed);
  const sample = await sharp(processed).resize({ width: 160, height: 160, fit: 'inside', withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
  const pixels = [...sample.data]; const contrast = Math.sqrt(variance(pixels)); const tooSmall = (metadata.width || 0) * (metadata.height || 0) < 100000;
  return { processed, outputPath: path.relative(path.resolve(__dirname, '../..'), outputPath).replace(/\\/g, '/'), metrics: { width: metadata.width, height: metadata.height, ocrWidth: 3000, contrast: Number(contrast.toFixed(1)), orientation: metadata.orientation || 1 }, inadequate: tooSmall || contrast < 10, reason: tooSmall ? 'Image resolution is too low.' : contrast < 10 ? 'Label contrast is too low.' : null };
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
    if (prepared.inadequate) { results.push({ imageId: image.id, state: 'RECAPTURE_RECOMMENDED', text: null, normalizedText: null, confidence: 0, boundingBoxes: [], quality: prepared.metrics, ocrStoragePath: prepared.outputPath, reason: prepared.reason }); continue; }
    const ocr = await recognizeRegions(prepared.processed);
    results.push({ imageId: image.id, state: 'COMPLETED', text: ocr.text, normalizedText: normalizeOcrText(ocr.text), confidence: ocr.confidence, boundingBoxes: ocr.words, quality: prepared.metrics, ocrStoragePath: prepared.outputPath, reason: null });
  } catch (error) { results.push({ imageId: image.id, state: 'OCR_UNAVAILABLE', text: null, normalizedText: null, confidence: 0, boundingBoxes: [], quality: null, ocrStoragePath: null, reason: `OCR could not run: ${error.message}` }); }
  return { state: results.some(x => x.state === 'COMPLETED') ? 'COMPLETED' : 'REVIEW_REQUIRED', images: results };
}
module.exports = { readImages, normalizeOcrText };
