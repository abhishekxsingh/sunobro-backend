const { Product, ProductVariant } = require('../../database/models');
const { QIKINK } = require('../../config');
const logger = require('../../utils/logger');

const baseUrl = () => (
  QIKINK.ENV === 'live'
    ? 'https://api.qikink.com'
    : 'https://sandbox.qikink.com'
);

let cachedToken = null;
let cachedTokenAt = 0;
const TOKEN_TTL_MS = 50 * 60 * 1000;

const isConfigured = () => Boolean(QIKINK.CLIENT_ID && QIKINK.CLIENT_SECRET);

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

const getAccessToken = async (force = false) => {
  if (!isConfigured()) {
    throw new Error('Qikink credentials are not configured.');
  }

  if (!force && cachedToken && Date.now() - cachedTokenAt < TOKEN_TTL_MS) {
    return cachedToken;
  }

  const body = new URLSearchParams();
  body.append('ClientId', QIKINK.CLIENT_ID);
  body.append('client_secret', QIKINK.CLIENT_SECRET);

  const res = await fetch(`${baseUrl()}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.Accesstoken) {
    throw new Error(data?.message || data?.error || `Qikink auth failed (${res.status})`);
  }

  cachedToken = data.Accesstoken;
  cachedTokenAt = Date.now();
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
    let qikinkSku = item.qikinkSku;
    if (!qikinkSku) {
      // eslint-disable-next-line no-await-in-loop
      const variant = await ProductVariant.findOne({ sku: item.sku });
      qikinkSku = variant?.qikinkSku || item.sku;
    }
    lineItems.push({
      search_from_my_products: 1,
      sku: qikinkSku,
      quantity: String(item.qty),
      price: String(Math.round(item.price)),
    });
  }

  const countryRaw = (order.shippingCountry || 'IN').trim();
  let countryCode = countryRaw.slice(0, 2).toUpperCase();
  if (countryRaw.toLowerCase().includes('india') || countryRaw.toLowerCase() === 'in') {
    countryCode = 'IN';
  }

  const orderNumber = String(order.reference || order.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 15);
  const payload = {
    order_number: orderNumber,
    qikink_shipping: '1',
    gateway: 'Prepaid',
    total_order_value: String(Math.round(order.total)),
    line_items: lineItems,
    shipping_address: {
      first_name: order.shippingFirstName,
      last_name: order.shippingLastName,
      address1: order.shippingStreet,
      address2: '',
      phone: order.shippingPhone || '9999999999',
      email: order.shippingEmail || 'orders@sunobro.com',
      city: order.shippingCity,
      zip: order.shippingPostalCode,
      province: order.shippingState || order.shippingCity,
      country_code: countryCode,
    },
  };

  try {
    const headers = await qikinkHeaders();
    const res = await fetch(`${baseUrl()}/api/order`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data?.message || data?.error || JSON.stringify(data) || `HTTP ${res.status}`;
      logger.error({ data, orderId: order.id }, 'qikink-create-order-failed');
      return { error: errMsg };
    }

    const qikinkId = data?.order_id || data?.id || data?.Order_Id || data?.orderId;
    return {
      orderId: qikinkId || orderNumber,
      status: data?.status || 'submitted',
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
