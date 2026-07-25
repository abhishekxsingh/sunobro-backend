const mongoose = require('mongoose');
const { Product, ProductVariant } = require('../../database/models');
const { PAGINATION } = require('../../utils/constant');

const invalidId = (id) => !mongoose.isValidObjectId(id);

const generateSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const enrichWithVariantStats = async (products) => {
  const productIds = products.map((p) => p._id);
  const variants = await ProductVariant.find({ productId: { $in: productIds } });

  const statsByProductId = variants.reduce((map, v) => {
    const key = v.productId.toString();
    const s = map.get(key) || { variantCount: 0, totalStock: 0, qikinkSynced: true };
    s.variantCount += 1;
    s.totalStock += v.stock;
    if (!v.qikinkSku) s.qikinkSynced = false;
    map.set(key, s);
    return map;
  }, new Map());

  return products.map((p) => {
    const stats = statsByProductId.get(p.id) || { variantCount: 0, totalStock: 0, qikinkSynced: false };
    return { ...p.toObject({ virtuals: true }), ...stats };
  });
};

const list = async ({ page = 1, limit = PAGINATION.DEFAULT_LIMIT } = {}) => {
  const cappedLimit = Math.min(Number(limit) || PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const currentPage = Math.max(Number(page) || 1, 1);
  const skip = (currentPage - 1) * cappedLimit;

  const [products, count] = await Promise.all([
    Product.find({}).sort({ createdAt: -1 }).skip(skip).limit(cappedLimit),
    Product.countDocuments(),
  ]);

  const enriched = await enrichWithVariantStats(products);
  return { doc: enriched, meta: { totalRecords: count, page: currentPage, limit: cappedLimit } };
};

const get = async (id) => {
  if (invalidId(id)) return { errors: [{ name: 'product', message: 'Product not found.' }] };
  const product = await Product.findById(id);
  if (!product) {
    return { errors: [{ name: 'product', message: 'Product not found.' }] };
  }
  const variants = await ProductVariant.find({ productId: product._id });
  return { doc: { ...product.toObject({ virtuals: true }), variants } };
};

const create = async (payload) => {
  const slug = payload.slug || generateSlug(payload.name);
  try {
    const product = await Product.create({ ...payload, slug });
    return { doc: product };
  } catch (err) {
    if (err.code === 11000) {
      return { type: 'conflict', errors: [{ name: 'slug', message: `Slug already exists: ${slug}` }] };
    }
    throw err;
  }
};

const update = async (id, payload) => {
  const product = await Product.findByIdAndUpdate(
    id,
    { $set: payload },
    { new: true, runValidators: true },
  );
  if (!product) {
    return { errors: [{ name: 'product', message: 'Product not found.' }] };
  }
  return { doc: product };
};

const remove = async (id) => {
  if (invalidId(id)) return { errors: [{ name: 'product', message: 'Product not found.' }] };
  const product = await Product.findByIdAndDelete(id);
  if (!product) {
    return { errors: [{ name: 'product', message: 'Product not found.' }] };
  }
  await ProductVariant.deleteMany({ productId: id });
  return { doc: null };
};

const bulkCreate = async (products) => {
  const { created, errors } = await products.reduce(
    async (accPromise, payload) => {
      const acc = await accPromise;
      // eslint-disable-next-line no-await-in-loop
      const result = await create(payload);
      if (result.errors || result.type === 'conflict') {
        acc.errors.push({ payload, errors: result.errors });
      } else {
        acc.created.push(result.doc);
      }
      return acc;
    },
    Promise.resolve({ created: [], errors: [] }),
  );

  return { doc: created, errors };
};

module.exports = {
  list, get, create, update, remove, bulkCreate,
};
