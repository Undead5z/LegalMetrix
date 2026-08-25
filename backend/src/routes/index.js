const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const { requireAuth, requireApprovedAccount, requireAdmin, requireFieldOrAdmin } = require('../middleware/auth');
const auth = require('../controllers/auth.controller');
const inspection = require('../controllers/inspection.controller');
const dashboard = require('../controllers/dashboard.controller');
const users = require('../controllers/user.controller');
const { AppError } = require('../utils/http');

const router = express.Router();
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
fs.mkdirSync(env.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, env.uploadDir),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 6 },
  fileFilter: (req, file, cb) => (/^image\/(jpeg|png|webp)$/.test(file.mimetype)
    ? cb(null, true)
    : cb(new AppError(400, 'Only JPEG, PNG, and WebP image uploads are supported.')))
});

router.post('/auth/login', asyncHandler(auth.login));
router.post('/auth/register/officer', asyncHandler(auth.registerOfficer));
router.post('/auth/register/admin', asyncHandler(auth.registerAdmin));

const authenticated = [requireAuth, requireApprovedAccount];
router.get('/dashboard/stats', ...authenticated, requireAdmin, asyncHandler(dashboard.getStats));
router.get('/users', ...authenticated, requireAdmin, asyncHandler(users.listUsers));
router.get('/users/pending', ...authenticated, requireAdmin, asyncHandler(users.pendingUsers));
router.get('/users/:id', ...authenticated, requireAdmin, asyncHandler(users.userDetail));
router.patch('/users/:id/details', ...authenticated, requireAdmin, asyncHandler(users.updateDetails));
router.patch('/users/:id/approve', ...authenticated, requireAdmin, asyncHandler(users.approve));
router.patch('/users/:id/reject', ...authenticated, requireAdmin, asyncHandler(users.reject));
router.patch('/users/:id/suspend', ...authenticated, requireAdmin, asyncHandler(users.suspend));
router.patch('/users/:id/remove', ...authenticated, requireAdmin, asyncHandler(users.remove));
router.patch('/users/:id/reactivate', ...authenticated, requireAdmin, asyncHandler(users.reactivate));

router.post('/inspections', ...authenticated, requireFieldOrAdmin, asyncHandler(inspection.createInspection));
router.get('/inspections', ...authenticated, requireFieldOrAdmin, asyncHandler(inspection.listInspections));
router.get('/inspections/:id', ...authenticated, requireFieldOrAdmin, asyncHandler(inspection.getInspection));
router.delete('/inspections/:id', ...authenticated, requireFieldOrAdmin, asyncHandler(inspection.deleteInspection));
router.get('/inspections/:id/images/:imageId/file', ...authenticated, requireFieldOrAdmin, asyncHandler(inspection.getImageFile));
router.post('/inspections/:id/images', ...authenticated, requireFieldOrAdmin, upload.array('images', 6), asyncHandler(inspection.addImages));
router.post('/inspections/:id/analyze', ...authenticated, requireFieldOrAdmin, asyncHandler(inspection.analyzeInspection));
router.patch('/findings/:id/review', ...authenticated, requireFieldOrAdmin, asyncHandler(inspection.reviewFinding));
router.post('/inspections/:id/report', ...authenticated, requireAdmin, asyncHandler(inspection.requestReport));
router.get('/reports', ...authenticated, requireAdmin, asyncHandler(inspection.listReports));
router.get('/reports/:id/file', ...authenticated, requireAdmin, asyncHandler(inspection.getReportFile));
router.delete('/reports/:id', ...authenticated, requireAdmin, asyncHandler(inspection.deleteReport));

module.exports = router;
