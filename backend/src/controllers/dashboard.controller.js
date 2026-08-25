const db = require('../db/database');

function getStats(req, res) {
  const admin = ['MASTER_ADMIN', 'ADMIN'].includes(req.user.role);
  const params = admin ? [] : [req.user.sub];
  const clause = admin ? '' : ' WHERE officer_id = ?';
  const totalInspections = db.prepare(`SELECT COUNT(*) AS count FROM inspections${clause}`).get(...params).count;
  const stateRows = db.prepare(`SELECT state, COUNT(*) AS count FROM inspections${clause} GROUP BY state`).all(...params);
  const findingClause = admin ? '' : ' WHERE i.officer_id = ?';
  const findings = db.prepare(`SELECT f.status, COUNT(*) AS count FROM findings f JOIN inspections i ON i.id = f.inspection_id${findingClause} GROUP BY f.status`).all(...params);
  const reports = db.prepare(`SELECT COUNT(*) AS count FROM reports r JOIN inspections i ON i.id = r.inspection_id${findingClause} AND r.status = 'GENERATED'`).get(...params).count;
  const potentialIssues = db.prepare(`SELECT COUNT(*) AS count FROM findings f JOIN inspections i ON i.id = f.inspection_id${findingClause}${findingClause ? ' AND' : ' WHERE'} f.status = 'POTENTIAL_NON_COMPLIANCE'`).get(...params).count;
  const commonFindingCategories = db.prepare(`SELECT r.declaration_field AS field, COUNT(*) AS count FROM findings f JOIN inspections i ON i.id = f.inspection_id JOIN rules r ON r.id = f.rule_id${findingClause}${findingClause ? ' AND' : ' WHERE'} f.status IN ('POTENTIAL_NON_COMPLIANCE', 'REVIEW_REQUIRED') GROUP BY r.declaration_field ORDER BY count DESC LIMIT 5`).all(...params);
  const userStats = admin ? { pendingApprovals: db.prepare("SELECT COUNT(*) count FROM users WHERE account_status = 'PENDING_APPROVAL'").get().count, activeFieldOfficers: db.prepare("SELECT COUNT(*) count FROM users WHERE role = 'FIELD_OFFICER' AND account_status = 'APPROVED'").get().count, activeAdmins: db.prepare("SELECT COUNT(*) count FROM users WHERE role IN ('MASTER_ADMIN', 'ADMIN') AND account_status = 'APPROVED'").get().count } : null;
  res.json({ totalInspections, inspectionsByState: stateRows, findingsByStatus: findings, reports, potentialIssues, commonFindingCategories, userStats });
}

module.exports = { getStats };
