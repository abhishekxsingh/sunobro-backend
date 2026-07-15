const HttpError = require('../utils/http-error');

const NOT_WIRED_MESSAGE = 'Payments are not wired up yet. Cashfree integration lands in a follow-up phase.';

// Intentionally stubbed: real Cashfree order-session creation + webhook
// signature verification is a separate, explicitly deferred phase (see
// project plan) since it touches real money and external credentials.
const createOrder = async () => {
  throw new HttpError(501, NOT_WIRED_MESSAGE);
};

const verify = async () => {
  throw new HttpError(501, NOT_WIRED_MESSAGE);
};

module.exports = { createOrder, verify };
