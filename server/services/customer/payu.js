const crypto = require('crypto');
const { PAYU, DOMAIN } = require('../../config');

const sha512 = (value) => crypto.createHash('sha512').update(value).digest('hex');

const safeEqual = (left, right) => {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const clean = (value, max = 100) => String(value || '')
  .replace(/[|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const amountString = (total) => Number(total).toFixed(2);

// PayU hosted checkout (_payment):
// sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
const requestHash = ({
  key, txnid, amount, productinfo, firstname, email, udf1 = '', salt,
}) => sha512([
  key,
  txnid,
  amount,
  productinfo,
  firstname,
  email,
  udf1,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  salt,
].join('|'));

// Reverse hash on the browser return:
// sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
// An extra additionalCharges prefix is included when PayU sends one.
const responseHash = (body, salt) => {
  const udf = (n) => body[`udf${n}`] || '';
  const parts = [
    salt,
    body.status || '',
    '',
    '',
    '',
    '',
    '',
    udf(5),
    udf(4),
    udf(3),
    udf(2),
    udf(1),
    body.email || '',
    body.firstname || '',
    body.productinfo || '',
    body.amount || '',
    body.txnid || '',
    body.key || '',
  ];
  if (body.additionalCharges) parts.unshift(String(body.additionalCharges));
  return sha512(parts.join('|'));
};

const callbackUrl = () => `${String(DOMAIN).replace(/\/$/, '')}/payments/payu/callback`;

const createPayment = async (order) => {
  if (!PAYU.KEY || !PAYU.SALT) {
    return {
      type: 'not-configured',
      errors: [{ name: 'payu', message: 'PayU key and salt are not configured on the server.' }],
    };
  }

  const email = clean(order.shippingEmail, 100);
  const firstname = clean(order.shippingFirstName, 60);
  if (!email || !firstname) {
    return {
      errors: [{ name: 'customer', message: 'PayU needs a first name and email on the order.' }],
    };
  }

  const txnid = `SB${crypto.randomBytes(8).toString('hex')}`.slice(0, 25);
  const amount = amountString(order.total);
  const productinfo = 'SunoBro';
  const udf1 = String(order.id);
  const hash = requestHash({
    key: PAYU.KEY,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf1,
    salt: PAYU.SALT,
  });
  const phone = String(order.shippingPhone || '').replace(/\D/g, '').slice(-10);
  if (phone.length !== 10) {
    return {
      errors: [{ name: 'phone', message: 'Enter a 10-digit mobile number. PayU uses it to open checkout.' }],
    };
  }
  const surl = callbackUrl();

  order.payuTxnId = txnid;
  order.paymentGateway = 'payu';
  await order.save();

  const fields = {
    key: PAYU.KEY,
    txnid,
    amount,
    productinfo,
    firstname,
    lastname: clean(order.shippingLastName, 60),
    email,
    phone,
    surl,
    furl: surl,
    curl: surl,
    udf1,
    address1: clean(order.shippingStreet, 100),
    city: clean(order.shippingCity, 50),
    state: clean(order.shippingState, 50),
    country: clean(order.shippingCountry, 50),
    zipcode: clean(order.shippingPostalCode, 20),
    hash,
  };
  Object.keys(fields).forEach((key) => {
    if (fields[key] === '') delete fields[key];
  });

  return {
    doc: {
      paymentOrderId: txnid,
      amount: Math.round(Number(amount) * 100),
      currency: (order.currency || 'INR').toUpperCase(),
      gateway: 'payu',
      orderReference: order.reference,
      action: PAYU.CHECKOUT_URL,
      fields,
    },
  };
};

const verifyRemote = async (txnid) => {
  const hash = sha512(`${PAYU.KEY}|verify_payment|${txnid}|${PAYU.SALT}`);
  const body = new URLSearchParams({
    key: PAYU.KEY,
    command: 'verify_payment',
    var1: txnid,
    hash,
  });
  const res = await fetch(PAYU.VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'PayU did not return a payment status.' };
  }
  const details = data.transaction_details?.[txnid]
    || data.transaction_details?.[Object.keys(data.transaction_details || {})[0]];
  const status = String(details?.status || details?.unmappedstatus || '').toLowerCase();
  if (!details || (status !== 'success' && status !== 'captured')) {
    return {
      ok: false,
      message: details?.error_Message || data.msg || 'PayU has not captured this payment.',
    };
  }
  return {
    ok: true,
    paymentId: String(details.mihpayid || ''),
    amount: String(details.amt || details.amount || details.transaction_amount || ''),
  };
};

const hashMatches = (body) => safeEqual(responseHash(body, PAYU.SALT), String(body.hash || '').toLowerCase());

// Refund webhooks carry no reverse hash. Confirm the request id with PayU
// before cancelling an order.
const verifyRefund = async (requestId) => {
  const id = String(requestId || '').trim();
  if (!id) return { ok: false, message: 'PayU refund id is missing.' };
  const hash = sha512(`${PAYU.KEY}|check_action_status|${id}|${PAYU.SALT}`);
  const body = new URLSearchParams({
    key: PAYU.KEY,
    command: 'check_action_status',
    var1: id,
    hash,
  });
  const res = await fetch(PAYU.VERIFY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: 'PayU did not return a refund status.' };
  }
  const details = data.transaction_details?.[id]
    || data.transaction_details?.[Object.keys(data.transaction_details || {})[0]];
  const status = String(details?.status || '').toLowerCase();
  const action = String(details?.action || 'refund').toLowerCase();
  if (!details || status !== 'success' || action !== 'refund') {
    return { ok: false, message: 'PayU has not completed this refund.' };
  }
  return {
    ok: true,
    amount: String(details.amt || details.amount || ''),
    requestId: String(details.request_id || id),
  };
};

module.exports = {
  createPayment,
  verifyRemote,
  verifyRefund,
  hashMatches,
  amountString,
  requestHash,
  responseHash,
};
