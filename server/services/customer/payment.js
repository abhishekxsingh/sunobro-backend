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

const markPaidAndFulfill = async (order, paymentId) => {
  if (order.status === 'paid') {
    if (paymentId && !order.razorpayPaymentId) {
      order.razorpayPaymentId = paymentId;
      await order.save();
    }
    return order;
  }

  order.status = 'paid';
  order.razorpayPaymentId = paymentId || order.razorpayPaymentId;
  order.statusHistory.push({ status: 'paid', note: 'Payment verified via Razorpay.' });
  await order.save();

  try {
    const qikinkResult = await QikinkService.createOrderFromPaidOrder(order);
    if (qikinkResult?.orderId) {
      order.qikinkOrderId = String(qikinkResult.orderId);
      order.qikinkStatus = qikinkResult.status || 'submitted';
      order.qikinkError = undefined;
      order.statusHistory.push({
        status: 'paid',
        note: `Qikink order created: ${order.qikinkOrderId}`,
      });
    } else if (qikinkResult?.skipped) {
      order.qikinkStatus = 'skipped';
      order.qikinkError = qikinkResult.message;
    } else if (qikinkResult?.error) {
      order.qikinkStatus = 'error';
      order.qikinkError = qikinkResult.error;
      order.statusHistory.push({
        status: 'paid',
        note: `Qikink fulfillment failed: ${qikinkResult.error}`,
      });
    }
    await order.save();
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'qikink-fulfill-failed');
    order.qikinkStatus = 'error';
    order.qikinkError = err.message || 'Qikink fulfillment failed';
    await order.save();
  }

  return order;
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

const verifySignature = (paymentOrderId, paymentId, signature) => {
  const expected = crypto
    .createHmac('sha256', RAZORPAY.KEY_SECRET)
    .update(`${paymentOrderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
};

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
  createOrder, verify, markPaidAndFulfill, verifySignature,
};
