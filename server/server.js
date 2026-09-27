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

const app = express();

app.enable('trust proxy');
app.use(correlationId);
app.use(attachResponseHelpers);
app.use(cors({
  origin: CORS_ORIGINS.length > 0 ? CORS_ORIGINS : false,
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
