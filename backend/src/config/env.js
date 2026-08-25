const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const rootDir = path.resolve(__dirname, '../..');

module.exports = {
  host: process.env.HOST || '0.0.0.0',
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'development-only-change-me',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH || './data/legalmetrix.db'),
  uploadDir: path.resolve(rootDir, process.env.UPLOAD_DIR || './uploads'),
  aiExtractionApiKey: process.env.AI_EXTRACTION_API_KEY || '',
  aiExtractionModel: process.env.AI_EXTRACTION_MODEL || 'gpt-4o-mini',
  visionExtractionModel: process.env.VISION_EXTRACTION_MODEL || '',
  aiExtractionBaseUrl: process.env.AI_EXTRACTION_BASE_URL || 'https://api.openai.com/v1/chat/completions'
};
