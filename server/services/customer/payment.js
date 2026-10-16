const crypto = require('crypto');
const Razorpay = require('razorpay');
const mongoose = require('mongoose');
const { Order } = require('../../database/models');
const { RAZORPAY } = require('../../config');
const QikinkService = require('../admin/qikink');
const logger = require('../../utils/logger');

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
const markPaidAndFulfill = async (order, paymentId) => {
  const paid = await Order.findOneAndUpdate(
    { _id: order._id, status: 'pending' },
    {
      $set: {
        status: 'paid',
        razorpayPaymentId: paymentId || order.razorpayPaymentId,
      },
      $push: {
        statusHistory: {
          status: 'paid',
          note: 'Payment verified via Razorpay.',
          createdAt: new Date(),
        },
      },
    },
    { new: true },
  );

  if (!paid) {
    const current = await Order.findById(order._id);
    if (current && paymentId && !current.razorpayPaymentId) {
      current.razorpayPaymentId = paymentId;
      await current.save();
    }
    return current;
  }

  try {
    const { order: fulfilled } = await QikinkService.fulfillOrder(paid._id);
    return fulfilled || paid;
  } catch (err) {
    // Never fail a verified payment because fulfilment broke — the order stays
    // paid and can be pushed again from the admin panel.
    logger.error({ err, orderId: paid.id }, 'qikink-fulfill-failed');
    return paid;
  }
};

const createOrder = async ({ orderId }) => {
  const client = getClient();
  if (!client) {
    return {
      type: 'not-configured',
      errors: [{ name: 'razorpay', message: 'Razorpay keys are not configured on the server.' }],
    };
  }

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

const verify = async ({
  orderId, paymentOrderId, paymentId, signature,
}) => {
  if (!RAZORPAY.KEY_SECRET) {
    return {
      type: 'not-configured',
      errors: [{ name: 'razorpay', message: 'Razorpay keys are not configured on the server.' }],
    };
  }

  if (!mongoose.isValidObjectId(orderId)) {
    return { errors: [{ name: 'orderId', message: 'Invalid order id.' }] };
  }

  if (!verifySignature(paymentOrderId, paymentId, signature)) {
    return {
      type: 'conflict',
      errors: [{ name: 'signature', message: 'Payment signature verification failed.' }],
    };
  }

  const order = await Order.findById(orderId);
  if (!order) {
    return { errors: [{ name: 'order', message: 'Order not found.' }] };
  }
  if (order.razorpayOrderId && order.razorpayOrderId !== paymentOrderId) {
    return {
      type: 'conflict',
      errors: [{ name: 'paymentOrderId', message: 'Razorpay order mismatch.' }],
    };
  }

  const updated = await markPaidAndFulfill(order, paymentId);
  return {
    doc: {
      verified: true,
      orderId: updated.id,
      reference: updated.reference,
      status: updated.status,
      qikinkOrderId: updated.qikinkOrderId || null,
      qikinkStatus: updated.qikinkStatus || null,
    },
  };
};

module.exports = {
  createOrder, verify, markPaidAndFulfill, verifySignature, hmacMatches, toPaise,
};
