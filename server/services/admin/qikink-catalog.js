const { Product, ProductVariant } = require('../../database/models');
const AdminProductsService = require('./products');
const { parseDelimited } = require('../../utils/csv');

// My Products export "Product ID" is not the S3 clientProducts folder id —
// inventing …/images/default.jpg from it yields 403s. Covers come from the
// Product Variations Image column, the product sheet, or an admin paste.

// Two-step catalog flow from Qikink's dashboard:
//   1. "My Products" export CSV  → one product shell per Qikink product (review)
//   2. pasted "Product Variations" table for one product → its variants
// Qikink's API has no product endpoints, so these exports are the bridge.

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
const sizeRank = (size) => {
  const i = SIZE_ORDER.indexOf(String(size).toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
};

const toNumber = (text) => {
  const match = String(text || '').match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : undefined;
};

const titleCase = (text) => text
  .split(/[\s_-]+/)
  .filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
  .join(' ');

const garmentWord = (title) => {
  if (/hoodie/i.test(title)) return 'Hoodie';
  if (/sweatshirt/i.test(title)) return 'Sweatshirt';
  if (/oversized/i.test(title)) return 'Oversized Tee';
  return 'Tee';
};

/**
 * "01_gitblame__whitetee__clean_10in_300dpi" → "Gitblame Tee". Qikink design
 * names are file names without spaces, so this is a starting point the admin
 * can rename; random hashes fall back to the Qikink title + id.
 */
const nameFromDesign = (design, title, productId) => {
  const core = String(design || '')
    .replace(/^\d+_/, '')
    .split('__')[0]
    .replace(/\(\d+\)/g, '')
    .replace(/_\d+$/, '')
    .trim();
  if (!core || /^[0-9a-f]{8,}$/i.test(core.replace(/[_-]/g, ''))) {
    return `${title || 'Qikink product'} #${productId}`;
  }
  return `${titleCase(core)} ${garmentWord(title)}`;
};

/** Reads Qikink's My Products export (CSV with a long "Products" cell). */
const parseExport = (text) => {
  const rows = parseDelimited(text, ',');
  const headerIndex = rows.findIndex((r) => r.some((c) => /product id/i.test(c)));
  if (headerIndex === -1) {
    return { rows: [], problems: [{ where: 'File', message: 'This is not a Qikink My Products export (no "Product ID" column).' }] };
  }
  const header = rows[headerIndex].map((h) => h.replace(/\s+/g, ' ').trim().toLowerCase());
  const col = (re) => header.findIndex((h) => re.test(h));
  const idCol = col(/^product id$/);
  const productsCol = col(/^products$/);
  const costCol = col(/^product price/);
  const sellCol = col(/^selling price/);

  const problems = [];
  const parsed = [];
  rows.slice(headerIndex + 1).forEach((r, i) => {
    const line = headerIndex + i + 2;
    const productId = String(r[idCol] || '').trim();
    if (!productId) return;
    const segments = String(r[productsCol] || '').split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    const designSegment = segments.find((s) => / \| W - /.test(s)) || '';
    const [design, width, height] = [
      designSegment.split(' | W - ')[0].trim(),
      (designSegment.match(/\| W - ([\d.]+)/) || [])[1],
      (designSegment.match(/\| H - ([\d.]+)/) || [])[1],
    ];
    // Counts are matched on the whole cell: Qikink separates "| 60 Variants"
    // with the same double space it uses between sections.
    const countsSegment = String(r[productsCol] || '');
    const price = toNumber(r[sellCol]);
    if (!price) problems.push({ where: `Export row ${line}`, message: `No selling price for Qikink product ${productId}.` });
    parsed.push({
      productId,
      title: segments[0] || '',
      baseProduct: segments[1] || '',
      design,
      printSize: width && height ? `${width} × ${height} in` : undefined,
      colourCount: toNumber((countsSegment.match(/(\d+)\s*Colou?rs?/i) || [])[1]),
      sizeRange: ((countsSegment.match(/Size\s*:\s*(\S+\s*-\s*\S+)/i) || [])[1] || '').trim() || undefined,
      expectedVariants: toNumber((countsSegment.match(/(\d+)\s*Variants?/i) || [])[1]),
      cost: String(r[costCol] || '').trim(),
      price,
    });
  });
  return { rows: parsed, problems };
};

const findByQikink = async ({ productId, design }) => (
  (productId && await Product.findOne({ qikinkProductId: productId }))
  || (design && await Product.findOne({ qikinkDesign: design }))
  || null
);

const uniqueSlug = async (name, productId) => {
  const base = AdminProductsService.generateSlug(name) || `qikink-${productId}`;
  return (await Product.exists({ slug: base })) ? `${base}-${productId}` : base;
};

/**
 * Step 1. Creates a review-status shell per new Qikink product (name from the
 * design, price, print size, expected variant count) and refreshes the Qikink
 * details of products already linked. Never renames, re-prices, publishes or
 * touches variants of an existing product.
 */
const importExport = async (text, { dryRun = true } = {}) => {
  const { rows, problems } = parseExport(text);
  const plan = await Promise.all(rows.map(async (row) => {
    const existing = await findByQikink(row);
    return {
      ...row,
      action: existing ? 'update' : 'create',
      existingId: existing?.id || null,
      name: existing?.name || nameFromDesign(row.design, row.title, row.productId),
      status: existing?.status || 'review',
      variants: existing ? await ProductVariant.countDocuments({ productId: existing._id }) : 0,
    };
  }));
  const summary = plan.map(({ existingId, ...rest }) => rest);
  if (dryRun || problems.length) return { applied: false, problems, products: summary };

  const qikinkFields = (row) => ({
    qikinkProductId: row.productId,
    qikinkDesign: row.design || undefined,
    qikinkPrintSize: row.printSize,
    qikinkColourCount: row.colourCount,
    qikinkSizeRange: row.sizeRange,
    qikinkExpectedVariants: row.expectedVariants,
  });

  const results = [];
  for (let i = 0; i < plan.length; i += 1) {
    const row = plan[i];
    if (row.existingId) {
      const $set = qikinkFields(row);
      // eslint-disable-next-line no-await-in-loop
      await Product.updateOne({ _id: row.existingId }, { $set });
      results.push({
        name: row.name, ok: true, id: row.existingId, action: 'update',
      });
    } else {
      // eslint-disable-next-line no-await-in-loop
      const taken = await Product.exists({ name: row.name });
      const name = taken ? `${row.name} (${row.productId})` : row.name;
      // eslint-disable-next-line no-await-in-loop
      const product = await Product.create({
        name,
        slug: await uniqueSlug(name, row.productId), // eslint-disable-line no-await-in-loop
        description: '',
        price: row.price,
        currency: 'INR',
        status: 'review',
        ...qikinkFields(row),
      });
      results.push({
        name, ok: true, id: product.id, action: 'create',
      });
    }
  }
  return {
    applied: true, problems: [], products: summary, results,
  };
};

const HEADER_KEYS = {
  variation: /^variation$/,
  productSku: /^product sku$/,
  storeSku: /^store sku$/,
  image: /^image$/,
  cost: /^product cost$/,
  selling: /^selling (cost|price)$/,
};
const DEFAULT_ORDER = {
  variation: 1, productSku: 2, storeSku: 4, image: 5, cost: 6, selling: 7,
};

/** Reads a Product Variations table copied from Qikink (tabs or commas). */
const parseVariations = (text) => {
  const delimiter = String(text).includes('\t') ? '\t' : ',';
  const rows = parseDelimited(text, delimiter);
  const first = (rows[0] || []).map((c) => c.trim().toLowerCase());
  const hasHeader = first.some((c) => HEADER_KEYS.variation.test(c));
  const index = { ...DEFAULT_ORDER };
  if (hasHeader) {
    Object.entries(HEADER_KEYS).forEach(([key, re]) => {
      const i = first.findIndex((c) => re.test(c));
      if (i !== -1) index[key] = i;
    });
  }

  const problems = [];
  const seenSku = new Map();
  const seenKey = new Set();
  const variants = [];
  (hasHeader ? rows.slice(1) : rows).forEach((r, i) => {
    const line = i + 1;
    const variation = String(r[index.variation] || '').trim();
    const split = variation.lastIndexOf(' - ');
    if (split === -1) {
      problems.push({ where: `Row ${line}`, message: `Can't read colour and size from "${variation}" (expected "Colour - Size").` });
      return;
    }
    const color = variation.slice(0, split).trim();
    const size = variation.slice(split + 3).trim();
    const storeSku = String(r[index.storeSku] || '').trim();
    const key = `${color.toLowerCase()}|${size.toLowerCase()}`;
    if (!storeSku) problems.push({ where: `Row ${line} (${variation})`, message: 'Store SKU is empty.' });
    else if (!storeSku.startsWith('v-')) {
      problems.push({
        where: `Row ${line} (${variation})`,
        message: `"${storeSku}" is not a Store SKU (those start with v-). Copy the Store SKU column, not the Product SKU.`,
      });
    }
    if (seenSku.has(storeSku)) problems.push({ where: `Row ${line} (${variation})`, message: `Store SKU is also on row ${seenSku.get(storeSku)}.` });
    if (seenKey.has(key)) problems.push({ where: `Row ${line}`, message: `${variation} appears twice.` });
    seenSku.set(storeSku, line);
    seenKey.add(key);
    const image = String(r[index.image] || '').trim();
    variants.push({
      color,
      size,
      qikinkSku: storeSku || undefined,
      productSku: String(r[index.productSku] || '').trim() || undefined,
      image: /^https?:\/\//.test(image) ? image : undefined,
      qikinkCost: toNumber(r[index.cost]),
      selling: toNumber(r[index.selling]),
    });
  });

  const colourOrder = [...new Set(variants.map((v) => v.color))];
  variants.sort((a, b) => colourOrder.indexOf(a.color) - colourOrder.indexOf(b.color)
    || sizeRank(a.size) - sizeRank(b.size));
  return { variants, colourOrder, problems };
};

/**
 * Step 2. Sets one product's variants from a pasted Product Variations table,
 * with one image link per colour. Re-pasting replaces the variant list; SKUs,
 * switched-off options and status are kept by the products service.
 */
const applyVariations = async (productId, { text, images = {}, dryRun = true }) => {
  const product = await Product.findById(productId).catch(() => null);
  if (!product) return { errors: [{ name: 'product', message: 'Product not found.' }] };

  const { variants, colourOrder, problems } = parseVariations(text);
  if (!variants.length && !problems.length) {
    problems.push({ where: 'Table', message: 'Paste the Product Variations table from Qikink (header row optional).' });
  }

  const existing = await ProductVariant.find({ productId: product._id });
  const existingImage = (colour) => existing.find((v) => v.color.toLowerCase() === colour.toLowerCase() && v.image)?.image;
  const imageFor = (colour) => {
    const given = Object.entries(images).find(([k]) => k.toLowerCase() === colour.toLowerCase())?.[1];
    if (given !== undefined) return String(given).trim();
    return variants.find((v) => v.color === colour && v.image)?.image
      || existingImage(colour)
      || '';
  };

  const colours = colourOrder.map((colour) => {
    const rows = variants.filter((v) => v.color === colour);
    return {
      colour,
      sizes: rows.map((v) => v.size),
      image: imageFor(colour),
      cost: rows[0]?.qikinkCost ?? null,
      mapped: rows.filter((v) => v.qikinkSku).length,
    };
  });
  const expected = product.qikinkExpectedVariants || null;
  const warnings = expected && variants.length !== expected
    ? [`The Qikink export says ${expected} variants; the pasted table has ${variants.length}. Check you copied every page.`]
    : [];

  const summary = {
    product: { id: product.id, name: product.name, price: product.price },
    variants: variants.length,
    expected,
    colours,
    warnings,
  };
  if (dryRun || problems.length) return { applied: false, problems, ...summary };

  const payload = {
    variants: variants.map((v) => ({
      color: v.color,
      size: v.size,
      qikinkSku: v.qikinkSku,
      image: imageFor(v.color),
      qikinkCost: v.qikinkCost,
      price: v.selling && v.selling !== product.price ? v.selling : undefined,
    })),
  };
  const cover = colours.find((c) => c.image)?.image;
  if (!product.images.length && cover) payload.images = [cover];

  const result = await AdminProductsService.update(product.id, payload);
  if (result.errors) return { applied: false, problems: result.errors.map((e) => ({ where: e.name, message: e.message })), ...summary };
  return {
    applied: true, problems: [], ...summary, doc: result.doc,
  };
};

module.exports = {
  parseExport, nameFromDesign, importExport, parseVariations, applyVariations,
};
