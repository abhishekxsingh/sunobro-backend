// Placeholder for the real Cashfree server-to-server webhook (order status
// push, signature verification). Not wired yet — payments are still stubbed
// end-to-end (see services/customer/payment.js).
const handle = async () => ({
  errors: [{ name: 'webhook', message: 'Cashfree webhook is not wired up yet.' }],
  type: 'not-implemented',
});

module.exports = { handle };
