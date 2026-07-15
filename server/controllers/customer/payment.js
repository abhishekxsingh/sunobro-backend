const PaymentService = require('../../services/customer/payment');

const createOrder = async (req, res) => {
  try {
    const { doc } = await PaymentService.createOrder(req.body);

    if (!doc) {
      return res.notImplemented();
    }

    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

const verify = async (req, res) => {
  try {
    const { doc } = await PaymentService.verify(req.body);

    if (!doc) {
      return res.notImplemented();
    }

    return res.getRequest(doc);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = { createOrder, verify };
