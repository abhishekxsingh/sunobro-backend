const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const { PORT, CORS_ORIGINS, NODE_ENV } = require('./config');
const correlationId = require('./utils/correlation-id');
const logger = require('./utils/logger');
const routes = require('./routes');

const app = express();

app.enable('trust proxy');
app.use(correlationId);
app.use(cors({
  origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : true,
  credentials: true,
}));
app.use(compression());
app.use(helmet());
app.use(cookieParser());
app.use(express.json());

app.use('/', routes);

app.use((req, res) => {
  res.status(404).json({ message: 'Not found.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error({ err, correlationId: req.correlationId }, 'unhandled-error');
  }
  res.status(status).json({ message: status >= 500 ? 'Internal server error.' : err.message });
});

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`server on port ${PORT} (${NODE_ENV})`);
  });
}

module.exports = app;
