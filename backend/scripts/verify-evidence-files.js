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
const references = [...images.flatMap(image => [image.storage_path, image.ocr_storage_path]).filter(Boolean), ...reports.map(report => report.storage_path)];
const resolved = references.map(storedPath => ({ storedPath, absolutePath: resolveStoredPath(storedPath) }));
const missing = resolved.filter(item => !fs.existsSync(item.absolutePath));
const files = listFiles(env.uploadDir).map(file => path.resolve(file));
const referenced = new Set(resolved.map(item => path.resolve(item.absolutePath)));
const orphanFiles = files.filter(file => !referenced.has(file));
console.log(JSON.stringify({
  database: env.databasePath,
  uploadDir: env.uploadDir,
  imageRecords: images.length,
  reportRecords: reports.length,
  referencedFiles: references.length,
  filesFound: references.length - missing.length,
  missingFiles: missing,
  uploadFiles: files.length,
  orphanFiles
}, null, 2));
process.exitCode = missing.length ? 2 : 0;
