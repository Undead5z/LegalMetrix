const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { evaluateImageQuality, QUALITY_STATE } = require('../src/services/ocr.service');

async function createRawImage(filePath, width, height, pixel) {
  await sharp(Buffer.alloc(width * height * 3, pixel), { raw: { width, height, channels: 3 } }).jpeg().toFile(filePath);
}

async function main() {
  const uploads = path.resolve(__dirname, '../uploads');
  const names = ['tiny', 'flat', 'contrast'].map(name => path.join(uploads, `quality-test-${crypto.randomUUID()}-${name}.jpg`));
  try {
    await createRawImage(names[0], 50, 50, 100);
    await createRawImage(names[1], 400, 400, 128);
    const pixels = Buffer.alloc(400 * 400 * 3);
    for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) { const value = x < 200 ? 20 : 235; const index = (y * 400 + x) * 3; pixels[index] = pixels[index + 1] = pixels[index + 2] = value; }
    await sharp(pixels, { raw: { width: 400, height: 400, channels: 3 } }).jpeg().toFile(names[2]);
    const relative = filePath => `uploads/${path.basename(filePath)}`;
    const tiny = await evaluateImageQuality({ storage_path: relative(names[0]) });
    const flat = await evaluateImageQuality({ storage_path: relative(names[1]) });
    const contrast = await evaluateImageQuality({ storage_path: relative(names[2]) });
    assert.equal(tiny.qualityState, QUALITY_STATE.REVIEW_REQUIRED);
    assert.match(tiny.reason, /resolution/i);
    assert.equal(flat.qualityState, QUALITY_STATE.REVIEW_REQUIRED);
    assert.match(flat.reason, /contrast/i);
    assert.equal(contrast.qualityState, QUALITY_STATE.ACCEPTABLE);
    console.log('Image-quality tests passed.');
  } finally {
    names.forEach(file => fs.rmSync(file, { force: true }));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
