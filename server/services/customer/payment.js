const crypto = require('crypto');
const Razorpay = require('razorpay');
const mongoose = require('mongoose');
const { Order } = require('../../database/models');
const { RAZORPAY, PAYU } = require('../../config');
const QikinkService = require('../admin/qikink');
const emailService = require('../email');
const CouponService = require('../coupons');
const logger = require('../../utils/logger');
const PaymentSettings = require('./payment-settings');
const Payu = require('./payu');
const Cashfree = require('./cashfree');

const GATEWAY_LABEL = {
  razorpay: 'Razorpay',
  payu: 'PayU',
  cashfree: 'Cashfree',
};

const getClient = () => {
  if (!RAZORPAY.KEY_ID || !RAZORPAY.KEY_SECRET) {
    return null;
  }
  return new Razorpay({
    key_id: RAZORPAY.KEY_ID,
    key_secret: RAZORPAY.KEY_SECRET,
  });
};

const toPaise = (amount) => Math.round(Number(amount) * 100);

// /payments/verify and the payment.captured webhook can arrive together. The
// pending → paid flip is a single conditional update so only one of them wins
// and goes on to push the order to Qikink.
const markPaidAndFulfill = async (order, paymentId, gateway) => {
  const via = gateway || order.paymentGateway || 'razorpay';
  const set = { status: 'paid' };
  if (via === 'payu') set.payuPaymentId = paymentId || order.payuPaymentId;
  else if (via === 'cashfree') set.cashfreePaymentId = paymentId || order.cashfreePaymentId;
  else set.razorpayPaymentId = paymentId || order.razorpayPaymentId;

  const paid = await Order.findOneAndUpdate(
    { _id: order._id, status: 'pending' },
    {
      $set: set,
      $push: {
        statusHistory: {
          status: 'paid',
          note: `Payment verified via ${GATEWAY_LABEL[via] || via}.`,
          createdAt: new Date(),
        },
      },
    },
    { new: true },
  );

  if (!paid) {
    const current = await Order.findById(order._id);
    const field = via === 'payu'
      ? 'payuPaymentId'
      : via === 'cashfree'
        ? 'cashfreePaymentId'
        : 'razorpayPaymentId';
    if (current && paymentId && !current[field]) {
      current[field] = paymentId;
      await current.save();
    }
    return current;
  }

  await CouponService.redeem(paid._id);

  let result = paid;
  try {
    const { order: fulfilled } = await QikinkService.fulfillOrder(paid._id);
    result = fulfilled || paid;
  } catch (err) {
    // Never fail a verified payment because fulfilment broke — the order stays
    // paid and can be pushed again from the admin panel.
    logger.error({ err, orderId: paid.id }, 'qikink-fulfill-failed');
  }

  if (result.shippingEmail) {
    emailService.sendOrderStatus({ to: result.shippingEmail, order: result }).catch(() => {});
  }

  return result;
};

const loadPendingOrder = async (orderId) => {
  if (!mongoose.isValidObjectId(orderId)) {
    return { errors: [{ name: 'orderId', message: 'Invalid order id.' }] };
  }
  const order = await Order.findById(orderId);
  if (!order) {
    return { errors: [{ name: 'order', message: 'Order not found.' }] };
  }
  if (order.status !== 'pending') {
    return {
      type: 'conflict',
      errors: [{ name: 'status', message: `Order is already ${order.status}.` }],
    };
  }
  return { order };
};

const createRazorpayOrder = async (order) => {
  const client = getClient();
  if (!client) {
    return {
      type: 'not-configured',
      errors: [{ name: 'razorpay', message: 'Razorpay keys are not configured on the server.' }],
    };
  }

  const currency = (order.currency || 'INR').toUpperCase();
  const amountPaise = toPaise(order.total);

  if (order.razorpayOrderId) {
    return {
      doc: {
        paymentOrderId: order.razorpayOrderId,
        amount: amountPaise,
        currency,
        gateway: 'razorpay',
        keyId: RAZORPAY.KEY_ID,
        orderReference: order.reference,
      },
    };
  }

  const razorpayOrder = await client.orders.create({
    amount: amountPaise,
    currency,
    receipt: order.reference.slice(0, 40),
    notes: {
      sunobroOrderId: order.id,
      reference: order.reference,
    },
  });

  order.razorpayOrderId = razorpayOrder.id;
  order.paymentGateway = 'razorpay';
  await order.save();

  return {
    doc: {
      paymentOrderId: razorpayOrder.id,
      amount: amountPaise,
      currency,
      gateway: 'razorpay',
      keyId: RAZORPAY.KEY_ID,
      orderReference: order.reference,
    },
  };
};

const createOrder = async ({ orderId }) => {
  const loaded = await loadPendingOrder(orderId);
  if (!loaded.order) return loaded;

  // The coupon may have expired or run out since the order was placed.
  const coupon = await CouponService.recheckOrder(loaded.order);
  if (coupon.errors) {
    return {
      type: 'conflict',
      errors: [{
        name: 'couponCode',
        message: `${coupon.errors[0].message} Remove the coupon and try again.`,
      }],
    };
  }

  const gateway = await PaymentSettings.getActive();
  if (gateway === 'payu') return Payu.createPayment(loaded.order);
  if (gateway === 'cashfree') return Cashfree.createPayment(loaded.order);
  return createRazorpayOrder(loaded.order);
};

const handlePayuReturn = async (body) => {
  const fail = (message) => ({ ok: false, message });
  if (!body || body.key !== PAYU.KEY) {
    return fail('Payment could not be verified.');
  }
  if (!Payu.hashMatches(body)) {
    return fail('Payment could not be verified.');
  }

  const order = await Order.findOne({ payuTxnId: body.txnid });
  if (!order) return fail('Order not found for this payment.');
  if (String(body.udf1 || '') !== String(order.id)) {
    return fail('Payment does not match this order.');
  }
  if (Payu.amountString(order.total) !== String(body.amount)) {
    return fail('Payment amount does not match the order.');
  }
  if (order.status === 'paid') {
    return { ok: true, orderId: order.id, reference: order.reference };
  }
  if (order.status !== 'pending') return fail(`Order is already ${order.status}.`);
  if (String(body.status || '').toLowerCase() !== 'success') {
    return fail(body.error_Message || 'Payment was not completed.');
  }

  const remote = await Payu.verifyRemote(body.txnid);
  if (!remote.ok) return fail(remote.message);
  if (remote.amount && Number(remote.amount).toFixed(2) !== Payu.amountString(order.total)) {
    return fail('PayU amount does not match the order.');
  }

  const updated = await markPaidAndFulfill(order, body.mihpayid || remote.paymentId, 'payu');
  return { ok: true, orderId: updated.id, reference: updated.reference };
};

// Constant-time HMAC-SHA256 check, shared by checkout verify and the webhook.
const hmacMatches = (secret, payload, signature) => {
  if (!secret || !signature || typeof signature !== 'string') return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(payload).digest('hex'));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
};

const verifySignature = (paymentOrderId, paymentId, signature) => hmacMatches(
  RAZORPAY.KEY_SECRET,
  `${paymentOrderId}|${paymentId}`,
  signature,
);

const paidDoc = (updated) => ({
  doc: {
    verified: true,
    orderId: updated.id,
    reference: updated.reference,
    status: updated.status,
    qikinkOrderId: updated.qikinkOrderId || null,
    qikinkStatus: updated.qikinkStatus || null,
  },
});

const verify = async ({
  orderId, paymentOrderId, paymentId, signature,
}) => {
  if (!mongoose.isValidObjectId(orderId)) {
    return { errors: [{ name: 'orderId', message: 'Invalid order id.' }] };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { errors: [{ name: 'order', message: 'Order not found.' }] };
  }

  if (order.paymentGateway === 'cashfree') {
    if (order.cashfreeOrderId && order.cashfreeOrderId !== paymentOrderId) {
      return {
        type: 'conflict',
        errors: [{ name: 'paymentOrderId', message: 'Cashfree order mismatch.' }],
      };
    }
    const checked = await Cashfree.verifyPayment(order);
    if (checked.errors || checked.type) return checked;
    return paidDoc(await markPaidAndFulfill(order, checked.paymentId, 'cashfree'));
  }

  if (order.paymentGateway === 'payu') {
    return {
      type: 'conflict',
      errors: [{ name: 'gateway', message: 'PayU payments are confirmed when PayU redirects back.' }],
    };
  }

  if (!RAZORPAY.KEY_SECRET) {
    return {
      type: 'not-configured',
      errors: [{ name: 'razorpay', message: 'Razorpay keys are not configured on the server.' }],
    };
  }

  if (!verifySignature(paymentOrderId, paymentId, signature)) {
    return {
      type: 'conflict',
      errors: [{ name: 'signature', message: 'Payment signature verification failed.' }],
    };
  }

  if (order.razorpayOrderId && order.razorpayOrderId !== paymentOrderId) {
    return {
      type: 'conflict',
      errors: [{ name: 'paymentOrderId', message: 'Razorpay order mismatch.' }],
    };
  }

  return paidDoc(await markPaidAndFulfill(order, paymentId, 'razorpay'));
};

module.exports = {
  createOrder,
  verify,
  handlePayuReturn,
  markPaidAndFulfill,
  verifySignature,
  hmacMatches,
  toPaise,
};
