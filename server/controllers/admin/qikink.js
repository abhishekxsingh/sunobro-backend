const QikinkService = require('../../services/admin/qikink');
const CatalogSync = require('../../services/admin/qikink-catalog-sync');

const status = async (req, res) => {
  try {
    return res.getRequest(await QikinkService.getStatus());
  } catch (error) {
    return res.serverError(error);
  }
};

// Checks that products already in Mongo have Store SKUs.
const syncProducts = async (req, res) => {
  try {
    return res.getRequest(await QikinkService.syncAll());
  } catch (error) {
    return res.serverError(error);
  }
};

/**
 * Seed / refresh catalog.
 * Prefer dashboard fetch_my_products; optional body.file CSV override.
 */
const syncCatalog = async (req, res) => {
  try {
    const dryRun = req.body?.dryRun === true;
    let text = typeof req.body?.file === 'string' ? req.body.file : '';
    if (text && !text.includes('Product ID') && !text.includes(',')) {
      try {
        text = Buffer.from(text.replace(/^data:[^,]+,/, ''), 'base64').toString('utf8');
      } catch {
        text = '';
      }
    }

    if (text) {
      const result = await CatalogSync.syncCatalog({ text, dryRun });
      if (result.problems?.length && !result.applied) {
        return res.badRequest('field-validation', result.problems.map((p) => ({
          name: p.where || 'file',
          message: p.message,
        })));
      }
      return res.getRequest(result);
    }

    try {
      return res.getRequest(await CatalogSync.syncFromDashboardApi({ dryRun }));
    } catch (err) {
      const loaded = await CatalogSync.loadText();
      if (!loaded.text) {
        return res.badRequest('field-validation', [{
          name: 'qikink',
          message: err.message
            || 'Could not call fetch_my_products. Set QIKINK_DASHBOARD_COOKIE, or attach a My Products CSV.',
        }]);
      }
      const result = await CatalogSync.syncCatalog({ text: loaded.text, dryRun });
      return res.getRequest({
        ...result,
        apiError: err.message,
        fallbackFrom: 'fetch_my_products',
      });
    }
  } catch (error) {
    return res.serverError(error);
  }
};

const syncOrders = async (req, res) => {
  try {
    const { synced } = await QikinkService.syncActiveOrders();
    return res.getRequest({ synced, message: `Refreshed ${synced} in-flight order(s) from Qikink.` });
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = {
  status, syncProducts, syncCatalog, syncOrders,
};
