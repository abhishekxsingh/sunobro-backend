const crypto = require('crypto');
const { EASEBUZZ, DOMAIN } = require('../../config');

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

const callbackUrl = () => `${String(DOMAIN).replace(/\/$/, '')}/payments/easebuzz/callback`;

// key|txnid|amount|productinfo|firstname|email|udf1..udf10|salt
const requestHash = ({
  key, txnid, amount, productinfo, firstname, email, udf, salt,
}) => sha512([
  key, txnid, amount, productinfo, firstname, email, ...udf, salt,
].join('|'));

// salt|status|udf10..udf1|email|firstname|productinfo|amount|txnid|key
const responseHash = (body, salt) => {
  const udf = (n) => body[`udf${n}`] || '';
  const parts = [
    salt,
    body.status || '',
    udf(10), udf(9), udf(8), udf(7), udf(6), udf(5), udf(4), udf(3), udf(2), udf(1),
    body.email || '',
    body.firstname || '',
    body.productinfo || '',
    body.amount || '',
    body.txnid || '',
    body.key || '',
  ];
  const extra = body.additional_charges || body.additionalCharges;
  if (extra) parts.unshift(String(extra));
  return sha512(parts.join('|'));
};

const createPayment = async (order) => {
  if (!EASEBUZZ.KEY || !EASEBUZZ.SALT) {
    return {
      type: 'not-configured',
      errors: [{ name: 'easebuzz', message: 'Easebuzz key and salt are not configured on the server.' }],
    };
  }

  const email = clean(order.shippingEmail, 100);
  const firstname = clean(order.shippingFirstName, 60);
  const phone = String(order.shippingPhone || '').replace(/\D/g, '').slice(-10);
  if (!email || !firstname || phone.length !== 10) {
    return {
      errors: [{ name: 'customer', message: 'Easebuzz needs a first name, email, and 10-digit phone.' }],
    };
  }

  const txnid = `SB${crypto.randomBytes(8).toString('hex')}`.slice(0, 25);
  const amount = amountString(order.total);
  const productinfo = 'SunoBro';
  const udf = ['', '', '', '', '', '', '', '', '', ''];
  udf[0] = String(order.id);
  const hash = requestHash({
    key: EASEBUZZ.KEY,
    txnid,
    amount,
    productinfo,
    firstname,
    email,
    udf,
    salt: EASEBUZZ.SALT,
  });
  const surl = callbackUrl();
  const body = new URLSearchParams({
    key: EASEBUZZ.KEY,
    txnid,
    amount,
    productinfo,
    firstname,
    phone,
    email,
    surl,
    furl: surl,
    hash,
    udf1: udf[0],
    udf2: '',
    udf3: '',
    udf4: '',
    udf5: '',
    udf6: '',
    udf7: '',
  });

  let data;
  try {
    const res = await fetch(`${EASEBUZZ.BASE_URL}/payment/initiateLink`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    data = await res.json();
  } catch {
    return {
      errors: [{ name: 'easebuzz', message: 'Easebuzz could not start checkout.' }],
    };
  }

  const accessKey = Number(data?.status) === 1 ? String(data.data || '') : '';
  if (!accessKey) {
    return {
      errors: [{
        name: 'easebuzz',
        message: data?.error_desc || data?.data || 'Easebuzz could not start checkout.',
      }],
    };
  }

  order.easebuzzTxnId = txnid;
  order.paymentGateway = 'easebuzz';
  await order.save();

  return {
    doc: {
      paymentOrderId: txnid,
      amount: Math.round(Number(amount) * 100),
      currency: (order.currency || 'INR').toUpperCase(),
      gateway: 'easebuzz',
      orderReference: order.reference,
      action: `${EASEBUZZ.BASE_URL}/pay/${encodeURIComponent(accessKey)}`,
    },
  };
};

const verifyRemote = async (txnid) => {
  const hash = sha512(`${EASEBUZZ.KEY}|${txnid}|${EASEBUZZ.SALT}`);
  const body = new URLSearchParams({ key: EASEBUZZ.KEY, txnid, hash });
  let data;
  try {
    const res = await fetch(EASEBUZZ.RETRIEVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    data = await res.json();
  } catch {
    return { ok: false, message: 'Easebuzz did not return a payment status.' };
  }
  const row = Array.isArray(data?.msg) ? data.msg[0] : data?.msg;
  const status = String(row?.status || '').toLowerCase();
  if (!row || status !== 'success') {
    return { ok: false, message: row?.error_Message || row?.error || 'Easebuzz has not captured this payment.' };
  }
  return {
    ok: true,
    paymentId: String(row.easepayid || ''),
    amount: String(row.amount || row.net_amount_debit || ''),
  };
};

const hashMatches = (body) => safeEqual(
  responseHash(body, EASEBUZZ.SALT),
  String(body.hash || '').toLowerCase(),
);

module.exports = {
  createPayment,
  verifyRemote,
  hashMatches,
  amountString,
};
