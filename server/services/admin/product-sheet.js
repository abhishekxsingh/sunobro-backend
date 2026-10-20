const ExcelJS = require('exceljs');
const { Product, ProductVariant } = require('../../database/models');
const AdminProductsService = require('./products');

// Reads SunoBro-Product-Sheet.xlsx: a "Products" tab (one row per product) and
// a "Variants" tab (one row per colour × size, each with its Qikink Store SKU).
// Headers are matched loosely ("Selling price ₹ *" → "selling price") so small
// edits to the template's wording don't break the import.

const normalizeHeader = (text) => String(text || '')
  .toLowerCase()
  .replace(/\(.*?\)/g, ' ')
  .replace(/[*₹:]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const PRODUCT_COLUMNS = {
  name: (h) => h === 'product name',
  description: (h) => h.startsWith('description'),
  price: (h) => h.startsWith('selling price'),
  cover: (h) => h.startsWith('cover image'),
  more: (h) => h.startsWith('more image'),
  slug: (h) => h.includes('slug'),
};

const VARIANT_COLUMNS = {
  product: (h) => h === 'product name',
  color: (h) => h === 'colour' || h === 'color',
  size: (h) => h === 'size',
  storeSku: (h) => h.includes('store sku'),
  image: (h) => h.startsWith('colour image') || h.startsWith('color image'),
  price: (h) => h.startsWith('price override'),
};

const cellText = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return '';
  return String(cell.text ?? '').trim();
};

const toNumber = (text) => {
  if (!text) return undefined;
  const value = Number(String(text).replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

const readTab = (sheet, columns) => {
  const headerRow = sheet.getRow(1);
  const index = {};
  headerRow.eachCell((cell, col) => {
    const header = normalizeHeader(cellText(cell));
    Object.entries(columns).forEach(([key, matches]) => {
      if (index[key] === undefined && matches(header)) index[key] = col;
    });
  });

  const missing = Object.keys(columns).filter((key) => index[key] === undefined);
  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const record = { line: r };
    Object.entries(index).forEach(([key, col]) => {
      record[key] = cellText(row.getCell(col));
    });
    if (Object.keys(index).some((key) => record[key])) rows.push(record);
  }
  return { rows, missing };
};

const findTab = (workbook, name) => workbook.worksheets
  .find((ws) => ws.name.trim().toLowerCase() === name);

/**
 * Turns the workbook into product payloads plus a list of problems, each
 * tied to a tab and row so the admin can fix the sheet.
 */
const parseWorkbook = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const productsTab = findTab(workbook, 'products');
  const variantsTab = findTab(workbook, 'variants');
  if (!productsTab || !variantsTab) {
    return {
      products: [],
      problems: [{ where: 'File', message: 'Expected tabs named "Products" and "Variants" — use the SunoBro product sheet template.' }],
    };
  }

  const problems = [];
  const products = readTab(productsTab, PRODUCT_COLUMNS);
  const variants = readTab(variantsTab, VARIANT_COLUMNS);
  ['name', 'price', 'cover'].filter((k) => products.missing.includes(k))
    .forEach((k) => problems.push({ where: 'Products', message: `Missing column for ${k}.` }));
  ['product', 'color', 'size', 'storeSku'].filter((k) => variants.missing.includes(k))
    .forEach((k) => problems.push({ where: 'Variants', message: `Missing column for ${k}.` }));
  if (problems.length) return { products: [], problems };

  const byName = new Map();
  products.rows.forEach((row) => {
    const where = `Products row ${row.line}`;
    if (!row.name) {
      problems.push({ where, message: 'Product name is empty.' });
      return;
    }
    const key = row.name.toLowerCase();
    if (byName.has(key)) {
      problems.push({ where, message: `"${row.name}" appears twice on Products.` });
      return;
    }
    const price = toNumber(row.price);
    if (!price) problems.push({ where, message: `Selling price for "${row.name}" must be a number above 0.` });

    byName.set(key, {
      line: row.line,
      payload: {
        name: row.name,
        description: row.description || '',
        price: price || 0,
        currency: 'INR',
        slug: row.slug || undefined,
        images: [row.cover, ...String(row.more || '').split('|')].map((s) => s.trim()).filter(Boolean),
        variants: [],
      },
    });
  });

  const seenStoreSkus = new Map();
  variants.rows.forEach((row) => {
    const where = `Variants row ${row.line}`;
    const product = byName.get(String(row.product || '').toLowerCase());
    if (!product) {
      problems.push({ where, message: `Product "${row.product}" is not on the Products tab.` });
      return;
    }
    if (!row.color || !row.size) {
      problems.push({ where, message: 'Colour and size are both required.' });
      return;
    }
    if (row.storeSku && !row.storeSku.startsWith('v-')) {
      problems.push({ where, message: `"${row.storeSku}" is not a Qikink Store SKU (those start with v-). Use the Store SKU column, not the Product SKU.` });
    }
    if (row.storeSku) {
      const other = seenStoreSkus.get(row.storeSku);
      if (other) problems.push({ where, message: `Store SKU also used on ${other}.` });
      seenStoreSkus.set(row.storeSku, where);
    }
    product.payload.variants.push({
      color: row.color,
      size: row.size,
      qikinkSku: row.storeSku || undefined,
      image: row.image || '',
      price: toNumber(row.price),
    });
  });

  byName.forEach(({ payload, line }) => {
    if (payload.variants.length === 0) {
      problems.push({ where: `Products row ${line}`, message: `"${payload.name}" has no rows on the Variants tab.` });
      return;
    }
    AdminProductsService.validateVariants(payload.variants.map((v) => ({ ...v, sku: null })))
      .forEach((e) => problems.push({ where: `Variants for "${payload.name}"`, message: e.message }));
  });

  return { products: [...byName.values()].map((p) => p.payload), problems };
};

const findExisting = async (payload) => {
  const slug = payload.slug || AdminProductsService.generateSlug(payload.name);
  return Product.findOne({ $or: [{ slug }, { name: payload.name }] });
};

const describeChanges = async (existing, payload) => {
  if (!existing) {
    return {
      action: 'create', added: payload.variants.length, removed: 0, kept: 0,
    };
  }
  const current = await ProductVariant.find({ productId: existing._id });
  const currentKeys = new Set(current.map((v) => AdminProductsService.variantKey(v.size, v.color)));
  const nextKeys = new Set(payload.variants.map((v) => AdminProductsService.variantKey(v.size, v.color)));
  return {
    action: 'update',
    added: [...nextKeys].filter((k) => !currentKeys.has(k)).length,
    removed: [...currentKeys].filter((k) => !nextKeys.has(k)).length,
    kept: [...nextKeys].filter((k) => currentKeys.has(k)).length,
  };
};

/**
 * Preview (dryRun) or apply a sheet. Products are matched by URL slug, then
 * by exact name, so re-uploading an edited sheet updates them in place;
 * variants are matched by colour + size, and rows removed from the sheet are
 * removed from the product. Nothing is written while the sheet has problems.
 */
const importSheet = async (buffer, { dryRun = true } = {}) => {
  const { products, problems } = await parseWorkbook(buffer);

  const plan = await Promise.all(products.map(async (payload) => {
    const existing = await findExisting(payload);
    const changes = await describeChanges(existing, payload);
    const mapped = payload.variants.filter((v) => v.qikinkSku).length;
    return {
      name: payload.name,
      // The sheet never publishes: new products land in review, existing
      // ones keep whatever status an admin gave them.
      status: existing?.status || 'review',
      price: payload.price,
      variants: payload.variants.length,
      mapped,
      colours: [...new Set(payload.variants.map((v) => v.color))],
      sizes: [...new Set(payload.variants.map((v) => v.size))],
      ...changes,
      existingId: existing?.id || null,
      payload,
    };
  }));

  plan.filter((p) => p.status === 'active' && p.mapped < p.variants)
    .forEach((p) => problems.push({
      where: p.name,
      message: `This product is live, so every row needs a Store SKU (${p.variants - p.mapped} missing). `
        + 'Fill them, or set the product to draft in admin first.',
    }));

  const summary = plan.map(({ payload, existingId, ...rest }) => rest);
  if (dryRun || problems.length) {
    return { applied: false, problems, products: summary };
  }

  // Drop undefined fields: update() merges with Object.assign, so an
  // undefined slug would otherwise erase the stored one.
  const clean = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

  const results = [];
  for (let i = 0; i < plan.length; i += 1) {
    const { existingId, name } = plan[i];
    const payload = clean(plan[i].payload);
    // Sequential on purpose: products can share SKU checks, so keep writes ordered.
    // eslint-disable-next-line no-await-in-loop
    const result = await (existingId
      ? AdminProductsService.update(existingId, payload)
      : AdminProductsService.create(payload));
    results.push(result.errors
      ? { name, ok: false, errors: result.errors.map((e) => e.message) }
      : {
        name, ok: true, id: result.doc.id, slug: result.doc.slug,
      });
  }
  return {
    applied: true, problems: [], products: summary, results,
  };
};

module.exports = { parseWorkbook, importSheet };
