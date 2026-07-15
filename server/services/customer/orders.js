const {
  sequelize, Order, OrderItem, OrderStatusHistory, ProductVariant, Product,
} = require('../../database/models');
const orderReference = require('../../utils/order-reference');
const { PAGINATION } = require('../../utils/constant');

const SHIPPING_FEE = 0;
const TAX_RATE = 0;
const REFERENCE_RETRIES = 5;

// Prices/stock are always read fresh from the DB — the client-submitted
// subtotal/tax/total in CreateOrderPayload are display hints only and are
// never trusted for the amount actually charged.
const create = async ({ items, shipping }, customerId) => {
  const transaction = await sequelize.transaction();

  try {
    const skus = items.map((item) => item.sku);
    // Locking rows across an outer join (variant + product) isn't supported by
    // Postgres ("FOR UPDATE cannot be applied to the nullable side of an outer
    // join"), so lock the variants alone and fetch their products separately.
    const variants = await ProductVariant.findAll({
      where: { sku: skus },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const variantBySku = new Map(variants.map((v) => [v.sku, v]));

    const products = await Product.findAll({
      where: { id: variants.map((v) => v.productId) },
      transaction,
    });
    const productById = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let failure = null;
    const resolvedItems = [];

    items.forEach((item) => {
      if (failure) return;

      const variant = variantBySku.get(item.sku);
      if (!variant) {
        failure = { type: 'field-validation', errors: [{ name: 'sku', message: `Unknown SKU: ${item.sku}` }] };
        return;
      }
      if (variant.stock < item.qty) {
        failure = { type: 'conflict', errors: [{ name: 'stock', message: `Insufficient stock for SKU: ${item.sku}` }] };
        return;
      }

      const product = productById.get(variant.productId);
      const price = Number(variant.price ?? product.price);
      subtotal += price * item.qty;

      resolvedItems.push({
        productId: variant.productId,
        name: product.name,
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        price,
        qty: item.qty,
        variant,
        product,
      });
    });

    if (failure) {
      await transaction.rollback();

      return failure;
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
        }, { transaction });
      } catch (err) {
        if (err.name !== 'SequelizeUniqueConstraintError') throw err;
      }
    }
    if (!order) {
      throw new Error('Could not allocate an order reference. Try again.');
    }

    await Promise.all(resolvedItems.map((item) => OrderItem.create({
      orderId: order.id,
      productId: item.productId,
      name: item.name,
      size: item.size,
      color: item.color,
      sku: item.sku,
      price: item.price,
      qty: item.qty,
    }, { transaction })));

    await Promise.all(resolvedItems.map((item) => item.variant.decrement('stock', {
      by: item.qty,
      transaction,
    })));

    await OrderStatusHistory.create({
      orderId: order.id,
      status: 'pending',
      note: 'Order created.',
    }, { transaction });

    await transaction.commit();

    order.items = resolvedItems;

    return { doc: order };
  } catch (error) {
    await transaction.rollback();

    throw error;
  }
};

const get = async (id) => {
  const order = await Order.findByPk(id, { include: [{ model: OrderItem, as: 'items' }] });
  if (!order) {
    return { errors: [{ name: 'order', message: 'Order not found.' }] };
  }

  return { doc: order };
};

const listMine = async (customerId, { page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const offset = (currentPage - 1) * cappedLimit;

  const { rows, count } = await Order.findAndCountAll({
    where: { customerId },
    include: [{ model: OrderItem, as: 'items' }],
    order: [['createdAt', 'DESC']],
    limit: cappedLimit,
    offset,
  });

  return { doc: rows, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

module.exports = { create, get, listMine };
