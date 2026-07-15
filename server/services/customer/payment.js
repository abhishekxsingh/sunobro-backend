const NOT_WIRED_MESSAGE = 'Payments are not wired up yet. Cashfree integration lands in a follow-up phase.';

// Intentionally stubbed: real Cashfree order-session creation + webhook
// signature verification is a separate, explicitly deferred phase (see
// project plan) since it touches real money and external credentials.
const createOrder = async () => ({
  errors: [{ name: 'payments', message: NOT_WIRED_MESSAGE }],
  type: 'not-implemented',
});

const verify = async () => ({
  errors: [{ name: 'payments', message: NOT_WIRED_MESSAGE }],
  type: 'not-implemented',
});

module.exports = { createOrder, verify };
