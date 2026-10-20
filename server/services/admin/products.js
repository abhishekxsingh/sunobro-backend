const mongoose = require('mongoose');
const { Product, ProductVariant } = require('../../database/models');
const { PAGINATION } = require('../../utils/constant');
const { toFullProductDTO } = require('../../utils/serializers');

const invalidId = (id) => !mongoose.isValidObjectId(id);

const generateSlug = (name) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const slugifyPart = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '-')
  .replace(/[^A-Z0-9-]/g, '');

const variantKey = (size, color) => `${String(size).trim().toLowerCase()}|${String(color).trim().toLowerCase()}`;

const defaultSku = (slug, size, color) => `${slugifyPart(slug)}-${slugifyPart(color)}-${slugifyPart(size)}`;

const conflict = (name, message) => ({ type: 'conflict', errors: [{ name, message }] });

const hasVariantInput = (payload) => Array.isArray(payload.variants)
  || Array.isArray(payload.colors)
  || payload.qikinkSku !== undefined;

/**
 * Each variant (size × colour) maps to exactly one Qikink "My Products" SKU —
 * that SKU is what tells Qikink which garment, colour, size and design to print.
 * Explicit `variants` are the normal path; sizes × colours is a convenience that
 * leaves Qikink SKUs empty unless there is a single colour (legacy BASE-SIZE).
 */
const normalizeVariants = (slug, payload) => {
  let rows = payload.variants;
  if (!Array.isArray(rows) || rows.length === 0) {
    const sizes = payload.sizes?.length ? payload.sizes : ['M'];
    const colors = payload.colors?.length ? payload.colors : ['Black'];
    const base = colors.length === 1 && payload.qikinkSku ? payload.qikinkSku.trim() : '';
    rows = sizes.flatMap((size) => colors.map((color) => ({
      size,
      color,
      qikinkSku: base ? `${base}-${slugifyPart(size)}` : undefined,
    })));
  }

  return rows.map((v) => ({
    size: String(v.size).trim(),
    color: String(v.color).trim(),
    sku: v.sku?.trim() || defaultSku(slug, v.size, v.color),
    stock: v.stock ?? payload.stock,
    price: v.price ?? undefined,
    qikinkSku: v.qikinkSku?.trim() || undefined,
    // undefined = leave the stored image alone; '' = clear it.
    image: v.image === undefined ? undefined : String(v.image).trim(),
  }));
};

const validateVariants = (rows) => {
  const errors = [];
  const flagDuplicates = (field, keyOf, message) => {
    const counts = new Map();
    rows.forEach((row) => {
      const key = keyOf(row);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });
    [...counts.entries()].filter(([, n]) => n > 1)
      .forEach(([key]) => errors.push({ name: field, message: message(key) }));
  };

  if (rows.length === 0) errors.push({ name: 'variants', message: 'Add at least one size/colour variant.' });
  flagDuplicates('variants', (r) => variantKey(r.size, r.color), (k) => `Duplicate variant ${k.replace('|', ' / ')}.`);
  flagDuplicates('sku', (r) => r.sku, (k) => `Duplicate SKU ${k}.`);
  // Two variants on one Qikink SKU means one of them prints the wrong item.
  flagDuplicates('qikinkSku', (r) => r.qikinkSku, (k) => `Qikink SKU ${k} is used by more than one variant.`);
  return errors;
};

const isEnabled = (v) => v.enabled !== false;

// Only switched-on variants need a Qikink Store SKU: a colour that is off
// can stay unmapped without blocking the product.
const mappingStats = (variants) => {
  const enabled = variants.filter(isEnabled);
  const mappedCount = enabled.filter((v) => Boolean(v.qikinkSku)).length;
  return {
    variantCount: variants.length,
    enabledCount: enabled.length,
    mappedCount,
    qikinkSynced: enabled.length > 0 && mappedCount === enabled.length,
    totalStock: variants.reduce((sum, v) => sum + (v.stock || 0), 0),
  };
};

// New products start in review; an admin publishes them. Active needs every
// switched-on variant mapped to Qikink and a cover image.
const resolveStatus = (requested, current, variants, images = []) => {
  const status = requested || current || 'review';
  if (status !== 'active') return { status };
  const { qikinkSynced, mappedCount, enabledCount } = mappingStats(variants);
  if (!qikinkSynced) {
    return conflict(
      'status',
      enabledCount === 0
        ? 'Switch on at least one colour/size before publishing.'
        : `Map every available variant to a Qikink Store SKU before publishing (${mappedCount}/${enabledCount} mapped).`,
    );
  }
  if (!images.length) return conflict('status', 'Add a cover image before publishing.');
  return { status };
};

const skuTakenElsewhere = async (rows, productId) => {
  const clash = await ProductVariant.findOne({
    sku: { $in: rows.map((r) => r.sku) },
    ...(productId ? { productId: { $ne: productId } } : {}),
  });
  return clash ? conflict('sku', `SKU ${clash.sku} is already used by another product.`) : null;
};

const toDTO = (product, variants) => toFullProductDTO({
  ...product.toObject({ virtuals: true }),
  ...mappingStats(variants),
}, variants);

const enrichWithVariantStats = async (products) => {
  const variants = await ProductVariant.find({ productId: { $in: products.map((p) => p._id) } });
  const byProduct = variants.reduce((map, v) => {
    const key = v.productId.toString();
    map.set(key, [...(map.get(key) || []), v]);
    return map;
  }, new Map());

  return products.map((p) => toFullProductDTO({
    ...p.toObject({ virtuals: true }),
    ...mappingStats(byProduct.get(p.id) || []),
  }, []));
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
  return { doc: toDTO(product, variants) };
};

const inStockFor = (trackInventory, variants) => !trackInventory
  || variants.some((v) => v.stock > 0);

const create = async (payload) => {
  const {
    colors, stock, qikinkSku, variants, status, ...productFields
  } = payload;
  const slug = productFields.slug || generateSlug(productFields.name);

  const rows = normalizeVariants(slug, {
    sizes: productFields.sizes, colors, stock: stock ?? 100, qikinkSku, variants,
  });
  const invalid = validateVariants(rows);
  if (invalid.length) return { errors: invalid };

  const resolved = resolveStatus(status, null, rows, productFields.images || []);
  if (resolved.errors) return resolved;

  const taken = await skuTakenElsewhere(rows, null);
  if (taken) return taken;

  let product;
  try {
    product = await Product.create({
      ...productFields,
      slug,
      status: resolved.status,
      sizes: productFields.sizes?.length ? productFields.sizes : [...new Set(rows.map((r) => r.size))],
      inStock: inStockFor(productFields.trackInventory, rows),
    });
  } catch (err) {
    if (err.code === 11000) return conflict('slug', `Slug already exists: ${slug}`);
    throw err;
  }

  try {
    await ProductVariant.insertMany(rows.map((r) => ({ ...r, productId: product._id })));
  } catch (err) {
    await Product.findByIdAndDelete(product._id);
    if (err.code === 11000) return conflict('sku', 'A variant SKU already exists.');
    throw err;
  }

  const savedVariants = await ProductVariant.find({ productId: product._id });
  return { doc: toDTO(product, savedVariants) };
};

// Update variants in place keyed by size/colour so SKUs (which past orders
// reference), ids and stock survive an edit.
const syncVariants = async (product, rows) => {
  const existing = await ProductVariant.find({ productId: product._id });
  const existingByKey = new Map(existing.map((v) => [variantKey(v.size, v.color), v]));
  const keep = new Set(rows.map((row) => variantKey(row.size, row.color)));

  const removed = existing.filter((v) => !keep.has(variantKey(v.size, v.color)));
  if (removed.length) {
    await ProductVariant.deleteMany({ _id: { $in: removed.map((v) => v._id) } });
  }

  await Promise.all(rows.map(async (row) => {
    const current = existingByKey.get(variantKey(row.size, row.color));
    if (!current) {
      return ProductVariant.create({ ...row, productId: product._id });
    }
    current.size = row.size;
    current.color = row.color;
    current.sku = row.sku;
    current.qikinkSku = row.qikinkSku;
    current.price = row.price;
    if (row.stock !== undefined) current.stock = row.stock;
    if (row.image !== undefined) current.image = row.image || undefined;
    return current.save();
  }));

  return ProductVariant.find({ productId: product._id });
};

const update = async (id, payload) => {
  if (invalidId(id)) return { errors: [{ name: 'product', message: 'Product not found.' }] };

  const {
    colors, stock, qikinkSku, variants, status, ...productFields
  } = payload;

  const product = await Product.findById(id);
  if (!product) {
    return { errors: [{ name: 'product', message: 'Product not found.' }] };
  }

  const existingVariants = await ProductVariant.find({ productId: product._id });
  const existingByKey = new Map(existingVariants.map((v) => [variantKey(v.size, v.color), v]));

  let rows = null;
  if (hasVariantInput(payload)) {
    rows = normalizeVariants(product.slug, {
      sizes: productFields.sizes ?? product.sizes, colors, stock, qikinkSku, variants,
    }).map((row, i) => {
      const current = existingByKey.get(variantKey(row.size, row.color));
      return {
        ...row,
        // Keep an existing variant's SKU unless one was sent explicitly.
        sku: variants?.[i]?.sku?.trim() || current?.sku || row.sku,
        enabled: current ? isEnabled(current) : true,
      };
    });
    const invalid = validateVariants(rows);
    if (invalid.length) return { errors: invalid };
    const taken = await skuTakenElsewhere(rows, product._id);
    if (taken) return taken;
  }

  const resolved = resolveStatus(
    status,
    product.status,
    rows || existingVariants,
    productFields.images ?? product.images,
  );
  if (resolved.errors) return resolved;

  const savedVariants = rows ? await syncVariants(product, rows) : existingVariants;

  Object.assign(product, productFields, { status: resolved.status });
  if (rows && !productFields.sizes) product.sizes = [...new Set(rows.map((r) => r.size))];
  product.inStock = inStockFor(product.trackInventory, savedVariants);
  try {
    await product.save();
  } catch (err) {
    if (err.code === 11000) return conflict('slug', `Slug already exists: ${productFields.slug}`);
    throw err;
  }

  return { doc: toDTO(product, savedVariants) };
};

/**
 * Switch a whole colour (size omitted) or one colour + size on or off.
 * Refuses to switch off the last option of a live product — unpublish it
 * instead, so the storefront never lists something nobody can buy.
 */
const setAvailability = async (id, { color, size, enabled }) => {
  if (invalidId(id)) return { errors: [{ name: 'product', message: 'Product not found.' }] };
  const product = await Product.findById(id);
  if (!product) return { errors: [{ name: 'product', message: 'Product not found.' }] };

  const variants = await ProductVariant.find({ productId: product._id });
  const matches = (v) => v.color.toLowerCase() === String(color).trim().toLowerCase()
    && (!size || v.size.toLowerCase() === String(size).trim().toLowerCase());
  const targets = variants.filter(matches);
  if (!targets.length) {
    return { errors: [{ name: 'variant', message: `No ${size ? `${color} / ${size}` : color} variant on this product.` }] };
  }

  if (!enabled && product.status === 'active'
    && variants.every((v) => matches(v) || !isEnabled(v))) {
    return conflict('enabled', 'That would leave nothing to buy on a live product — set it to draft instead.');
  }
  if (enabled && product.status === 'active' && targets.some((v) => !v.qikinkSku)) {
    return conflict('enabled', 'Add the Qikink Store SKU for this option before switching it on — the product is live.');
  }

  await ProductVariant.updateMany({ _id: { $in: targets.map((v) => v._id) } }, { $set: { enabled } });
  const saved = await ProductVariant.find({ productId: product._id });
  return { doc: toDTO(product, saved) };
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
      const result = await create(payload);
      if (result.errors) {
        acc.errors.push({ name: payload.name, errors: result.errors });
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
  list,
  get,
  create,
  update,
  remove,
  bulkCreate,
  setAvailability,
  generateSlug,
  variantKey,
  validateVariants,
};
