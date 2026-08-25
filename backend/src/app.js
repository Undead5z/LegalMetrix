const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const routes = require('./routes');
const { notFound, errorHandler } = require('./utils/http');

const app = express();
app.use(cors()); // API is consumed by web and Expo during MVP development.
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
const healthResponse = (req, res) => res.json({ status: 'ok', service: 'legalmetrix-backend' });
app.get('/health', healthResponse);
app.get('/api/health', healthResponse);
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
