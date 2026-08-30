const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./utils/http');

const app = express();
app.use(cors({ origin(origin, callback) {
  // Native Expo and same-machine non-browser requests have no Origin header.
  if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
  return callback(new Error('Origin is not permitted by the LegalMetrix CORS policy.'));
}}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
const healthResponse = (req, res) => res.json({ status: 'ok', service: 'legalmetrix-backend' });
app.get('/health', healthResponse);
app.get('/api/health', healthResponse);
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
