const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const {
  PORT, CORS_ORIGINS, NODE_ENV, MONGODB_URI,
} = require('./config');
const { connect } = require('./database/models');
const correlationId = require('./utils/correlation-id');
const attachResponseHelpers = require('./utils/middleware/http');
const logger = require('./utils/logger');
const routes = require('./routes');

const LOCAL_HOST = /^(localhost|127\.0\.0\.1)$/;
const PRIVATE_HOST = /^(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/;

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (CORS_ORIGINS.includes(origin)) return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (LOCAL_HOST.test(url.hostname) || PRIVATE_HOST.test(url.hostname)) return true;
  return url.protocol === 'https:' && url.hostname.endsWith('.azurewebsites.net');
};

const app = express();

app.enable('trust proxy');
app.use(correlationId);
app.use(attachResponseHelpers);
app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
}));
app.use(compression());
app.use(helmet({
  // Storefront and admin call this API from another origin. Helmet's default
  // same-origin policy makes the browser fail those fetches.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // Razorpay Checkout opens a payment window.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));
app.use(cookieParser());
app.use(express.json());

app.use('/', routes);

app.use((req, res) => res.notFound());

// Safety net for errors that never reach a controller's own try/catch (auth
// middleware, body-parser failures) — dispatches through the same res.*
// helpers controllers use, so every response shape stays consistent.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const handlers = {
    400: () => res.badRequest('request-error', [{ message: err.message }]),
    401: () => res.unAuthorized(),
    403: () => res.forbidden(),
    404: () => res.notFound(),
    409: () => res.conflict('conflict', [{ message: err.message }]),
    412: () => res.concurrencyError(),
    501: () => res.notImplemented(),
  };
  const handle = handlers[status] || (() => res.serverError(err));

  return handle();
});

if (require.main === module) {
  connect(MONGODB_URI)
    .then(() => {
      app.listen(PORT, () => {
        logger.info(`server on port ${PORT} (${NODE_ENV})`);
      });
    })
    .catch((err) => {
      logger.error(err, 'MongoDB connection failed');
      process.exit(1);
    });
}

module.exports = app;
