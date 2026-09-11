const path = require('path');
const dotenv = require('dotenv');

dotenv.config();
const rootDir = path.resolve(__dirname, '../..');
const defaultCorsOrigins = ['http://localhost:5173', 'https://legal-metrix.vercel.app'];

module.exports = {
  rootDir,
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'development-only-change-me',
  corsOrigins: (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || defaultCorsOrigins.join(',')).split(',').map(origin => origin.trim()).filter(Boolean),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || './data/legalmetrix.db'),
  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads'),
  reportDir: path.resolve(rootDir, process.env.REPORT_DIR || path.join(process.env.UPLOAD_DIR || './uploads', 'reports')),
  productConditionNearExpiryDays: Number(process.env.PRODUCT_CONDITION_NEAR_EXPIRY_DAYS || 30),
  visionAiProvider: process.env.VISION_AI_PROVIDER || 'openrouter',
  // Legacy AI_EXTRACTION_* names are accepted for existing local installations.
  aiExtractionApiKey: process.env.VISION_AI_API_KEY || process.env.AI_EXTRACTION_API_KEY || '',
  aiExtractionModel: process.env.AI_EXTRACTION_MODEL || '',
  visionExtractionModel: process.env.VISION_AI_MODEL || process.env.VISION_EXTRACTION_MODEL || '',
  aiExtractionBaseUrl: process.env.VISION_AI_BASE_URL || process.env.AI_EXTRACTION_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions'
};
