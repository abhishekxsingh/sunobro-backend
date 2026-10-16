const AccountService = require('../../services/customer/account');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');
const { toCustomerDTO } = require('../../utils/serializers');

const updateProfile = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.profile.update,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const { doc, errors } = await AccountService.updateProfile(req.customer.sub, req.body);
    if (!doc) return res.badRequest('profile', errors);
    return res.getSuccessfully(toCustomerDTO(doc));
  } catch (error) {
    return res.serverError(error);
  }
};

const addAddress = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.address.save,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const { doc, errors } = await AccountService.addAddress(req.customer.sub, req.body);
    if (!doc) return res.badRequest('address', errors);
    return res.postSuccessfully(toCustomerDTO(doc));
  } catch (error) {
    return res.serverError(error);
  }
};

const updateAddress = async (req, res) => {
  try {
    const { errors: validationErrors } = Validator.isSchemaValid({
      data: req.body,
      schema: Schemas.customer.address.save,
    });
    if (validationErrors) return res.badRequest('field-validation', validationErrors);

    const { doc, errors } = await AccountService.updateAddress(
      req.customer.sub,
      req.params.id,
      req.body,
    );
    if (!doc) return res.badRequest('address', errors);
    return res.getSuccessfully(toCustomerDTO(doc));
  } catch (error) {
    return res.serverError(error);
  }
};

const removeAddress = async (req, res) => {
  try {
    const { doc, errors } = await AccountService.removeAddress(req.customer.sub, req.params.id);
    if (!doc) return res.badRequest('address', errors);
    return res.getSuccessfully(toCustomerDTO(doc));
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = {
  updateProfile, addAddress, updateAddress, removeAddress,
};
