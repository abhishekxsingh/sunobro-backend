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

const buildVariantsFromPayload = (product, payload) => {
  if (Array.isArray(payload.variants) && payload.variants.length > 0) {
    return payload.variants.map((v) => ({
      productId: product._id,
      size: v.size,
      color: v.color,
      sku: v.sku || `${slugifyPart(product.slug)}-${slugifyPart(v.color)}-${slugifyPart(v.size)}`,
      stock: v.stock ?? payload.stock ?? 100,
      price: v.price,
      qikinkSku: v.qikinkSku || payload.qikinkSku || undefined,
    }));
  }

  const sizes = (payload.sizes && payload.sizes.length > 0) ? payload.sizes : ['M'];
  const colors = (payload.colors && payload.colors.length > 0) ? payload.colors : ['Black'];
  const stock = payload.stock ?? 100;
  const rows = [];

  sizes.forEach((size) => {
    colors.forEach((color) => {
      const sku = `${slugifyPart(product.slug)}-${slugifyPart(color)}-${slugifyPart(size)}`;
      const qikinkSku = payload.qikinkSku
        ? `${payload.qikinkSku}-${slugifyPart(size)}`
        : undefined;
      rows.push({
        productId: product._id,
        size,
        color,
        sku,
        stock,
        qikinkSku,
      });
    });
  });

  return rows;
};

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
    return toFullProductDTO({ ...p.toObject({ virtuals: true }), ...stats }, []);
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
  return { doc: toFullProductDTO(product, variants) };
};

const create = async (payload) => {
  const {
    colors, stock, qikinkSku, variants, ...productFields
  } = payload;
  const slug = productFields.slug || generateSlug(productFields.name);

  try {
    const product = await Product.create({ ...productFields, slug });
    const variantDocs = buildVariantsFromPayload(product, {
      sizes: productFields.sizes,
      colors,
      stock,
      qikinkSku,
      variants,
    });

    if (variantDocs.length > 0) {
      try {
        await ProductVariant.insertMany(variantDocs);
      } catch (err) {
        await Product.findByIdAndDelete(product._id);
        if (err.code === 11000) {
          return {
            type: 'conflict',
            errors: [{ name: 'sku', message: 'A variant SKU already exists. Use unique sizes/colors or custom SKUs.' }],
          };
        }
        throw err;
      }
    }

    const savedVariants = await ProductVariant.find({ productId: product._id });
    const totalStock = savedVariants.reduce((sum, v) => sum + v.stock, 0);
    if (product.inStock !== totalStock > 0) {
      product.inStock = totalStock > 0;
      await product.save();
    }

    return {
      doc: toFullProductDTO({
        ...product.toObject({ virtuals: true }),
        variantCount: savedVariants.length,
        totalStock,
        qikinkSynced: savedVariants.length > 0 && savedVariants.every((v) => Boolean(v.qikinkSku)),
      }, savedVariants),
    };
  } catch (err) {
    if (err.code === 11000) {
      return { type: 'conflict', errors: [{ name: 'slug', message: `Slug already exists: ${slug}` }] };
    }
    throw err;
  }
};

const replaceVariants = async (product, payload) => {
  const hasVariantInput = Array.isArray(payload.variants)
    || Array.isArray(payload.sizes)
    || Array.isArray(payload.colors)
    || payload.stock !== undefined
    || payload.qikinkSku !== undefined;

  if (!hasVariantInput) return null;

  await ProductVariant.deleteMany({ productId: product._id });
  const variantDocs = buildVariantsFromPayload(product, payload);
  if (variantDocs.length > 0) {
    await ProductVariant.insertMany(variantDocs);
  }
  return ProductVariant.find({ productId: product._id });
};

const update = async (id, payload) => {
  if (invalidId(id)) return { errors: [{ name: 'product', message: 'Product not found.' }] };

  const {
    colors, stock, qikinkSku, variants, ...productFields
  } = payload;

  const product = await Product.findByIdAndUpdate(
    id,
    { $set: productFields },
    { new: true, runValidators: true },
  );
  if (!product) {
    return { errors: [{ name: 'product', message: 'Product not found.' }] };
  }

  let savedVariants;
  try {
    savedVariants = await replaceVariants(product, {
      sizes: productFields.sizes ?? product.sizes,
      colors,
      stock,
      qikinkSku,
      variants,
    });
  } catch (err) {
    if (err.code === 11000) {
      return {
        type: 'conflict',
        errors: [{ name: 'sku', message: 'A variant SKU already exists.' }],
      };
    }
    throw err;
  }

  if (!savedVariants) {
    savedVariants = await ProductVariant.find({ productId: product._id });
  }

  const totalStock = savedVariants.reduce((sum, v) => sum + v.stock, 0);
  product.inStock = totalStock > 0;
  await product.save();

  return {
    doc: toFullProductDTO({
      ...product.toObject({ virtuals: true }),
      variantCount: savedVariants.length,
      totalStock,
      qikinkSynced: savedVariants.length > 0 && savedVariants.every((v) => Boolean(v.qikinkSku)),
    }, savedVariants),
  };
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
