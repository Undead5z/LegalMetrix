const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('./database');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Rebuild only the legacy users table when its old role CHECK constraint cannot represent MVP roles.
const userTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get()?.sql || '';
if (!userTableSql.includes('MASTER_ADMIN')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`CREATE TABLE users_migrated (
    id TEXT PRIMARY KEY, full_name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('MASTER_ADMIN', 'ADMIN', 'FIELD_OFFICER')),
    account_status TEXT NOT NULL CHECK (account_status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUSPENDED')) DEFAULT 'PENDING_APPROVAL',
    employee_id TEXT UNIQUE, phone TEXT, department TEXT, designation TEXT, jurisdiction TEXT,
    approved_by TEXT REFERENCES users_migrated(id), approved_at TEXT, rejected_by TEXT REFERENCES users_migrated(id), rejected_at TEXT, reviewer_note TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  INSERT INTO users_migrated (id, full_name, email, password_hash, role, account_status, created_at, updated_at)
  SELECT id, full_name, lower(email), password_hash,
    CASE WHEN lower(email) = 'admin@legalmetrix.local' THEN 'MASTER_ADMIN' WHEN role = 'OFFICER' THEN 'FIELD_OFFICER' ELSE 'ADMIN' END,
    'APPROVED', created_at, updated_at FROM users;
  DROP TABLE users;
  ALTER TABLE users_migrated RENAME TO users;`);
  db.pragma('foreign_keys = ON');
}

// Rebuild the small audit table when adding a newly auditable account action.
const auditTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'audit_logs'").get()?.sql || '';
if (!auditTableSql.includes('USER_DETAILS_UPDATED')) {
  db.pragma('foreign_keys = OFF');
  db.exec(`CREATE TABLE audit_logs_migrated (
    id TEXT PRIMARY KEY, actor_user_id TEXT REFERENCES users(id), target_user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL CHECK (action IN ('USER_REGISTERED', 'USER_DETAILS_UPDATED', 'USER_APPROVED', 'USER_REJECTED', 'USER_SUSPENDED', 'USER_REACTIVATED', 'LOGIN_SUCCESS', 'LOGIN_DENIED_PENDING_APPROVAL', 'LOGIN_DENIED_ROLE')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); INSERT INTO audit_logs_migrated SELECT id, actor_user_id, target_user_id, action, created_at FROM audit_logs; DROP TABLE audit_logs; ALTER TABLE audit_logs_migrated RENAME TO audit_logs; CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_user_id, created_at);`);
  db.pragma('foreign_keys = ON');
}

// Additive migration for OCR metadata on databases created by earlier MVP runs.
const ensureColumn = (table, column, definition) => {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};
ensureColumn('inspection_images', 'quality_reason', 'TEXT');
ensureColumn('inspection_images', 'ocr_text', 'TEXT');
ensureColumn('inspection_images', 'ocr_confidence', 'REAL');
ensureColumn('inspection_images', 'ocr_status', 'TEXT');
ensureColumn('inspection_images', 'ocr_error', 'TEXT');
ensureColumn('inspection_images', 'normalized_ocr_text', 'TEXT');
ensureColumn('inspection_images', 'ocr_storage_path', 'TEXT');
ensureColumn('inspection_images', 'preprocessing_json', 'TEXT');
ensureColumn('declarations', 'extraction_state', "TEXT NOT NULL DEFAULT 'NOT_DETECTED'");
ensureColumn('declarations', 'ocr_evidence', 'TEXT');
ensureColumn('declarations', 'extraction_source', "TEXT NOT NULL DEFAULT 'DETERMINISTIC'");
ensureColumn('inspections', 'ai_extraction_json', 'TEXT');
ensureColumn('inspections', 'ai_diagnostics_json', 'TEXT');
ensureColumn('inspections', 'vision_extraction_json', 'TEXT');
ensureColumn('inspections', 'vision_diagnostics_json', 'TEXT');
ensureColumn('inspections', 'vision_cache_key', 'TEXT');
ensureColumn('inspections', 'vision_completed_at', 'TEXT');
ensureColumn('inspections', 'admin_decision', "TEXT CHECK (admin_decision IN ('VERIFIED', 'POTENTIAL_ISSUE', 'PRODUCT_REJECTED'))");
ensureColumn('inspections', 'admin_decision_comment', 'TEXT');
ensureColumn('inspections', 'admin_decision_finding_id', 'TEXT REFERENCES findings(id)');
ensureColumn('inspections', 'admin_decision_finding_ids_json', 'TEXT');
ensureColumn('inspections', 'admin_decided_by', 'TEXT REFERENCES users(id)');
ensureColumn('inspections', 'admin_decided_at', 'TEXT');
ensureColumn('declarations', 'visual_evidence_description', 'TEXT');
ensureColumn('declarations', 'ocr_candidate_json', 'TEXT');
ensureColumn('declarations', 'vision_candidate_json', 'TEXT');
ensureColumn('users', 'account_status', "TEXT NOT NULL DEFAULT 'PENDING_APPROVAL'");
ensureColumn('users', 'employee_id', 'TEXT');
ensureColumn('users', 'phone', 'TEXT');
ensureColumn('users', 'department', 'TEXT');
ensureColumn('users', 'designation', 'TEXT');
ensureColumn('users', 'jurisdiction', 'TEXT');
ensureColumn('users', 'approved_by', 'TEXT');
ensureColumn('users', 'approved_at', 'TEXT');
ensureColumn('users', 'rejected_by', 'TEXT');
ensureColumn('users', 'rejected_at', 'TEXT');
ensureColumn('users', 'reviewer_note', 'TEXT');
ensureColumn('rules', 'name', 'TEXT');
ensureColumn('rules', 'effective_to', 'TEXT');
ensureColumn('rules', 'validation_type', 'TEXT');
// Backfill diagnostics for analyses performed before per-image OCR status/error fields existed.
db.prepare("UPDATE inspection_images SET ocr_status = CASE WHEN ocr_text IS NOT NULL THEN 'COMPLETED' WHEN quality_state = 'REVIEW_REQUIRED' THEN 'RECAPTURE_RECOMMENDED' ELSE NULL END, ocr_error = CASE WHEN quality_state = 'REVIEW_REQUIRED' THEN quality_reason ELSE NULL END WHERE ocr_status IS NULL").run();

const seedUser = (fullName, email, password, role, employeeId) => {
  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO users (id, full_name, email, password_hash, role, account_status, employee_id, approved_at)
    VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, CURRENT_TIMESTAMP)`)
    .run(id, fullName, email.toLowerCase(), bcrypt.hashSync(password, 12), role, employeeId);
  return id;
};

// Development-only credentials. Change or remove these before any deployment.
const masterEmail = 'admin@legalmetrix.local';
seedUser('LegalMetrix Master Admin', masterEmail, 'Admin@123', 'MASTER_ADMIN', 'MA-0001');
db.prepare("UPDATE users SET role = 'ADMIN', account_status = 'APPROVED' WHERE role = 'MASTER_ADMIN' AND lower(email) <> ?").run(masterEmail);
db.prepare("UPDATE users SET role = 'MASTER_ADMIN', account_status = 'APPROVED', employee_id = COALESCE(employee_id, 'MA-0001'), approved_by = NULL, rejected_by = NULL, rejected_at = NULL, reviewer_note = NULL, approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP) WHERE lower(email) = ?").run(masterEmail);
seedUser('Field Officer', 'officer@legalmetrix.local', 'Officer@123', 'FIELD_OFFICER', 'FO-0001');
db.prepare("UPDATE users SET role = 'FIELD_OFFICER', account_status = 'APPROVED', employee_id = COALESCE(employee_id, 'FO-0001'), approved_at = COALESCE(approved_at, CURRENT_TIMESTAMP) WHERE lower(email) = 'officer@legalmetrix.local'").run();
db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_one_master_admin ON users(role) WHERE role = 'MASTER_ADMIN'; CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id) WHERE employee_id IS NOT NULL;");

const rules = require('../config/mvp-rules');
const upsertRule = db.prepare(`INSERT INTO rules (id, rule_code, name, declaration_field, requirement, applicability, legal_reference, version, effective_date, effective_to, validation_type, validation_logic, status)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
  ON CONFLICT(rule_code) DO UPDATE SET name=excluded.name, requirement=excluded.requirement, applicability=excluded.applicability, legal_reference=excluded.legal_reference, version=excluded.version, effective_date=excluded.effective_date, effective_to=excluded.effective_to, validation_type=excluded.validation_type, validation_logic=excluded.validation_logic, status='ACTIVE', updated_at=CURRENT_TIMESTAMP`);
rules.forEach(rule => upsertRule.run(crypto.randomUUID(), rule.ruleCode, rule.name, rule.field, rule.requirement, rule.applicability, rule.legalReference, rule.version, rule.effectiveFrom, rule.effectiveTo, rule.validationType, JSON.stringify({ validationType: rule.validationType })));

console.log('LegalMetrix SQLite schema initialized, development users and MVP rules seeded.');
