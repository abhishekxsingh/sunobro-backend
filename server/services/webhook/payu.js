const { Order } = require('../../database/models');
const { PAYU } = require('../../config');
const Payu = require('../customer/payu');
const PaymentService = require('../customer/payment');
const CouponService = require('../coupons');
const emailService = require('../email');
const logger = require('../../utils/logger');

// One URL for every PayU dashboard webhook: Successful, Failed, Refund, Dispute.
// Success and failure are a signed form post. Refund and dispute are JSON and
// do not carry that hash, so a refund is confirmed with PayU before it cancels
// an order.
const payloadOf = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {};
  if (body.txnid || body.hash || body.action || body.event || body.cb_id) return body;
  if (body.data && typeof body.data === 'object') return body.data;
  if (body.payload && typeof body.payload === 'object') return body.payload;
  return body;
};

const RETRY = [
  'Order not found for this payment.',
  'PayU has not captured this payment.',
  'PayU did not return a payment status.',
  'PayU has not completed this refund.',
  'PayU did not return a refund status.',
];

const retry = (message) => {
  const error = new Error(message);
  error.retry = true;
  throw error;
};

const seen = (order, token) => (order.statusHistory || [])
  .some((entry) => String(entry.note || '').includes(token));

const findPayuOrder = async ({ txnid, paymentId }) => {
  const or = [];
  if (txnid) or.push({ payuTxnId: txnid });
  if (paymentId) or.push({ payuPaymentId: paymentId });
  if (!or.length) return null;
  return Order.findOne({ $or: or });
};

const pushNote = async (order, status, text, extra = {}) => {
  const update = {
    $push: { statusHistory: { status, note: text, createdAt: new Date() } },
  };
  if (Object.keys(extra).length) update.$set = extra;
  await Order.updateOne({ _id: order._id }, update);
};

const cancelOrder = async (order, text, extra = {}) => {
  const qikink = order.qikinkOrderId
    ? ` Cancel Qikink order ${order.qikinkOrderId} in the Qikink dashboard.`
    : '';
  const full = `${text}${qikink}`;
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: { $ne: 'cancelled' } },
    {
      $set: { status: 'cancelled', ...extra },
      $push: { statusHistory: { status: 'cancelled', note: full, createdAt: new Date() } },
    },
    { new: true },
  );
  if (!updated) {
    await pushNote(order, 'cancelled', full, extra);
    return;
  }
  await CouponService.release(order._id);
  if (updated.shippingEmail) {
    emailService.sendOrderStatus({ to: updated.shippingEmail, order: updated }).catch(() => {});
  }
};

const handleRefund = async (body) => {
  if (body.key && body.key !== PAYU.KEY) {
    logger.warn({ txnid: body.merchantTxnId || null }, 'payu-refund-rejected');
    return { type: 'unauthorized' };
  }
  const requestId = String(body.request_id || '').trim();
  const txnid = String(body.merchantTxnId || '').trim();
  const paymentId = String(body.mihpayid || '').trim();
  const order = await findPayuOrder({ txnid, paymentId });
  if (!order) return { doc: { received: true } };

  const token = requestId ? `PayU refund ${requestId}` : `PayU refund ${txnid || paymentId}`;
  if (seen(order, token)) return { doc: { received: true } };

  const status = String(body.status || '').toLowerCase();
  if (status !== 'success') {
    await pushNote(order, order.status, `${token} failed.${body.remark ? ` ${body.remark}` : ''}`, {
      payuRefundId: requestId || order.payuRefundId,
      payuRefundStatus: status || 'failure',
    });
    return { doc: { received: true } };
  }

  const remote = await Payu.verifyRefund(requestId);
  if (!remote.ok) {
    if (RETRY.includes(remote.message)) retry(remote.message);
    logger.warn({ txnid, requestId, message: remote.message }, 'payu-refund-not-confirmed');
    return { doc: { received: true } };
  }
  const amount = Number(remote.amount || body.amt);
  const extra = {
    payuRefundId: requestId,
    payuRefundStatus: 'success',
  };
  if (Number.isFinite(amount)) extra.payuRefundAmount = amount;

  const full = Number.isFinite(amount) && amount + 0.009 >= Number(order.total);
  const text = full
    ? `${token} of ₹${amount.toFixed(2)} completed.`
    : `${token} partial refund of ₹${Number.isFinite(amount) ? amount.toFixed(2) : body.amt}.`;
  if (full) await cancelOrder(order, text, extra);
  else await pushNote(order, order.status, text, extra);
  logger.info({ txnid, orderId: order.id, requestId }, 'payu-refund-recorded');
  return { doc: { received: true } };
};

const handleDispute = async (body) => {
  const paymentId = String(body.txn_id || '').trim();
  const disputeId = String(body.cb_id || '').trim();
  const disputeStatus = String(body.cb_status || '').trim();
  const order = await findPayuOrder({ paymentId });
  if (!order) return { doc: { received: true } };

  const token = `PayU dispute ${disputeId || paymentId} (${disputeStatus || 'update'})`;
  if (seen(order, token)) return { doc: { received: true } };

  const extra = {
    payuDisputeId: disputeId || order.payuDisputeId,
    payuDisputeStatus: disputeStatus || order.payuDisputeStatus,
    payuDisputeReason: String(body.reason_code || order.payuDisputeReason || ''),
  };
  if (body.cb_amount !== undefined && body.cb_amount !== null && body.cb_amount !== '') {
    const amount = Number(body.cb_amount);
    if (Number.isFinite(amount)) extra.payuDisputeAmount = amount;
  }
  const reason = body.reason_code ? ` ${body.reason_code}.` : '';
  const amountText = body.cb_amount ? ` Amount ₹${body.cb_amount}.` : '';
  const text = `${token}.${reason}${amountText}`;

  if (disputeStatus === 'Closed Customer Favour') await cancelOrder(order, text, extra);
  else await pushNote(order, order.status, text, extra);
  logger.info({ paymentId, orderId: order.id, disputeId }, 'payu-dispute-recorded');
  return { doc: { received: true } };
};

const handleFailedPayment = async (body) => {
  const order = await findPayuOrder({ txnid: String(body.txnid || '').trim() });
  if (!order || order.status !== 'pending') return { doc: { received: true } };
  const reason = body.error_Message || body.unmappedstatus || body.status || 'failed';
  const token = `PayU payment failed (${body.txnid})`;
  if (seen(order, token)) return { doc: { received: true } };
  await pushNote(order, 'pending', `${token}: ${reason}`);
  return { doc: { received: true } };
};

const handle = async (req) => {
  const body = payloadOf(req.body);
  if (String(body.action || '').toLowerCase() === 'refund' || (body.merchantTxnId && body.request_id)) {
    return handleRefund(body);
  }
  if (String(body.event || '').toLowerCase() === 'dispute' || body.cb_id) {
    return handleDispute(body);
  }
  if (!body.txnid && !body.hash) return { doc: { received: true } };
  if (!Payu.hashMatches(body)) {
    logger.warn({ txnid: body.txnid || null }, 'payu-webhook-rejected');
    return { type: 'unauthorized' };
  }

  if (String(body.status || '').toLowerCase() !== 'success') {
    return handleFailedPayment(body);
  }

  const result = await PaymentService.handlePayuReturn(body);
  if (!result.ok) {
    logger.warn({ txnid: body.txnid, message: result.message }, 'payu-webhook-not-confirmed');
    if (RETRY.includes(result.message)) retry(result.message);
    return { doc: { received: true } };
  }

  logger.info({ txnid: body.txnid, orderId: result.orderId }, 'payu-webhook-confirmed');
  return { doc: { received: true } };
};

module.exports = { handle };
