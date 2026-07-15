const {
  sequelize, Order, OrderItem, OrderStatusHistory, ProductVariant, Product,
} = require('../database/models');
const orderReference = require('../utils/order-reference');
const HttpError = require('../utils/http-error');

const SHIPPING_FEE = 0;
const TAX_RATE = 0;
const REFERENCE_RETRIES = 5;

// Prices/stock are always read fresh from the DB — the client-submitted
// subtotal/tax/total in CreateOrderPayload are display hints only and are
// never trusted for the amount actually charged.
const create = async ({ items, shipping }, customerId) => sequelize.transaction(async (tx) => {
  const skus = items.map((item) => item.sku);
  // Locking rows across an outer join (variant + product) isn't supported by
  // Postgres ("FOR UPDATE cannot be applied to the nullable side of an outer
  // join"), so lock the variants alone and fetch their products separately.
  const variants = await ProductVariant.findAll({
    where: { sku: skus },
    transaction: tx,
    lock: tx.LOCK.UPDATE,
  });
  const variantBySku = new Map(variants.map((v) => [v.sku, v]));

  const products = await Product.findAll({
    where: { id: variants.map((v) => v.productId) },
    transaction: tx,
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const resolvedItems = items.map((item) => {
    const variant = variantBySku.get(item.sku);
    if (!variant) throw new HttpError(400, `Unknown SKU: ${item.sku}`);
    if (variant.stock < item.qty) throw new HttpError(409, `Insufficient stock for SKU: ${item.sku}`);

    const product = productById.get(variant.productId);
    const price = Number(variant.price ?? product.price);
    subtotal += price * item.qty;

    return {
      productId: variant.productId,
      name: product.name,
      size: variant.size,
      color: variant.color,
      sku: variant.sku,
      price,
      qty: item.qty,
      variant,
      product,
    };
  });

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
      }, { transaction: tx });
    } catch (err) {
      if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    }
  }
  if (!order) throw new HttpError(500, 'Could not allocate an order reference. Try again.');

  await Promise.all(resolvedItems.map((item) => OrderItem.create({
    orderId: order.id,
    productId: item.productId,
    name: item.name,
    size: item.size,
    color: item.color,
    sku: item.sku,
    price: item.price,
    qty: item.qty,
  }, { transaction: tx })));

  await Promise.all(resolvedItems.map((item) => item.variant.decrement('stock', {
    by: item.qty,
    transaction: tx,
  })));

  await OrderStatusHistory.create({
    orderId: order.id,
    status: 'pending',
    note: 'Order created.',
  }, { transaction: tx });

  order.items = resolvedItems;
  return order;
});

const getById = async (id) => {
  const order = await Order.findByPk(id, { include: [{ model: OrderItem, as: 'items' }] });
  if (!order) throw new HttpError(404, 'Order not found.');
  return order;
};

const listMine = (customerId) => Order.findAll({
  where: { customerId },
  include: [{ model: OrderItem, as: 'items' }],
  order: [['createdAt', 'DESC']],
});

module.exports = { create, getById, listMine };
