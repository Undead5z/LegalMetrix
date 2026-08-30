const crypto = require('crypto');
const db = require('../db/database');

// Metadata deliberately holds operational context only; callers must not pass credentials, tokens, API keys, or secrets.
function logAuditEvent({ actorUserId = null, targetUserId = null, inspectionId = null, findingId = null, reportId = null, action, metadata = null }) {
  db.prepare(`INSERT INTO audit_logs (id, actor_user_id, target_user_id, inspection_id, finding_id, report_id, action, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(crypto.randomUUID(), actorUserId, targetUserId, inspectionId, findingId, reportId, action, metadata ? JSON.stringify(metadata) : null);
}
function logAccountAction({ actorUserId = null, targetUserId = null, action }) { logAuditEvent({ actorUserId, targetUserId, action }); }
module.exports = { logAuditEvent, logAccountAction };
