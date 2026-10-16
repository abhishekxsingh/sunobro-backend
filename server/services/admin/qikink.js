const { Order, Product, ProductVariant } = require('../../database/models');
const { QIKINK } = require('../../config');
const logger = require('../../utils/logger');
const {
  isConfigured, qikinkMessage, request, getAccessToken, qikinkHeaders, listOrders,
} = require('./qikink-client');

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

// Qikink's own API has no cancel/update/webhook endpoints — orders are
// created once and their progress is polled via /api/order/list.
const FULFILMENT = {
  SUBMITTING: 'submitting',
  CREATED: 'created',
  SKIPPED: 'skipped',
  ERROR: 'error',
};

const SYNC_TTL_MS = 2 * 60 * 1000; // Qikink allows 60 req/min across the account
const SUBMIT_LOCK_MS = 2 * 60 * 1000; // a crashed push frees its claim after this
const MAX_AUTO_ATTEMPTS = 3;
const AUTO_RETRY_BACKOFF_MS = 10 * 60 * 1000;
const AUTO_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

// Paid orders, and COD orders (Qikink collects the cash on delivery), are the
// ones Qikink should print.
const PUSHABLE = {
  $or: [{ status: 'paid' }, { status: 'pending', paymentGateway: 'cod' }],
};

const isPushable = (order) => Boolean(order) && !order.qikinkOrderId
  && (order.status === 'paid' || (order.status === 'pending' && order.paymentGateway === 'cod'));

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

const buildOrderPayload = async (order) => {
  const lineItems = [];
  const missingSkus = [];
  for (let i = 0; i < (order.items || []).length; i += 1) {
    const item = order.items[i];
    let { qikinkSku } = item;
    if (!qikinkSku && item.sku) {
      // eslint-disable-next-line no-await-in-loop
      const variant = await ProductVariant.findOne({ sku: item.sku });
      qikinkSku = variant?.qikinkSku;
    }
    if (!qikinkSku) {
      missingSkus.push(item.sku || item.name || `item ${i + 1}`);
    } else {
      lineItems.push({
        search_from_my_products: 1,
        sku: String(qikinkSku).slice(0, 50),
        quantity: String(item.qty),
        price: String(Math.round(item.price)),
      });
    }
  }

  if (missingSkus.length > 0) {
    return {
      error: `Qikink SKU is not set for: ${missingSkus.join(', ')}. Set qikinkSku on the variant.`,
    };
  }

  const { address1, address2 } = splitStreet(order.shippingStreet);
  return {
    payload: {
      order_number: toOrderNumber(order.reference, order.id),
      qikink_shipping: '1',
      gateway: order.paymentGateway === 'cod' ? 'COD' : 'Prepaid',
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
    },
  };
};

const sendOrder = async (order) => {
  const built = await buildOrderPayload(order);
  if (built.error) return { error: built.error };

  const { payload } = built;
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
      logger.error({ data, orderId: order.id }, 'qikink-create-order-failed');
      const message = qikinkMessage(data, res.status);
      if (/invalid sku/i.test(message)) {
        const skus = payload.line_items.map((item) => item.sku).join(', ');
        return {
          error: `Qikink (${QIKINK.ENV}) rejected SKU ${skus} — it must exist in Qikink → My Products for that account.`,
        };
      }
      return { error: message };
    }

    return { orderId: String(data.order_id), orderNumber: payload.order_number };
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'qikink-create-order-error');
    return { error: err.message || 'Qikink request failed' };
  }
};

// A previous attempt may have reached Qikink even though we never stored the
// response (timeout, crash). Look the order up by reference before creating
// it again so a retry never prints a second copy.
const findExistingRemoteOrder = async (order) => {
  try {
    const rows = await listOrders({
      order_reference_no: order.qikinkOrderNumber || toOrderNumber(order.reference, order.id),
    });
    return rows[0] || null;
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'qikink-existing-lookup-failed');
    return null;
  }
};

const SHIPPED_STATUSES = new Set([
  'manifested',
  'dispatch ready',
  'picked up',
  'in-transit',
  'out for delivery',
  'delivery rescheduled',
  'consignee unavailable',
  'not attempted',
  'maximum attempts reached',
  'misrouted',
  'oda',
  'open delivery refused',
  'otp not shared',
  'otp verification cancelled',
  'refused to accept',
  'residence / office closed',
  'incorrect/incomplete address',
  'self collect',
  'exception',
]);

// RTO / Returned / Lost are left on the store status the admin sees, with the
// Qikink label recorded alongside — they need a human decision (refund, reship).
const storeStatusFromQikink = (qikinkStatus, current) => {
  const label = String(qikinkStatus || '').trim().toLowerCase();
  if (label === 'delivered') return 'delivered';
  if (label === 'cancelled') return 'cancelled';
  if (SHIPPED_STATUSES.has(label)) {
    if (current === 'delivered' || current === 'cancelled') return current;
    return 'shipped';
  }
  return current;
};

const applyQikinkRow = (order, row) => {
  // Mongoose documents are updated in place, then saved by the caller.
  /* eslint-disable no-param-reassign */
  const shipping = row.shipping || {};
  const previousLabel = order.qikinkStatus;
  const nextStatus = storeStatusFromQikink(row.status, order.status);
  order.qikinkOrderId = row.order_id ? String(row.order_id) : order.qikinkOrderId;
  order.qikinkStatus = row.status || order.qikinkStatus;
  order.qikinkAwb = shipping.awb || order.qikinkAwb;
  // Qikink returns ".../?awb=" before a shipment exists — only keep real links.
  order.qikinkTrackingLink = shipping.awb
    ? shipping.tracking_link || order.qikinkTrackingLink
    : order.qikinkAwb && order.qikinkTrackingLink;
  order.qikinkCourier = shipping.courier_provider_name
    ? String(shipping.courier_provider_name).trim()
    : order.qikinkCourier;
  order.qikinkError = undefined;
  if (nextStatus !== order.status || (row.status && row.status !== previousLabel)) {
    order.status = nextStatus;
    order.statusHistory.push({
      status: nextStatus,
      note: `Qikink status: ${row.status}`,
    });
  }
  /* eslint-enable no-param-reassign */
};

/**
 * Push a paid (or COD) order to Qikink exactly once. The order is claimed
 * atomically (pushable, no Qikink id, not mid-submit) so the payment verify call and
 * the Razorpay webhook racing each other — or an admin retry — cannot both
 * create it.
 */
const fulfillOrder = async (orderId) => {
  if (!isConfigured()) {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, qikinkOrderId: null, ...PUSHABLE },
      {
        $set: {
          qikinkStatus: FULFILMENT.SKIPPED,
          qikinkError: 'Qikink not configured — order marked paid but not sent to fulfilment.',
        },
      },
      { new: true },
    );
    return { order: order || await Order.findById(orderId), pushed: false };
  }

  const now = new Date();
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      qikinkOrderId: null,
      $and: [PUSHABLE, {
        $or: [
          { qikinkStatus: { $ne: FULFILMENT.SUBMITTING } },
          { qikinkLastAttemptAt: { $lt: new Date(now.getTime() - SUBMIT_LOCK_MS) } },
        ],
      }],
    },
    {
      $set: { qikinkStatus: FULFILMENT.SUBMITTING, qikinkLastAttemptAt: now },
      $inc: { qikinkAttempts: 1 },
    },
    { new: true },
  );

  if (!order) {
    return { order: await Order.findById(orderId), pushed: false };
  }

  try {
    const existing = order.qikinkAttempts > 1 ? await findExistingRemoteOrder(order) : null;
    if (existing) {
      applyQikinkRow(order, existing);
      order.qikinkOrderNumber = order.qikinkOrderNumber || toOrderNumber(order.reference, order.id);
      order.qikinkSyncedAt = new Date();
      order.statusHistory.push({
        status: order.status,
        note: `Qikink order already existed: ${order.qikinkOrderId}`,
      });
      await order.save();
      return { order, pushed: true };
    }

    const result = await sendOrder(order);
    if (result.orderId) {
      order.qikinkOrderId = result.orderId;
      order.qikinkOrderNumber = result.orderNumber;
      order.qikinkStatus = FULFILMENT.CREATED;
      order.qikinkError = undefined;
      order.statusHistory.push({
        status: order.status,
        note: `Qikink order created: ${order.qikinkOrderId}`,
      });
    } else {
      order.qikinkStatus = FULFILMENT.ERROR;
      order.qikinkError = result.error;
      order.statusHistory.push({
        status: order.status,
        note: `Qikink fulfilment failed (attempt ${order.qikinkAttempts}): ${result.error}`,
      });
    }
    await order.save();
    return { order, pushed: Boolean(result.orderId) };
  } catch (err) {
    logger.error({ err, orderId: order.id }, 'qikink-fulfill-failed');
    order.qikinkStatus = FULFILMENT.ERROR;
    order.qikinkError = err.message || 'Qikink fulfilment failed';
    await order.save().catch(() => {});
    return { order, pushed: false };
  }
};

const CLOSED_STATUSES = ['delivered', 'cancelled'];

const isSyncable = (order) => Boolean(order?.qikinkOrderId)
  && !CLOSED_STATUSES.includes(order.status);

const isStale = (order, now) => !order.qikinkSyncedAt
  || now - new Date(order.qikinkSyncedAt).getTime() > SYNC_TTL_MS;

/**
 * Refresh Qikink status/tracking for the given orders, one `id` lookup each —
 * live Qikink returns 500 for the documented multi-order `ids` filter. Orders
 * synced within SYNC_TTL_MS are skipped unless `force`; the cron's 50 orders
 * per 15 minutes stays far inside the 60 req/min limit.
 */
const syncOrders = async (orders, { force = false } = {}) => {
  if (!isConfigured()) return orders;
  const now = Date.now();
  const targets = (orders || []).filter((o) => isSyncable(o) && (force || isStale(o, now)));

  for (let i = 0; i < targets.length; i += 1) {
    const order = targets[i];
    try {
      // eslint-disable-next-line no-await-in-loop
      const rows = await listOrders({ id: order.qikinkOrderId });
      const row = rows.find((r) => String(r.order_id) === String(order.qikinkOrderId));
      if (row) applyQikinkRow(order, row);
      order.qikinkSyncedAt = new Date();
      // eslint-disable-next-line no-await-in-loop
      await order.save();
    } catch (err) {
      logger.error({ err, orderId: order.id }, 'qikink-order-sync-failed');
    }
  }
  return orders;
};

const syncOrder = async (order, opts) => {
  if (order) await syncOrders([order], opts);
  return order;
};

/** Background job: refresh in-flight orders oldest-synced first. */
const syncActiveOrders = async ({ limit = 50 } = {}) => {
  if (!isConfigured()) return { synced: 0 };
  const orders = await Order.find({
    status: { $nin: CLOSED_STATUSES },
    qikinkOrderId: { $ne: null },
  }).sort({ qikinkSyncedAt: 1 }).limit(limit);
  await syncOrders(orders, { force: true });
  return { synced: orders.length };
};

/**
 * Background job: retry pushes that failed recently. Only orders this flow
 * already attempted (qikinkLastAttemptAt set) inside the last 24h qualify, so
 * old or manually-marked-paid orders are never pushed without an admin.
 */
const retryFailedPushes = async ({ limit = 10 } = {}) => {
  if (!isConfigured()) return { retried: 0, pushed: 0 };
  const now = Date.now();
  const orders = await Order.find({
    ...PUSHABLE,
    qikinkOrderId: null,
    qikinkStatus: { $in: [FULFILMENT.ERROR, FULFILMENT.SUBMITTING] },
    qikinkAttempts: { $lt: MAX_AUTO_ATTEMPTS },
    qikinkLastAttemptAt: {
      $gte: new Date(now - AUTO_RETRY_WINDOW_MS),
      $lt: new Date(now - AUTO_RETRY_BACKOFF_MS),
    },
  }).select('_id').limit(limit);

  let pushed = 0;
  for (let i = 0; i < orders.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const result = await fulfillOrder(orders[i]._id);
    if (result.pushed) pushed += 1;
  }
  return { retried: orders.length, pushed };
};

module.exports = {
  FULFILMENT,
  getStatus,
  syncProduct,
  syncAll,
  fulfillOrder,
  isPushable,
  listOrders,
  syncOrder,
  syncOrders,
  syncActiveOrders,
  retryFailedPushes,
  storeStatusFromQikink,
  isConfigured,
};
