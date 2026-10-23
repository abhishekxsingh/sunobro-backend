const Payu = require('../customer/payu');
const PaymentService = require('../customer/payment');
const logger = require('../../utils/logger');

// PayU's dashboard webhook (Developers → Webhooks) posts the same payment
// response as the browser return: form fields or a flat JSON object, with a
// reverse hash. Nested `data` / `payload` is accepted for the JSON variant.
const payloadOf = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  if (body.txnid || body.hash) return body;
  if (body.data && typeof body.data === 'object') return body.data;
  if (body.payload && typeof body.payload === 'object') return body.payload;
  return body;
};

const RETRY = [
  'Order not found for this payment.',
  'PayU has not captured this payment.',
  'PayU did not return a payment status.',
];

const handle = async (req) => {
  const body = payloadOf(req.body);
  if (!body.txnid && !body.hash) {
    return { doc: { received: true } };
  }
  if (!Payu.hashMatches(body)) {
    logger.warn({ txnid: body.txnid || null }, 'payu-webhook-rejected');
    return { type: 'unauthorized' };
  }

  const result = await PaymentService.handlePayuReturn(body);
  if (!result.ok) {
    logger.warn({ txnid: body.txnid, message: result.message }, 'payu-webhook-not-confirmed');
    if (RETRY.includes(result.message)) {
      const error = new Error(result.message);
      error.retry = true;
      throw error;
    }
    return { doc: { received: true } };
  }

  logger.info({ txnid: body.txnid, orderId: result.orderId }, 'payu-webhook-confirmed');
  return { doc: { received: true } };
};

module.exports = { handle };
