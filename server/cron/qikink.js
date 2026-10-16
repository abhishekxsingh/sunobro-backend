const QikinkService = require('../services/admin/qikink');
const { QIKINK } = require('../config');
const logger = require('../utils/logger');

let running = false;

const run = async () => {
  if (running) return;
  running = true;
  try {
    const retry = await QikinkService.retryFailedPushes();
    const sync = await QikinkService.syncActiveOrders();
    if (retry.retried || sync.synced) {
      logger.info({ ...retry, ...sync }, 'qikink-cron');
    }
  } catch (err) {
    logger.error({ err }, 'qikink-cron-failed');
  } finally {
    running = false;
  }
};

module.exports = () => {
  if (!QIKINK.SYNC_INTERVAL_MS) return;
  setInterval(run, QIKINK.SYNC_INTERVAL_MS).unref();
};
