const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db/database');
const env = require('../config/env');
const { AppError } = require('../utils/http');
const { logAccountAction } = require('../services/audit-log.service');

const applications = z.enum(['WEB', 'MOBILE']);
const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1), application: applications });
const registrationFields = { fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().transform(value => value.toLowerCase()), phone: z.string().trim().regex(/^[0-9+()\s-]{7,25}$/, 'Provide a valid phone number.'), employeeId: z.string().trim().min(2).max(60), department: z.string().trim().min(2).max(160), designation: z.string().trim().min(2).max(120), password: z.string().min(8).max(128), confirmPassword: z.string().min(8).max(128) };
const withPasswordMatch = schema => schema.superRefine((data, context) => { if (data.password !== data.confirmPassword) context.addIssue({ code: z.ZodIssueCode.custom, path: ['confirmPassword'], message: 'Passwords do not match.' }); });
const officerRegistrationSchema = withPasswordMatch(z.object({ ...registrationFields, jurisdiction: z.string().trim().min(2).max(160) }));
const adminRegistrationSchema = withPasswordMatch(z.object(registrationFields));
const safeUser = user => ({ id: user.id, fullName: user.full_name, email: user.email, role: user.role, accountStatus: user.account_status, employeeId: user.employee_id, department: user.department, designation: user.designation, jurisdiction: user.jurisdiction || null });
function duplicateCheck(data) { if (db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(data.email)) throw new AppError(409, 'An account already exists for this official email.'); if (db.prepare('SELECT id FROM users WHERE employee_id = ?').get(data.employeeId)) throw new AppError(409, 'An account already exists for this Employee / Officer ID.'); }
function register(role, schema, successMessage) { return (req, res) => { const parsed = schema.safeParse(req.body); if (!parsed.success) throw new AppError(400, 'Registration details are invalid.', parsed.error.flatten()); const data = parsed.data; duplicateCheck(data); const id = crypto.randomUUID(); db.prepare(`INSERT INTO users (id, full_name, email, password_hash, role, account_status, employee_id, phone, department, designation, jurisdiction) VALUES (?, ?, ?, ?, ?, 'PENDING_APPROVAL', ?, ?, ?, ?, ?)`)
    .run(id, data.fullName, data.email, bcrypt.hashSync(data.password, 12), role, data.employeeId, data.phone, data.department, data.designation, role === 'FIELD_OFFICER' ? data.jurisdiction : null); logAccountAction({ targetUserId: id, action: 'USER_REGISTERED' }); res.status(201).json({ registration: { id, role, accountStatus: 'PENDING_APPROVAL', message: successMessage } }); }; }
function login(req, res) {
  const parsed = loginSchema.safeParse(req.body); if (!parsed.success) throw new AppError(400, 'Provide valid credentials and application type.', parsed.error.flatten()); const data = parsed.data;
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(data.email);
  if (!user || !bcrypt.compareSync(data.password, user.password_hash)) throw new AppError(401, 'Invalid email or password.');
  if (user.account_status === 'PENDING_APPROVAL') { logAccountAction({ targetUserId: user.id, action: 'LOGIN_DENIED_PENDING_APPROVAL' }); throw new AppError(403, 'Your account is awaiting administrator verification.'); }
  if (user.account_status === 'REJECTED') { logAccountAction({ targetUserId: user.id, action: 'LOGIN_DENIED_PENDING_APPROVAL' }); throw new AppError(403, 'Your registration was not approved. Contact the department administrator for assistance.'); }
  if (user.account_status === 'SUSPENDED') { logAccountAction({ targetUserId: user.id, action: 'LOGIN_DENIED_PENDING_APPROVAL' }); throw new AppError(403, 'Your account has been suspended. Contact the department administrator for assistance.'); }
  const admin = ['MASTER_ADMIN', 'ADMIN'].includes(user.role); const invalidPlatform = (data.application === 'WEB' && user.role === 'FIELD_OFFICER') || (data.application === 'MOBILE' && admin);
  if (invalidPlatform) { logAccountAction({ targetUserId: user.id, action: 'LOGIN_DENIED_ROLE' }); throw new AppError(403, user.role === 'FIELD_OFFICER' ? 'Field Officer accounts must use the LegalMetrix Field Inspection mobile application.' : 'Administrator accounts must use the LegalMetrix Web Command Centre.'); }
  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email, application: data.application }, env.jwtSecret, { expiresIn: '8h' }); logAccountAction({ actorUserId: user.id, targetUserId: user.id, action: 'LOGIN_SUCCESS' }); res.json({ token, user: safeUser(user) });
}
module.exports = { login, registerOfficer: register('FIELD_OFFICER', officerRegistrationSchema, 'Registration submitted successfully. Your Field Officer account must be verified by an authorized administrator before you can sign in.'), registerAdmin: register('ADMIN', adminRegistrationSchema, 'Administrator registration submitted. Approval from an existing authorized administrator is required before sign-in.') };
