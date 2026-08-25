const crypto = require('crypto');
const db = require('../db/database');

function logAccountAction({ actorUserId = null, targetUserId = null, action }) {
  db.prepare('INSERT INTO audit_logs (id, actor_user_id, target_user_id, action) VALUES (?, ?, ?, ?)')
    .run(crypto.randomUUID(), actorUserId, targetUserId, action);
}
module.exports = { logAccountAction };
