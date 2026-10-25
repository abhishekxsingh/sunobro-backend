const AdminOrdersService = require('../../services/admin/orders');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');
const ManualOrders = require('../../services/admin/manual-orders');

const list = async (req, res) => {
  try {
    const {
      query: {
        page, limit, q, status,
      },
    } = req;
    const { doc, meta } = await AdminOrdersService.list({
      page, limit, q, status,
    });

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
      subtotal: doc.subtotal,
      discount: doc.discount || 0,
      couponCode: doc.couponCode || null,
      currency: doc.currency,
      items: doc.items,
      statusHistory: doc.statusHistory,
      createdAt: doc.createdAt,
      shippingCity: doc.shippingCity,
      shippingCountry: doc.shippingCountry,
      qikinkOrderId: doc.qikinkOrderId || null,
      qikinkStatus: doc.qikinkStatus || null,
      qikinkError: doc.qikinkError || null,
      trackingLink: (doc.qikinkAwb && doc.qikinkTrackingLink) || null,
      awb: doc.qikinkAwb || null,
      courier: doc.qikinkCourier || null,
      qikinkAttempts: doc.qikinkAttempts || 0,
      qikinkSyncedAt: doc.qikinkSyncedAt || null,
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

    const { doc, errors, warning } = await AdminOrdersService.updateStatus(id, body);
    if (errors) return res.notFound();

    return res.getRequest({
      ref: doc.reference,
      status: doc.status,
      updatedAt: doc.updatedAt,
      warning: warning || null,
    });
  } catch (error) {
    return res.serverError(error);
  }
};

const create = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.admin.orders.create,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const { doc, errors, type } = await AdminOrdersService.create(req.body, req.admin?.sub);
    if (type === 'conflict') return res.conflict('insufficient-stock', errors);
    if (errors) return res.badRequest('field-validation', errors);
    return res.postSuccessfully(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const sendQikinkResult = (res, { doc, errors, type }) => {
  if (type === 'conflict') return res.conflict('qikink-conflict', errors);
  if (errors) return res.notFound();
  return res.getRequest(doc);
};

const pushToQikink = async (req, res) => {
  try {
    return sendQikinkResult(res, await AdminOrdersService.pushToQikink(req.params.id));
  } catch (error) {
    return res.serverError(error);
  }
};

const syncQikink = async (req, res) => {
  try {
    return sendQikinkResult(res, await AdminOrdersService.syncQikink(req.params.id));
  } catch (error) {
    return res.serverError(error);
  }
};

const catalog = async (req, res) => {
  try {
    return res.getRequest(await ManualOrders.catalog());
  } catch (error) {
    return res.serverError(error);
  }
};

const quote = async (req, res) => {
  try {
    const { errors } = Validator.isSchemaValid({ data: req.body, schema: Schemas.admin.orders.quote });
    if (errors) return res.badRequest('field-validation', errors);
    const { doc } = await ManualOrders.quote(req.body);
    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = {
  catalog,
  quote,
  list,
  get,
  create,
  updateStatus,
  pushToQikink,
  syncQikink,
};
