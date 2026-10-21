const AdminCouponsService = require('../../services/admin/coupons');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');

const reply = (res, { doc, errors, type }, ok) => {
  if (doc) return ok(doc);
  if (type === 'conflict') return res.conflict('conflict', errors);
  if (type === 'field-validation') return res.badRequest('field-validation', errors);
  return res.notFound();
};

const list = async (req, res) => {
  try {
    const { doc } = await AdminCouponsService.list();
    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const save = (schemaKey) => async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.admin.coupons[schemaKey],
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const result = await AdminCouponsService.save(req.params.id || null, req.body);
    return reply(res, result, schemaKey === 'create' ? res.postSuccessfully : res.getRequest);
  } catch (error) {
    return res.serverError(error);
  }
};

const remove = async (req, res) => {
  try {
    return reply(res, await AdminCouponsService.remove(req.params.id), () => res.deleted());
  } catch (error) {
    return res.serverError(error);
  }
};

const redemptions = async (req, res) => {
  try {
    return reply(res, await AdminCouponsService.redemptions(req.params.id), res.getRequest);
  } catch (error) {
    return res.serverError(error);
  }
};

const searchCustomers = async (req, res) => {
  try {
    const { doc } = await AdminCouponsService.searchCustomers(req.query.q);
    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = {
  list, create: save('create'), update: save('update'), remove, redemptions, searchCustomers,
};
