const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const env = require('../config/env');

const incomingDir = path.join(path.dirname(env.databasePath), '.incoming');
const sourcePath = path.join(incomingDir, 'legalmetrix.db');
const markerPath = path.join(incomingDir, 'IMPORT_NOW');
const requiredTables = ['users', 'inspections', 'inspection_images', 'findings', 'declarations', 'audit_logs'];

function inspectDatabase(databasePath) {
  if (!fs.existsSync(databasePath)) throw new Error(`Database file does not exist: ${databasePath}`);
  const source = new Database(databasePath, { readonly: true, fileMustExist: true });
  try {
    const integrity = source.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error(`SQLite integrity check failed: ${integrity}`);
    const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
    for (const table of requiredTables) if (!tables.has(table)) throw new Error(`Source database is missing table: ${table}`);
    const counts = Object.fromEntries(requiredTables.map(table => [table, source.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count]));
    if (!counts.users || !counts.inspections || !counts.inspection_images) throw new Error('Source database does not contain users, inspections, and evidence images.');
    return counts;
  } finally {
    source.close();
  }
}

function importPendingDatabase() {
  if (!fs.existsSync(markerPath)) return null;
  const counts = inspectDatabase(sourcePath);
  fs.mkdirSync(path.dirname(env.databasePath), { recursive: true });
  const tempPath = `${env.databasePath}.import-${crypto.randomUUID()}.tmp`;
  const backupPath = fs.existsSync(env.databasePath) ? `${env.databasePath}.pre-import-${Date.now()}` : null;
  try {
    if (backupPath) fs.copyFileSync(env.databasePath, backupPath);
    fs.copyFileSync(sourcePath, tempPath);
    // This executes before the application opens its SQLite connection. Removing
    // stale sidecars here prevents an old WAL from being applied to the new DB.
    fs.rmSync(`${env.databasePath}-wal`, { force: true });
    fs.rmSync(`${env.databasePath}-shm`, { force: true });
    fs.renameSync(tempPath, env.databasePath);
    const verified = inspectDatabase(env.databasePath);
    fs.rmSync(markerPath, { force: true });
    fs.rmSync(sourcePath, { force: true });
    return { imported: true, counts: verified, backupPath };
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

module.exports = { incomingDir, sourcePath, markerPath, inspectDatabase, importPendingDatabase };
