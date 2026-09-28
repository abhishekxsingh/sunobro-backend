const { Product, ProductVariant } = require('../../database/models');
const { QIKINK } = require('../../config');
const logger = require('../../utils/logger');

const USER_AGENT = 'SunoBro/1.0';

const baseUrl = () => 'https://api.qikink.com';

let cachedToken = null;
let cachedTokenUntil = 0;

const isConfigured = () => Boolean(QIKINK.CLIENT_ID && QIKINK.CLIENT_SECRET);

const qikinkMessage = (data, status) => (
  data?.error
  || data?.message
  || `Qikink request failed (${status})`
);

const request = async (path, { method = 'GET', headers = {}, body } = {}) => {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...headers,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
};

const getAccessToken = async (force = false) => {
  if (!isConfigured()) {
    throw new Error('Qikink credentials are not configured.');
  }

  if (!force && cachedToken && Date.now() < cachedTokenUntil) {
    return cachedToken;
  }

  const body = new URLSearchParams();
  body.append('ClientId', QIKINK.CLIENT_ID);
  body.append('client_secret', QIKINK.CLIENT_SECRET);

  const { res, data } = await request('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok || !data?.Accesstoken || data?.error) {
    throw new Error(qikinkMessage(data, res.status));
  }

  const ttlSeconds = Number(data.expires_in) || 3600;
  cachedToken = data.Accesstoken;
  cachedTokenUntil = Date.now() + Math.max((ttlSeconds - 60) * 1000, 30_000);
  return cachedToken;
};

const qikinkHeaders = async () => {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ClientId: QIKINK.CLIENT_ID,
    Accesstoken: token,
  };
};

const getStatus = async () => {
  if (!isConfigured()) {
    return {
      connected: false,
      message: 'Set QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET in .env (from dashboard.qikink.com → Integration → Custom API).',
    };
  }

  try {
    await getAccessToken(true);
    return {
      connected: true,
      env: QIKINK.ENV,
      message: `Connected to Qikink (${QIKINK.ENV}).`,
    };
  } catch (err) {
    return {
      connected: false,
      message: err.message || 'Could not authenticate with Qikink.',
    };
  }
};

/**
 * Catalog "sync" for SunoBro means confirming each variant has a Qikink SKU
 * that already exists under My Products in the Qikink dashboard. Products are
 * designed there first; we only push paid orders by SKU.
 */
const syncProduct = async (productId) => {
  const product = await Product.findById(productId);
  if (!product) {
    return { synced: 0, message: 'Product not found.' };
  }

  const variants = await ProductVariant.find({ productId: product._id });
  if (variants.length === 0) {
    return {
      synced: 0,
      message: 'No variants on this product. Add sizes/colors (and Qikink SKUs) first.',
    };
  }

  const missing = variants.filter((v) => !v.qikinkSku);
  if (missing.length > 0) {
    return {
      synced: 0,
      message: `${missing.length} variant(s) missing qikinkSku. Set the SKU from Qikink → My Products.`,
    };
  }

  if (!isConfigured()) {
    return {
      synced: 0,
      message: 'Variants have Qikink SKUs, but QIKINK_CLIENT_ID / QIKINK_CLIENT_SECRET are not set.',
    };
  }

  try {
    await getAccessToken(true);
    return {
      synced: variants.length,
      message: `Ready: ${variants.length} variant(s) mapped. Paid orders will push to Qikink (${QIKINK.ENV}).`,
    };
  } catch (err) {
    return {
      synced: 0,
      message: err.message || 'Qikink auth failed.',
    };
  }
};

const syncAll = async () => {
  const products = await Product.find({});
  let synced = 0;
  const messages = [];

  for (let i = 0; i < products.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await syncProduct(products[i].id);
    synced += result.synced || 0;
    messages.push(`${products[i].name}: ${result.message}`);
  }

  return { synced, message: messages.join(' | ') || 'No products.' };
};

const toOrderNumber = (reference, id) => {
  const raw = String(reference || id || '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (raw || 'SBORDER').slice(0, 15);
};

const splitStreet = (street) => {
  const text = String(street || '').trim();
  return {
    address1: text.slice(0, 90),
    address2: text.slice(90, 180),
  };
};

const countryCodeOf = (country) => {
  const raw = String(country || 'IN').trim();
  if (raw.toLowerCase().includes('india') || raw.toLowerCase() === 'in') return 'IN';
  return raw.slice(0, 2).toUpperCase();
};

const createOrderFromPaidOrder = async (order) => {
  if (!isConfigured()) {
    return {
      skipped: true,
      message: 'Qikink not configured — order marked paid but not sent to fulfilment.',
    };
  }

  if (order.qikinkOrderId) {
    return { orderId: order.qikinkOrderId, status: order.qikinkStatus || 'submitted' };
  }

  const lineItems = [];
  for (let i = 0; i < (order.items || []).length; i += 1) {
    const item = order.items[i];
    let { qikinkSku } = item;
    if (!qikinkSku) {
      // eslint-disable-next-line no-await-in-loop
      const variant = await ProductVariant.findOne({ sku: item.sku });
      qikinkSku = variant?.qikinkSku || item.sku;
    }
    lineItems.push({
      search_from_my_products: 1,
      sku: String(qikinkSku).slice(0, 50),
      quantity: String(item.qty),
      price: String(Math.round(item.price)),
    });
  }

  const { address1, address2 } = splitStreet(order.shippingStreet);
  const orderNumber = toOrderNumber(order.reference, order.id);
  const payload = {
    order_number: orderNumber,
    qikink_shipping: '1',
    gateway: 'Prepaid',
    total_order_value: String(Math.round(order.total)),
    line_items: lineItems,
    shipping_address: {
      first_name: order.shippingFirstName,
      last_name: order.shippingLastName || '',
      address1,
      address2,
      phone: order.shippingPhone || '9999999999',
      email: order.shippingEmail || 'orders@sunobro.com',
      city: order.shippingCity,
      zip: order.shippingPostalCode,
      province: order.shippingState || order.shippingCity,
      country_code: countryCodeOf(order.shippingCountry),
    },
  };

  try {
    const headers = await qikinkHeaders();
    const { res, data } = await request('/api/order/create', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const created = res.ok
      && data?.order_id
      && !data?.error
      && String(data.status_code || '200') === '200';

    if (!created) {
      const errMsg = qikinkMessage(data, res.status);
      logger.error({ data, orderId: order.id }, 'qikink-create-order-failed');
      return { error: errMsg };
    }

    return {
      orderId: String(data.order_id),
      status: 'created',
      raw: data,
    };
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'qikink-create-order-error');
    return { error: err.message || 'Qikink request failed' };
  }
};

module.exports = {
  getStatus,
  syncProduct,
  syncAll,
  createOrderFromPaidOrder,
  isConfigured,
};
