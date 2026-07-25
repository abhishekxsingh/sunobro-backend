const AdminOrdersService = require('../../services/admin/orders');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');

const list = async (req, res) => {
  try {
    const { query: { page, limit } } = req;
    const { doc, meta } = await AdminOrdersService.list({ page, limit });

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
    const { doc, errors } = await AdminOrdersService.get(id);
    if (errors) return res.notFound();

    return res.getRequest({
      id: doc.id,
      reference: doc.reference,
      status: doc.status,
      client: `${doc.shippingFirstName} ${doc.shippingLastName}`,
      total: doc.total,
      currency: doc.currency,
      items: doc.items,
      statusHistory: doc.statusHistory,
      createdAt: doc.createdAt,
      shippingCity: doc.shippingCity,
      shippingCountry: doc.shippingCountry,
    });
  } catch (error) {
    return res.serverError(error);
  }
};

const updateStatus = async (req, res) => {
  try {
    const { params: { id }, body } = req;
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: body,
      schema: Schemas.admin.orders.updateStatus,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const { doc, errors } = await AdminOrdersService.updateStatus(id, body);
    if (errors) return res.notFound();

    return res.getRequest({
      ref: doc.reference,
      status: doc.status,
      updatedAt: doc.updatedAt,
    });
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { list, get, updateStatus };
