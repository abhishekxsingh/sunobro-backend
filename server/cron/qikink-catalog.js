const CatalogSync = require('../services/admin/qikink-catalog-sync');
const { QIKINK } = require('../config');
const logger = require('../utils/logger');

let running = false;
let lastSignature = null;

const run = async () => {
  if (running) return;
  running = true;
  try {
    const result = await CatalogSync.syncFromConfiguredSource();
    if (result.skipped) return;

    const signature = JSON.stringify({
      source: result.source,
      created: result.created,
      updated: result.updated,
      total: result.total,
      error: result.error || result.apiError || null,
    });
    // Avoid spamming identical "0 created / N updated" lines every 10s.
    if (signature !== lastSignature || result.created || result.error || result.apiError) {
      lastSignature = signature;
      logger.info({
        created: result.created,
        updated: result.updated,
        active: result.storefrontActive,
        source: result.source,
        total: result.total,
        intervalMs: QIKINK.CATALOG_SYNC_INTERVAL_MS,
        error: result.error || result.apiError || undefined,
      }, 'qikink-catalog-cron');
    }
  } catch (err) {
    logger.error({ err }, 'qikink-catalog-cron-failed');
  } finally {
    running = false;
  }
};

module.exports = () => {
  const interval = QIKINK.CATALOG_SYNC_INTERVAL_MS;
  if (!interval) return;
  logger.info({
    intervalMs: interval,
    fetchUrl: QIKINK.FETCH_MY_PRODUCTS_URL,
    hasDashboardCookie: Boolean(QIKINK.DASHBOARD_COOKIE),
    csvPath: QIKINK.CATALOG_EXPORT_PATH || null,
  }, 'qikink-catalog-cron-started');
  setTimeout(run, Math.min(2_000, interval)).unref();
  setInterval(run, interval).unref();
};
