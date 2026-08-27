const jwt = require('jsonwebtoken');
const db = require('../db/database');
const env = require('../config/env');
const { AppError } = require('../utils/http');

const ADMIN_ROLES = ['MASTER_ADMIN', 'ADMIN'];
function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''; const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AppError(401, 'Authentication is required.'));
  try { req.user = jwt.verify(token, env.jwtSecret); next(); } catch { next(new AppError(401, 'Your session is invalid or has expired.')); }
}
function requireApprovedAccount(req, res, next) {
  const account = db.prepare('SELECT id, full_name, email, role, account_status FROM users WHERE id = ?').get(req.user?.sub);
  if (!account) return next(new AppError(401, 'Your account is no longer available.'));
  if (account.account_status === 'PENDING_APPROVAL') return next(new AppError(403, 'Your account is awaiting administrator verification.'));
  if (account.account_status === 'REJECTED') return next(new AppError(403, 'Your registration was not approved. Contact the department administrator for assistance.'));
  if (account.account_status === 'SUSPENDED') return next(new AppError(403, 'Your account has been suspended. Contact the department administrator for assistance.'));
  if (account.account_status !== 'APPROVED') return next(new AppError(403, 'Your account is not approved for access.'));
  req.user = { sub: account.id, email: account.email, role: account.role, fullName: account.full_name }; next();
}
function allowRoles(...roles) { return (req, res, next) => roles.includes(req.user.role) ? next() : next(new AppError(403, 'You do not have permission to perform this action.')); }
const requireAdmin = allowRoles(...ADMIN_ROLES);
const requireFieldOfficer = allowRoles('FIELD_OFFICER');
const requireFieldOrAdmin = allowRoles('FIELD_OFFICER', ...ADMIN_ROLES);
module.exports = { requireAuth, requireApprovedAccount, allowRoles, requireAdmin, requireFieldOfficer, requireFieldOrAdmin, ADMIN_ROLES };
