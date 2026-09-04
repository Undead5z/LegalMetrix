const assert = require('assert');
const fs = require('fs');
const path = require('path');

const testDb = path.join(__dirname, '../data/round2-workflow-test.db');
for (const suffix of ['', '-wal', '-shm', '.pre-round2-backup']) { try { fs.rmSync(`${testDb}${suffix}`); } catch {} }
process.env.DATABASE_PATH = './data/round2-workflow-test.db';
process.env.NODE_ENV = 'test';
require('../src/db/init');
const db = require('../src/db/database');
const inspection = require('../src/controllers/inspection.controller');
const dashboard = require('../src/controllers/dashboard.controller');

const response = () => ({ code: 200, body: null, status(code) { this.code = code; return this; }, json(value) { this.body = value; return value; } });
const expectAppError = (fn, message) => { try { fn(); assert.fail('Expected an AppError'); } catch (error) { assert.equal(error.statusCode, 409); assert.match(error.message, new RegExp(message)); } };

async function main() {
const officer = db.prepare("SELECT id FROM users WHERE email = 'officer@legalmetrix.local'").get();
const admin = db.prepare("SELECT id FROM users WHERE email = 'admin@legalmetrix.local'").get();
const standardAdmin = { id: '00000000-0000-4000-8000-000000000010', role: 'ADMIN' };
db.prepare("INSERT INTO users (id, full_name, email, password_hash, role, account_status) VALUES (?, ?, ?, ?, ?, 'APPROVED')").run(standardAdmin.id, 'Workflow Admin', 'workflow-admin@legalmetrix.local', 'test-only', standardAdmin.role);
const productId = '10000000-0000-4000-8000-000000000001';
const inspectionId = '20000000-0000-4000-8000-000000000001';
const findingOne = '30000000-0000-4000-8000-000000000001';
const findingTwo = '30000000-0000-4000-8000-000000000002';
db.prepare('INSERT INTO products (id, product_name) VALUES (?, ?)').run(productId, 'Workflow test product');
db.prepare("INSERT INTO inspections (id, inspection_number, product_id, officer_id, state) VALUES (?, ?, ?, ?, 'PENDING_REVIEW')").run(inspectionId, 'LM-TEST-WORKFLOW', productId, officer.id);
for (const id of [findingOne, findingTwo]) db.prepare("INSERT INTO findings (id, inspection_id, status, message) VALUES (?, ?, 'PASS', ?)").run(id, inspectionId, `Finding ${id}`);

// An administrator cannot skip the Field Officer stage.
try { await inspection.setAdminDecision({ params: { id: inspectionId }, user: { sub: admin.id, role: 'MASTER_ADMIN' }, body: { decision: 'VERIFIED' } }, response()); assert.fail('Expected admin decision to be blocked before Field Officer review'); } catch (error) { assert.equal(error.statusCode, 409); }

inspection.reviewFinding({ params: { id: findingOne }, user: { sub: officer.id, role: 'FIELD_OFFICER' }, body: { officerDecision: 'CONFIRMED' } }, response());
assert.equal(db.prepare('SELECT state FROM inspections WHERE id = ?').get(inspectionId).state, 'PENDING_REVIEW');
inspection.reviewFinding({ params: { id: findingTwo }, user: { sub: officer.id, role: 'FIELD_OFFICER' }, body: { officerDecision: 'CONFIRMED' } }, response());
assert.equal(db.prepare('SELECT state FROM inspections WHERE id = ?').get(inspectionId).state, 'OFFICER_REVIEW_COMPLETED');
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM findings WHERE inspection_id = ? AND reviewed_by = ? AND reviewed_at IS NOT NULL').get(inspectionId, officer.id).count, 2);
assert.equal(db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE inspection_id = ? AND action = 'OFFICER_REVIEW_COMPLETED'").get(inspectionId).count, 1);

// Admins can correct an individual finding after Field Officer completion; the audit identifies the Admin actor.
inspection.reviewFinding({ params: { id: findingOne }, user: { sub: admin.id, role: 'MASTER_ADMIN' }, body: { officerDecision: 'REJECTED', officerComment: 'Administrative evidence review.' } }, response());
assert.equal(db.prepare('SELECT reviewed_by FROM findings WHERE id = ?').get(findingOne).reviewed_by, admin.id);
assert.equal(JSON.parse(db.prepare("SELECT metadata_json FROM audit_logs WHERE finding_id = ? AND action = 'FINDING_REJECTED' ORDER BY created_at DESC LIMIT 1").get(findingOne).metadata_json).actorRole, 'MASTER_ADMIN');

await inspection.setAdminDecision({ params: { id: inspectionId }, user: { sub: admin.id, role: 'MASTER_ADMIN' }, body: { decision: 'VERIFIED' } }, response());
assert.equal(db.prepare('SELECT state FROM inspections WHERE id = ?').get(inspectionId).state, 'VERIFIED');
assert.equal(db.prepare('SELECT admin_decision FROM inspections WHERE id = ?').get(inspectionId).admin_decision, 'VERIFIED');

// An administrator may still correct a finding after a final decision; the final state is preserved.
inspection.reviewFinding({ params: { id: findingTwo }, user: { sub: admin.id, role: 'MASTER_ADMIN' }, body: { officerDecision: 'REJECTED', officerComment: 'Post-decision administrative correction.' } }, response());
assert.equal(db.prepare('SELECT state FROM inspections WHERE id = ?').get(inspectionId).state, 'VERIFIED');
assert.equal(db.prepare('SELECT reviewed_by FROM findings WHERE id = ?').get(findingTwo).reviewed_by, admin.id);

// An authorized Admin may manually verify despite automated findings, preserving the finding and override audit metadata.
const productTwo = '10000000-0000-4000-8000-000000000002'; const inspectionTwo = '20000000-0000-4000-8000-000000000002'; const issueFinding = '30000000-0000-4000-8000-000000000003';
db.prepare('INSERT INTO products (id, product_name) VALUES (?, ?)').run(productTwo, 'Unresolved finding test');
db.prepare("INSERT INTO inspections (id, inspection_number, product_id, officer_id, state) VALUES (?, ?, ?, ?, 'OFFICER_REVIEW_COMPLETED')").run(inspectionTwo, 'LM-TEST-UNRESOLVED', productTwo, officer.id);
db.prepare("INSERT INTO findings (id, inspection_id, status, message, officer_decision, reviewed_by, reviewed_at) VALUES (?, ?, 'POTENTIAL_NON_COMPLIANCE', ?, 'CONFIRMED', ?, CURRENT_TIMESTAMP)").run(issueFinding, inspectionTwo, 'Potential issue remains', officer.id);
db.prepare("INSERT INTO declarations (id, inspection_id, field_name, value, detection_state, confidence, extraction_state, ocr_evidence) VALUES (?, ?, 'mrp', NULL, 'NOT_DETECTED', .42, 'NEEDS_REVIEW', 'Unreadable OCR candidate')").run('40000000-0000-4000-8000-000000000002', inspectionTwo);
await inspection.setAdminDecision({ params: { id: inspectionTwo }, user: { sub: admin.id, role: 'MASTER_ADMIN' }, body: { decision: 'VERIFIED', comment: 'MRP confirmed by manual evidence review.' } }, response());
assert.equal(db.prepare('SELECT state FROM inspections WHERE id = ?').get(inspectionTwo).state, 'VERIFIED');
assert.equal(db.prepare('SELECT officer_decision FROM findings WHERE id = ?').get(issueFinding).officer_decision, 'CONFIRMED');
assert.deepEqual(db.prepare("SELECT value, detection_state, confidence, extraction_state, ocr_evidence FROM declarations WHERE inspection_id = ? AND field_name = 'mrp'").get(inspectionTwo), { value: null, detection_state: 'NOT_DETECTED', confidence: .42, extraction_state: 'NEEDS_REVIEW', ocr_evidence: 'Unreadable OCR candidate' });
assert.equal(db.prepare('SELECT admin_decision_comment FROM inspections WHERE id = ?').get(inspectionTwo).admin_decision_comment, 'MRP confirmed by manual evidence review.');
const overrideAudit = JSON.parse(db.prepare("SELECT metadata_json FROM audit_logs WHERE inspection_id = ? AND action = 'ADMIN_DECISION_RECORDED' ORDER BY created_at DESC LIMIT 1").get(inspectionTwo).metadata_json);
assert.equal(overrideAudit.manualOverride, true);
assert.equal(overrideAudit.finalDecision, 'VERIFIED');
assert.ok(overrideAudit.automatedFindingsRemaining > 0);

// Field Officers are forbidden from final administrative decisions, even when they own the inspection.
try { await inspection.setAdminDecision({ params: { id: inspectionTwo }, user: { sub: officer.id, role: 'FIELD_OFFICER' }, body: { decision: 'VERIFIED' } }, response()); assert.fail('Expected Field Officer final decision to be forbidden'); } catch (error) { assert.equal(error.statusCode, 403); }

// A conflicting OCR/Vision candidate also remains visible but does not remove authorized Admin authority.
const productThree = '10000000-0000-4000-8000-000000000003'; const inspectionThree = '20000000-0000-4000-8000-000000000003';
db.prepare('INSERT INTO products (id, product_name) VALUES (?, ?)').run(productThree, 'Extraction conflict test');
db.prepare("INSERT INTO inspections (id, inspection_number, product_id, officer_id, state) VALUES (?, ?, ?, ?, 'OFFICER_REVIEW_COMPLETED')").run(inspectionThree, 'LM-TEST-CONFLICT', productThree, officer.id);
db.prepare("INSERT INTO declarations (id, inspection_id, field_name, extraction_state) VALUES (?, ?, 'mrp', 'NEEDS_REVIEW')").run('40000000-0000-4000-8000-000000000001', inspectionThree);
await inspection.setAdminDecision({ params: { id: inspectionThree }, user: { sub: admin.id, role: 'MASTER_ADMIN' }, body: { decision: 'VERIFIED', comment: 'Conflict resolved by direct evidence inspection.' } }, response());
assert.equal(db.prepare('SELECT state FROM inspections WHERE id = ?').get(inspectionThree).state, 'VERIFIED');

// Final potential statuses are filterable and the dashboard counts each inspection once, even with preliminary findings.
const productFour = '10000000-0000-4000-8000-000000000004'; const inspectionFour = '20000000-0000-4000-8000-000000000004';
db.prepare('INSERT INTO products (id, product_name) VALUES (?, ?)').run(productFour, 'Escalated test');
db.prepare("INSERT INTO inspections (id, inspection_number, product_id, officer_id, state, admin_decision) VALUES (?, ?, ?, ?, 'ESCALATED_FOR_ENFORCEMENT_REVIEW', 'ESCALATED_FOR_ENFORCEMENT_REVIEW')").run(inspectionFour, 'LM-TEST-ESCALATED', productFour, officer.id);
const filtered = response(); inspection.listInspections({ query: { state: 'ESCALATED_FOR_ENFORCEMENT_REVIEW' }, user: { sub: admin.id, role: 'MASTER_ADMIN' } }, filtered);
assert.deepEqual(filtered.body.inspections.map(item => item.id), [inspectionFour]);
const stats = response(); dashboard.getStats({ user: { sub: admin.id, role: 'MASTER_ADMIN' } }, stats);
assert.equal(stats.body.potentialIssues, 2);

// Confirmed potential non-compliance has the same normalized list/dashboard treatment as escalation.
const productSix = '10000000-0000-4000-8000-000000000006'; const inspectionSix = '20000000-0000-4000-8000-000000000006';
db.prepare('INSERT INTO products (id, product_name) VALUES (?, ?)').run(productSix, 'Confirmed potential test');
db.prepare("INSERT INTO inspections (id, inspection_number, product_id, officer_id, state, admin_decision) VALUES (?, ?, ?, ?, 'POTENTIAL_NON_COMPLIANCE_CONFIRMED', 'POTENTIAL_NON_COMPLIANCE_CONFIRMED')").run(inspectionSix, 'LM-TEST-CONFIRMED', productSix, officer.id);
for (const [state, inspectionIdForState] of [['VERIFIED', inspectionId], ['ESCALATED_FOR_ENFORCEMENT_REVIEW', inspectionFour], ['POTENTIAL_NON_COMPLIANCE_CONFIRMED', inspectionSix]]) {
  const stateResponse = response(); inspection.listInspections({ query: { state }, user: { sub: admin.id, role: 'MASTER_ADMIN' } }, stateResponse);
  assert.ok(stateResponse.body.inspections.some(item => item.id === inspectionIdForState));
  const stateStats = response(); dashboard.getStats({ user: { sub: admin.id, role: 'MASTER_ADMIN' } }, stateStats);
  assert.ok(stateStats.body.inspectionsByState.some(item => item.state === state));
}
const refreshedStats = response(); dashboard.getStats({ user: { sub: admin.id, role: 'MASTER_ADMIN' } }, refreshedStats);
assert.equal(refreshedStats.body.potentialIssues, 3);

// A standard ADMIN has the same finding-review and final-decision authority as MASTER_ADMIN.
const productFive = '10000000-0000-4000-8000-000000000005'; const inspectionFive = '20000000-0000-4000-8000-000000000005'; const findingFive = '30000000-0000-4000-8000-000000000005';
db.prepare('INSERT INTO products (id, product_name) VALUES (?, ?)').run(productFive, 'Standard Admin test');
db.prepare("INSERT INTO inspections (id, inspection_number, product_id, officer_id, state) VALUES (?, ?, ?, ?, 'OFFICER_REVIEW_COMPLETED')").run(inspectionFive, 'LM-TEST-ADMIN', productFive, officer.id);
db.prepare("INSERT INTO findings (id, inspection_id, status, message, officer_decision) VALUES (?, ?, 'PASS', ?, 'CONFIRMED')").run(findingFive, inspectionFive, 'Admin review test');
inspection.reviewFinding({ params: { id: findingFive }, user: { sub: standardAdmin.id, role: standardAdmin.role }, body: { officerDecision: 'REJECTED' } }, response());
assert.equal(db.prepare('SELECT reviewed_by FROM findings WHERE id = ?').get(findingFive).reviewed_by, standardAdmin.id);
await inspection.setAdminDecision({ params: { id: inspectionFive }, user: { sub: standardAdmin.id, role: standardAdmin.role }, body: { decision: 'VERIFIED' } }, response());
assert.equal(db.prepare('SELECT admin_decision FROM inspections WHERE id = ?').get(inspectionFive).admin_decision, 'VERIFIED');
console.log('Workflow ownership and manual override tests passed.');
db.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
