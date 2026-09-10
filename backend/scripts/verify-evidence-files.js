const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('../src/config/env');
const { resolveStoredPath } = require('../src/services/storage.service');

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  });
}

const db = new Database(env.databasePath, { readonly: true, fileMustExist: true });
const images = db.prepare('SELECT id, storage_path, ocr_storage_path FROM inspection_images').all();
const reports = db.prepare('SELECT id, storage_path FROM reports WHERE storage_path IS NOT NULL').all();
db.close();
const inspect = paths => paths.filter(Boolean).map(storedPath => ({ storedPath, absolutePath: resolveStoredPath(storedPath) }));
const originalReferences = inspect(images.map(image => image.storage_path));
const ocrDerivatives = inspect(images.map(image => image.ocr_storage_path));
const reportReferences = inspect(reports.map(report => report.storage_path));
const missing = entries => entries.filter(item => !fs.existsSync(item.absolutePath));
const missingOriginals = missing(originalReferences);
const missingReports = missing(reportReferences);
const missingOcrDerivatives = missing(ocrDerivatives);
const files = listFiles(env.uploadDir).map(file => path.resolve(file));
const referenced = new Set([...originalReferences, ...ocrDerivatives, ...reportReferences].map(item => path.resolve(item.absolutePath)));
const orphanFiles = files.filter(file => path.basename(file) !== '.gitkeep' && !referenced.has(file));
console.log(JSON.stringify({
  database: env.databasePath,
  uploadDir: env.uploadDir,
  imageRecords: images.length,
  reportRecords: reports.length,
  originals: { referenced: originalReferences.length, found: originalReferences.length - missingOriginals.length, missing: missingOriginals },
  reports: { referenced: reportReferences.length, found: reportReferences.length - missingReports.length, missing: missingReports },
  ocrDerivatives: { referenced: ocrDerivatives.length, found: ocrDerivatives.length - missingOcrDerivatives.length, missing: missingOcrDerivatives, note: 'OCR derivatives are optional; the source images and stored OCR text remain available.' },
  uploadFiles: files.length,
  orphanFiles
}, null, 2));
process.exitCode = missingOriginals.length || missingReports.length ? 2 : 0;
