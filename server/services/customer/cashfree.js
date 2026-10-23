const crypto = require('crypto');
const { CASHFREE, STOREFRONT_URL } = require('../../config');

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

class CashfreeError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const request = async (path, { method = 'GET', body } = {}) => {
  const res = await fetch(`${CASHFREE.BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': CASHFREE.APP_ID,
      'x-client-secret': CASHFREE.SECRET,
      'x-api-version': '2023-08-01',
      accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CashfreeError(data.message || `Cashfree request failed (${res.status}).`, res.status);
  }
  return data;
};

const orderBody = (order, orderId) => {
  const phone = String(order.shippingPhone || '').replace(/\D/g, '').slice(-10);
  const store = String(STOREFRONT_URL).replace(/\/$/, '');
  const returnUrl = `${store}/order-confirmation?id=${order.id}&ref=${encodeURIComponent(order.reference)}&paid=1`;
  return {
    order_id: orderId,
    order_amount: Number(Number(order.total).toFixed(2)),
    order_currency: (order.currency || 'INR').toUpperCase(),
    customer_details: {
      customer_id: `c_${order.customerId || order.id}`,
      customer_phone: phone,
      customer_name: `${order.shippingFirstName || ''} ${order.shippingLastName || ''}`.trim(),
      ...(order.shippingEmail ? { customer_email: order.shippingEmail } : {}),
    },
    order_meta: { return_url: returnUrl },
  };
};

const openSession = async (order) => {
  const preferred = order.cashfreeOrderId || order.reference;
  try {
    return await request('/orders', { method: 'POST', body: orderBody(order, preferred) });
  } catch (err) {
    const exists = err.status === 409 || /exist/i.test(err.message || '');
    if (!exists) throw err;
  }

  const existing = await request(`/orders/${encodeURIComponent(preferred)}`);
  if (String(existing.order_status || '').toUpperCase() === 'PAID') {
    throw new CashfreeError('This order is already paid.', 409);
  }
  if (existing.payment_session_id) return existing;

  const retryId = `${order.reference}-${crypto.randomBytes(2).toString('hex')}`.slice(0, 45);
  return request('/orders', { method: 'POST', body: orderBody(order, retryId) });
};

const createPayment = async (order) => {
  if (!CASHFREE.APP_ID || !CASHFREE.SECRET) {
    return {
      type: 'not-configured',
      errors: [{ name: 'cashfree', message: 'Cashfree keys are not configured on the server.' }],
    };
  }
  const phone = String(order.shippingPhone || '').replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) {
    return {
      errors: [{ name: 'phone', message: 'Cashfree needs a 10-digit phone number.' }],
    };
  }

  let created;
  try {
    created = await openSession(order);
  } catch (err) {
    return {
      type: 'gateway',
      errors: [{ name: 'cashfree', message: err.message || 'Cashfree could not start checkout.' }],
    };
  }

  if (!created.payment_session_id) {
    return {
      type: 'gateway',
      errors: [{ name: 'cashfree', message: 'Cashfree did not return a payment session.' }],
    };
  }

  order.cashfreeOrderId = created.order_id || order.cashfreeOrderId || order.reference;
  order.paymentGateway = 'cashfree';
  await order.save();

  return {
    doc: {
      paymentOrderId: order.cashfreeOrderId,
      paymentSessionId: created.payment_session_id,
      amount: Math.round(Number(order.total) * 100),
      currency: (order.currency || 'INR').toUpperCase(),
      gateway: 'cashfree',
      mode: CASHFREE.ENV,
      orderReference: order.reference,
    },
  };
};

const verifyPayment = async (order) => {
  if (!order.cashfreeOrderId) {
    return {
      type: 'conflict',
      errors: [{ name: 'paymentOrderId', message: 'This order has no Cashfree payment.' }],
    };
  }
  let remote;
  try {
    remote = await request(`/orders/${encodeURIComponent(order.cashfreeOrderId)}`);
  } catch (err) {
    return {
      type: 'gateway',
      errors: [{ name: 'cashfree', message: err.message || 'Cashfree could not confirm the payment.' }],
    };
  }
  if (String(remote.order_status || '').toUpperCase() !== 'PAID') {
    return {
      type: 'conflict',
      errors: [{ name: 'status', message: 'Cashfree has not marked this payment as paid.' }],
    };
  }
  const paidAmount = Number(remote.order_amount);
  if (Number.isFinite(paidAmount) && paidAmount.toFixed(2) !== Number(order.total).toFixed(2)) {
    return {
      type: 'conflict',
      errors: [{ name: 'amount', message: 'Cashfree amount does not match the order.' }],
    };
  }
  return { paymentId: String(remote.cf_order_id || order.cashfreeOrderId) };
};

// Cashfree signs timestamp + raw body with HMAC-SHA256, base64.
const signatureMatches = (rawBody, timestamp, signature) => {
  if (!CASHFREE.WEBHOOK_SECRET || !rawBody || !timestamp || !signature) return false;
  const expected = crypto
    .createHmac('sha256', CASHFREE.WEBHOOK_SECRET)
    .update(`${timestamp}${rawBody.toString('utf8')}`)
    .digest('base64');
  return safeEqual(expected, signature);
};

module.exports = {
  createPayment, verifyPayment, signatureMatches,
};
