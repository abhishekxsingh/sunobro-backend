const OrdersService = require('../../services/customer/orders');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');
const { toOrderDTO } = require('../../utils/serializers');

const create = async (req, res) => {
  try {
    const { body, customer } = req;
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: body,
      schema: Schemas.customer.orders.save,
    });

    if (validationErrors) {
      return res.badRequest('field-validation', validationErrors);
    }

    const { doc, errors, type } = await OrdersService.create(body, customer?.sub);

    if (!doc) {
      if (type === 'conflict') {
        return res.conflict('insufficient-stock', errors);
      }

      return res.badRequest('field-validation', errors);
    }

    return res.postSuccessfully(toOrderDTO(doc));
  } catch (error) {
    return res.serverError(error);
  }
};

const get = async (req, res) => {
  try {
    const { params: { id } } = req;
    const { doc } = await OrdersService.get(id);

    if (!doc) {
      return res.notFound();
    }

    return res.getRequest(toOrderDTO(doc));
  } catch (error) {
    return res.serverError(error);
  }
};

const listMine = async (req, res) => {
  try {
    const { customer: { sub: customerId }, query: { page, limit } } = req;
    const { doc, meta } = await OrdersService.listMine(customerId, { page, limit });

    res.setHeader('x-coreplatform-total-records', meta.totalRecords);
    res.setHeader('x-coreplatform-page', meta.page);
    res.setHeader('x-coreplatform-limit', meta.limit);

    return res.getRequest(doc.map(toOrderDTO));
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { create, get, listMine };
