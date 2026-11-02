/* eslint-disable no-console -- CLI script: output is the interface. */
/**
 * First-time / manual catalog seed from a Qikink My Products CSV.
 *
 *   npm run catalog:sync
 *   QIKINK_CATALOG_EXPORT_PATH=./exports/my-products.csv npm run catalog:sync
 *
 * Uses QIKINK_CATALOG_EXPORT_PATH / QIKINK_CATALOG_EXPORT_URL from .env when
 * no path is passed. Auto-publishes new shells (see QIKINK_CATALOG_AUTO_PUBLISH).
 */
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const { MONGODB_URI, QIKINK } = require('../../config');
const CatalogSync = require('../../services/admin/qikink-catalog-sync');

const run = async () => {
  const argPath = process.argv[2];
  await mongoose.connect(MONGODB_URI);
  console.log(`Database: ${mongoose.connection.db.databaseName}`);

  let loaded = await CatalogSync.loadText({
    filePath: argPath || QIKINK.CATALOG_EXPORT_PATH || undefined,
    url: argPath ? undefined : QIKINK.CATALOG_EXPORT_URL || undefined,
  });
  if (!loaded.text) {
    const fallback = path.join(__dirname, '../../test/fixtures/qikink-export.csv');
    console.log(`No export configured — trying fixture ${fallback}`);
    loaded = await CatalogSync.loadText({ filePath: fallback });
  }
  if (!loaded.text) {
    console.error('No CSV found. Pass a path or set QIKINK_CATALOG_EXPORT_PATH.');
    process.exit(1);
  }
  console.log(`Source: ${loaded.source}`);
  const result = await CatalogSync.syncCatalog({ text: loaded.text });
  console.log(JSON.stringify({
    applied: result.applied,
    created: result.created,
    updated: result.updated,
    storefrontActive: result.storefrontActive,
    message: result.message,
    published: (result.published || []).map((p) => ({ slug: p.slug, action: p.action })),
  }, null, 2));

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
