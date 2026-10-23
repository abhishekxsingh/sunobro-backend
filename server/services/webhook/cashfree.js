const { Order } = require('../../database/models');
const { CASHFREE } = require('../../config');
const Cashfree = require('../customer/cashfree');
const PaymentService = require('../customer/payment');
const logger = require('../../utils/logger');

const handle = async (req) => {
  if (!CASHFREE.WEBHOOK_SECRET) {
    return {
      type: 'not-configured',
      errors: [{ name: 'cashfree', message: 'Cashfree webhook secret is not configured.' }],
    };
  }

  const timestamp = req.headers['x-webhook-timestamp'];
  const signature = req.headers['x-webhook-signature'];
  if (!Cashfree.signatureMatches(req.rawBody, timestamp, signature)) {
    logger.warn({ hasSignature: Boolean(signature) }, 'cashfree-webhook-rejected');
    return { type: 'unauthorized' };
  }

  const event = req.body || {};
  const payment = event.data?.payment;
  const orderPayload = event.data?.order;
  if (event.type !== 'PAYMENT_SUCCESS_WEBHOOK' || payment?.payment_status !== 'SUCCESS') {
    return { doc: { received: true } };
  }

  const order = await Order.findOne({ cashfreeOrderId: orderPayload?.order_id });
  if (!order || order.status !== 'pending') {
    return { doc: { received: true } };
  }

  const expected = Number(order.total).toFixed(2);
  const paidAmount = Number(payment.payment_amount ?? orderPayload?.order_amount);
  const currency = String(orderPayload?.order_currency || payment.payment_currency || '').toUpperCase();
  if (!Number.isFinite(paidAmount) || paidAmount.toFixed(2) !== expected
    || (currency && currency !== (order.currency || 'INR').toUpperCase())) {
    logger.error({
      orderId: order.id,
      paidAmount,
      currency,
      expected,
    }, 'cashfree-webhook-amount-mismatch');
    return { doc: { received: true } };
  }

  await PaymentService.markPaidAndFulfill(
    order,
    String(payment.cf_payment_id || order.cashfreeOrderId),
    'cashfree',
  );
  return { doc: { received: true } };
};

module.exports = { handle };
