/**
 * Catalog sync from Qikink:
 *   1. Primary — POST dashboard …/products/fetch_my_products (client_id +
 *      client_product_id → S3 cover URLs, upsert product shells)
 *   2. Fallback — My Products CSV path/URL when the dashboard session is missing
 *
 * Cron calls syncFromConfiguredSource() every QIKINK_CATALOG_SYNC_INTERVAL_MS.
 */
const fs = require('fs/promises');
const path = require('path');
const { Product, ProductVariant } = require('../../database/models');
const { QIKINK } = require('../../config');
const Catalog = require('./qikink-catalog');
const AdminProducts = require('./products');
const { fetchMyProducts, isConfigured } = require('./qikink-client');
const { resolveQikinkCoverUrl, generateQikinkImageUrl } = require('../../utils/qikink-image');
const logger = require('../../utils/logger');

const PENDING_PREFIX = 'v-pending-';

const COLOUR_PALETTE = [
  'White', 'Black', 'Navy Blue', 'Grey Melange', 'Red', 'Olive Green',
  'Maroon', 'Mustard Yellow', 'Sky Blue', 'Bottle Green', 'Charcoal Grey', 'Beige',
];

const SIZE_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];

const expandSizes = (range) => {
  if (!range) return ['S', 'M', 'L', 'XL'];
  const match = String(range).match(/(\S+)\s*-\s*(\S+)/);
  if (!match) return ['S', 'M', 'L', 'XL'];
  const start = SIZE_ORDER.indexOf(match[1].toUpperCase());
  const end = SIZE_ORDER.indexOf(match[2].toUpperCase());
  if (start === -1 || end === -1) return ['S', 'M', 'L', 'XL'];
  return SIZE_ORDER.slice(Math.min(start, end), Math.max(start, end) + 1);
};

const coverFor = (product) => ((product.images && product.images[0]) || null);

const pendingSku = (productId, color, size) => {
  const slug = `${productId}-${color}-${size}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return `${PENDING_PREFIX}${slug}`;
};

const slugify = (name, fallback) => {
  const base = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return base || `qikink-${fallback}`;
};

const loadText = async ({ text, filePath, url } = {}) => {
  if (typeof text === 'string' && text.trim()) return { text, source: 'body' };
  const configuredUrl = url || QIKINK.CATALOG_EXPORT_URL;
  if (configuredUrl) {
    const res = await fetch(configuredUrl);
    if (!res.ok) throw new Error(`Catalog export URL returned ${res.status}.`);
    return { text: await res.text(), source: configuredUrl };
  }
  const configuredPath = filePath || QIKINK.CATALOG_EXPORT_PATH;
  if (configuredPath) {
    const absolute = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.resolve(process.cwd(), configuredPath);
    return { text: await fs.readFile(absolute, 'utf8'), source: absolute };
  }
  return { text: null, source: null };
};

const ensureSellable = async (product, { autoPublish = true } = {}) => {
  const variants = await ProductVariant.find({ productId: product._id });
  const hasRealSku = variants.some((v) => v.qikinkSku && !String(v.qikinkSku).startsWith(PENDING_PREFIX));
  const cover = coverFor(product);

  let ensuredVariants = variants.length;
  if (!hasRealSku && variants.length === 0) {
    const sizes = expandSizes(product.qikinkSizeRange);
    const colourCount = Math.min(Math.max(product.qikinkColourCount || 4, 1), COLOUR_PALETTE.length);
    const colours = COLOUR_PALETTE.slice(0, colourCount);
    const rows = colours.flatMap((color) => sizes.map((size) => ({
      color,
      size,
      qikinkSku: pendingSku(product.qikinkProductId, color, size),
      image: cover || undefined,
    })));
    const payload = { variants: rows };
    if (autoPublish && cover) payload.status = 'active';
    const result = await AdminProducts.update(String(product._id), payload);
    if (result.errors) {
      return {
        id: product.id, slug: product.slug, action: 'scaffold-failed', errors: result.errors,
      };
    }
    ensuredVariants = rows.length;
    return {
      id: product.id,
      slug: product.slug,
      action: (autoPublish && cover) ? 'scaffolded-active' : 'scaffolded',
      variants: ensuredVariants,
      pendingSkus: true,
    };
  }

  if (autoPublish && product.status !== 'active' && (hasRealSku || variants.length > 0) && cover) {
    const result = await AdminProducts.update(String(product._id), { status: 'active' });
    if (result.errors) {
      return {
        id: product.id, slug: product.slug, action: 'publish-failed', errors: result.errors,
      };
    }
    return {
      id: product.id, slug: product.slug, action: 'published', variants: ensuredVariants,
    };
  }

  return {
    id: product.id,
    slug: product.slug,
    action: hasRealSku ? 'ready' : (variants.length ? 'pending-skus' : 'shell'),
    variants: ensuredVariants,
  };
};

const isBrokenGeneratedCover = (images = []) => images.some((u) => /clientProducts\/64\d{5,}\//.test(String(u))
  || /\/images\/default\.jpg$/.test(String(u)));

/**
 * Upsert one row from fetch_my_products and attach a working S3 cover.
 */
const upsertDashboardProduct = async (row, { autoPublish, dryRun }) => {
  const clientProductId = String(row.client_product_id || '').trim();
  const clientId = String(row.client_id || QIKINK.ASSET_CLIENT_ID || '').trim();
  const title = String(row.client_product_title || row.product_title || '').trim()
    || `Qikink product ${clientProductId}`;
  const dashboardProductId = String(row.product_id || '').trim() || undefined;

  if (!clientProductId || !clientId) {
    return { action: 'skipped', reason: 'missing client_product_id or client_id', row };
  }

  const cover = await resolveQikinkCoverUrl({ clientId, clientProductId });
  const existing = await Product.findOne({
    $or: [
      { qikinkProductId: clientProductId },
      ...(dashboardProductId ? [{ qikinkDashboardProductId: dashboardProductId }] : []),
    ],
  });

  if (dryRun) {
    return {
      action: existing ? 'update' : 'create',
      name: title,
      clientProductId,
      clientId,
      imageUrl: cover,
    };
  }

  if (existing) {
    const $set = {
      qikinkProductId: clientProductId,
      qikinkClientId: clientId,
      ...(dashboardProductId ? { qikinkDashboardProductId: dashboardProductId } : {}),
    };
    if (!existing.images?.length || isBrokenGeneratedCover(existing.images)) {
      $set.images = cover ? [cover] : existing.images;
    }
    await Product.updateOne({ _id: existing._id }, { $set });
    const fresh = await Product.findById(existing._id);
    const published = await ensureSellable(fresh, { autoPublish });
    return {
      action: 'update', id: existing.id, slug: existing.slug, name: title, imageUrl: cover, published,
    };
  }

  let slug = slugify(title, clientProductId);
  if (await Product.exists({ slug })) slug = `${slug}-${clientProductId}`;

  const product = await Product.create({
    name: title,
    slug,
    description: '',
    price: 599,
    currency: 'INR',
    status: 'review',
    images: cover ? [cover] : [],
    qikinkProductId: clientProductId,
    qikinkClientId: clientId,
    qikinkDashboardProductId: dashboardProductId,
  });
  const published = await ensureSellable(product, { autoPublish });
  return {
    action: 'create', id: product.id, slug: product.slug, name: title, imageUrl: cover, published,
  };
};

/**
 * Pull My Products from the dashboard API and sync into Mongo.
 */
const syncFromDashboardApi = async ({
  dryRun = false, autoPublish = QIKINK.CATALOG_AUTO_PUBLISH,
} = {}) => {
  if (!isConfigured()) {
    return {
      applied: false,
      source: 'fetch_my_products',
      problems: [{ where: 'qikink', message: 'Set QIKINK_CLIENT_ID and QIKINK_CLIENT_SECRET.' }],
      created: 0,
      updated: 0,
    };
  }

  const rows = await fetchMyProducts();
  const results = [];
  for (let i = 0; i < rows.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await upsertDashboardProduct(rows[i], { autoPublish, dryRun }));
  }

  const created = results.filter((r) => r.action === 'create').length;
  const updated = results.filter((r) => r.action === 'update').length;
  const active = dryRun ? null : await Product.countDocuments({ status: 'active' });

  return {
    applied: !dryRun,
    source: 'fetch_my_products',
    created,
    updated,
    total: rows.length,
    results,
    storefrontActive: active,
    message: dryRun
      ? `Would sync ${rows.length} product(s) from fetch_my_products.`
      : `Synced ${rows.length} from fetch_my_products (${created} created, ${updated} updated).`,
  };
};

const syncCatalog = async ({
  text, dryRun = false, autoPublish = QIKINK.CATALOG_AUTO_PUBLISH,
} = {}) => {
  if (!text || !String(text).trim()) {
    return {
      applied: false,
      problems: [{ where: 'file', message: 'Provide a Qikink My Products export CSV (or set QIKINK_CATALOG_EXPORT_PATH / QIKINK_CATALOG_EXPORT_URL).' }],
      created: 0,
      updated: 0,
      published: [],
    };
  }

  const imported = await Catalog.importExport(text, { dryRun });
  if (!imported.applied) {
    return {
      applied: false,
      problems: imported.problems || [],
      products: imported.products || [],
      created: 0,
      updated: 0,
      published: [],
      message: 'Catalog import preview only (dryRun) or problems blocked the write.',
    };
  }

  const created = (imported.results || []).filter((r) => r.action === 'create').length;
  const updated = (imported.results || []).filter((r) => r.action === 'update').length;

  const qikinkProducts = await Product.find({ qikinkProductId: { $exists: true, $ne: null } });
  const published = [];
  for (let i = 0; i < qikinkProducts.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    published.push(await ensureSellable(qikinkProducts[i], { autoPublish }));
  }

  const active = await Product.countDocuments({ status: 'active' });
  return {
    applied: true,
    problems: [],
    created,
    updated,
    results: imported.results,
    published,
    storefrontActive: active,
    source: 'csv',
    message: `Catalog synced: ${created} created, ${updated} updated, ${active} active on storefront.`
      + (autoPublish
        ? ' New shells without pasted Store SKUs use temporary v-pending-… codes — replace via Product Variations before fulfilling.'
        : ''),
  };
};

/**
 * Cron entry: prefer fetch_my_products; fall back to CSV if the dashboard
 * session is missing and an export path/URL is configured.
 */
const syncFromConfiguredSource = async ({ dryRun = false } = {}) => {
  try {
    const result = await syncFromDashboardApi({ dryRun });
    logger.info({
      source: result.source,
      created: result.created,
      updated: result.updated,
      active: result.storefrontActive,
      total: result.total,
    }, 'qikink-catalog-sync');
    return result;
  } catch (err) {
    logger.warn({ err: err.message }, 'qikink-catalog-api-failed');
    const { text, source } = await loadText();
    if (!text) {
      return {
        applied: false,
        skipped: false,
        source: 'fetch_my_products',
        error: err.message,
        message: err.message,
      };
    }
    const result = await syncCatalog({ text, dryRun });
    logger.info({
      source, created: result.created, updated: result.updated, active: result.storefrontActive, fallback: true,
    }, 'qikink-catalog-sync');
    return {
      ...result, source, fallbackFrom: 'fetch_my_products', apiError: err.message,
    };
  }
};

module.exports = {
  PENDING_PREFIX,
  loadText,
  ensureSellable,
  syncCatalog,
  syncFromDashboardApi,
  syncFromConfiguredSource,
  generateQikinkImageUrl,
};
