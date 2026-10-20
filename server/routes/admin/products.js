const AdminProductsController = require('../../controllers/admin/products');
const AdminProductSheetController = require('../../controllers/admin/product-sheet');
const AdminQikinkCatalogController = require('../../controllers/admin/qikink-catalog');
const { requireAdmin } = require('../../utils/middleware/auth');

module.exports = (router) => {
  router.get('/admin/products', requireAdmin, AdminProductsController.list);
  // bulk must be registered before /:id so Express matches it first
  router.post('/admin/products/bulk', requireAdmin, AdminProductsController.bulkCreate);
  router.post('/admin/products/import', requireAdmin, AdminProductSheetController.importSheet);
  router.post('/admin/products/qikink-export', requireAdmin, AdminQikinkCatalogController.importExport);
  router.post('/admin/products/:id/qikink-variations', requireAdmin, AdminQikinkCatalogController.applyVariations);
  router.get('/admin/products/:id', requireAdmin, AdminProductsController.get);
  router.post('/admin/products', requireAdmin, AdminProductsController.create);
  router.put('/admin/products/:id', requireAdmin, AdminProductsController.update);
  router.put('/admin/products/:id/availability', requireAdmin, AdminProductsController.setAvailability);
  router.post('/admin/products/:id/variants', requireAdmin, AdminProductsController.addVariants);
  router.put('/admin/products/:id/colour-image', requireAdmin, AdminProductsController.setColourImage);
  router.delete('/admin/products/:id', requireAdmin, AdminProductsController.remove);
  router.post('/admin/products/:id/sync-qikink', requireAdmin, AdminProductsController.syncQikink);
};
