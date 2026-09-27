const AdminProductsService = require('../../services/admin/products');
const QikinkService = require('../../services/admin/qikink');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');

const list = async (req, res) => {
  try {
    const { query: { page, limit } } = req;
    const { doc, meta } = await AdminProductsService.list({ page, limit });

    res.setHeader('x-coreplatform-total-records', meta.totalRecords);
    res.setHeader('x-coreplatform-page', meta.page);
    res.setHeader('x-coreplatform-limit', meta.limit);

    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const get = async (req, res) => {
  try {
    const { params: { id } } = req;
    const { doc, errors } = await AdminProductsService.get(id);
    if (errors) return res.notFound();
    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const create = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.admin.products.create,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const result = await AdminProductsService.create(req.body);
    if (result.type === 'conflict') return res.conflict('conflict', result.errors);
    if (result.errors) return res.badRequest('field-validation', result.errors);

    return res.postSuccessfully(result.doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const update = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.admin.products.update,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const { doc, errors, type } = await AdminProductsService.update(req.params.id, req.body);
    if (type === 'conflict') return res.conflict('conflict', errors);
    if (errors) return res.notFound();
    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const remove = async (req, res) => {
  try {
    const { errors } = await AdminProductsService.remove(req.params.id);
    if (errors) return res.notFound();
    return res.deleted();
  } catch (error) {
    return res.serverError(error);
  }
};

const bulkCreate = async (req, res) => {
  try {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.badRequest('field-validation', [{ name: 'products', message: 'products must be a non-empty array.' }]);
    }

    const { doc, errors } = await AdminProductsService.bulkCreate(products);
    return res.postSuccessfully({ created: doc, errors });
  } catch (error) {
    return res.serverError(error);
  }
};

const syncQikink = async (req, res) => {
  try {
    const result = await QikinkService.syncProduct(req.params.id);
    return res.getRequest(result);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = {
  list, get, create, update, remove, bulkCreate, syncQikink,
};
