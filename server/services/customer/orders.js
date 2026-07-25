const { Order, ProductVariant, Product } = require('../../database/models');
const orderReference = require('../../utils/order-reference');
const { PAGINATION } = require('../../utils/constant');

const SHIPPING_FEE = 0;
const TAX_RATE = 0;
const REFERENCE_RETRIES = 5;

// Prices/stock are always read fresh from the DB — the client-submitted
// subtotal/tax/total in CreateOrderPayload are display hints only and are
// never trusted for the amount actually charged.
const create = async ({ items, shipping }, customerId) => {
  const skus = items.map((item) => item.sku);

  const variants = await ProductVariant.find({ sku: { $in: skus } });
  const variantBySku = new Map(variants.map((v) => [v.sku, v]));

  const products = await Product.find({ _id: { $in: variants.map((v) => v.productId) } });
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  let failure = null;
  const resolvedItems = [];

  for (let i = 0; i < items.length; i += 1) {
    if (failure) break;
    const item = items[i];

    const variant = variantBySku.get(item.sku);
    if (!variant) {
      failure = { type: 'field-validation', errors: [{ name: 'sku', message: `Unknown SKU: ${item.sku}` }] };
      break;
    }
    if (variant.stock < item.qty) {
      failure = { type: 'conflict', errors: [{ name: 'stock', message: `Insufficient stock for SKU: ${item.sku}` }] };
      break;
    }

    const product = productById.get(variant.productId.toString());
    const price = variant.price ?? product.price;
    subtotal += price * item.qty;

    resolvedItems.push({
      variant, product, price, qty: item.qty,
    });
  }

  if (failure) return failure;

  // Atomically decrement stock per variant. Using findOneAndUpdate with a
  // stock condition makes each decrement safe without a multi-document
  // transaction — if stock dropped below qty between the read and the
  // update, the update returns null and we roll back any previous decrements.
  const decremented = [];
  for (let i = 0; i < resolvedItems.length; i += 1) {
    const { variant, qty } = resolvedItems[i];
    // eslint-disable-next-line no-await-in-loop
    const updated = await ProductVariant.findOneAndUpdate(
      { _id: variant._id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
    );

    if (!updated) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(decremented.map(({ id, q }) => ProductVariant.findByIdAndUpdate(id, { $inc: { stock: q } })));
      return { type: 'conflict', errors: [{ name: 'stock', message: `Insufficient stock for SKU: ${variant.sku}` }] };
    }

    decremented.push({ id: variant._id, q: qty });
  }

  const tax = Number((subtotal * TAX_RATE).toFixed(2));
  const total = Number((subtotal + SHIPPING_FEE + tax).toFixed(2));
  const currency = resolvedItems[0]?.product.currency || 'INR';

  let order;
  for (let attempt = 0; attempt < REFERENCE_RETRIES && !order; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      order = await Order.create({
        reference: orderReference.generate(),
        customerId: customerId || null,
        status: 'pending',
        subtotal,
        shippingFee: SHIPPING_FEE,
        tax,
        total,
        currency,
        shippingFirstName: shipping.firstName,
        shippingLastName: shipping.lastName,
        shippingStreet: shipping.street,
        shippingCity: shipping.city,
        shippingPostalCode: shipping.postalCode,
        shippingCountry: shipping.country,
        items: resolvedItems.map(({
          variant, product, price, qty,
        }) => ({
          productId: product._id,
          name: product.name,
          size: variant.size,
          color: variant.color,
          sku: variant.sku,
          price,
          qty,
        })),
        statusHistory: [{ status: 'pending', note: 'Order created.' }],
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }

  if (!order) {
    throw new Error('Could not allocate an order reference. Try again.');
  }

  return { doc: order };
};

const get = async (id) => {
  const order = await Order.findById(id);
  if (!order) {
    return { errors: [{ name: 'order', message: 'Order not found.' }] };
  }

  return { doc: order };
};

const listMine = async (customerId, { page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * cappedLimit;

  const [orders, count] = await Promise.all([
    Order.find({ customerId }).sort({ createdAt: -1 }).skip(skip).limit(cappedLimit),
    Order.countDocuments({ customerId }),
  ]);

  return { doc: orders, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

module.exports = { create, get, listMine };
