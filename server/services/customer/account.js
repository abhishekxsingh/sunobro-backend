const { Customer } = require('../../database/models');

const MAX_ADDRESSES = 8;

const load = async (customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    return { errors: [{ name: 'customer', message: 'Not authenticated.' }] };
  }
  return { customer };
};

const clearDefault = (customer) => {
  /* eslint-disable no-param-reassign */
  customer.addresses.forEach((address) => {
    address.isDefault = false;
  });
  /* eslint-enable no-param-reassign */
};

const updateProfile = async (customerId, { name, phone }) => {
  const { customer, errors } = await load(customerId);
  if (!customer) return { errors };

  customer.name = name.trim();
  customer.phone = phone.trim();
  await customer.save();
  return { doc: customer };
};

const addAddress = async (customerId, payload) => {
  const { customer, errors } = await load(customerId);
  if (!customer) return { errors };
  if (customer.addresses.length >= MAX_ADDRESSES) {
    return { errors: [{ name: 'address', message: 'You can save up to 8 addresses.' }] };
  }

  const makeDefault = payload.isDefault || customer.addresses.length === 0;
  if (makeDefault) clearDefault(customer);
  customer.addresses.push({
    label: (payload.label || 'Home').trim(),
    firstName: payload.firstName.trim(),
    lastName: payload.lastName.trim(),
    phone: payload.phone.trim(),
    street: payload.street.trim(),
    city: payload.city.trim(),
    state: (payload.state || '').trim(),
    postalCode: payload.postalCode.trim(),
    country: (payload.country || 'India').trim(),
    isDefault: makeDefault,
  });
  if (!customer.phone) customer.phone = payload.phone.trim();
  await customer.save();
  return { doc: customer };
};

const updateAddress = async (customerId, addressId, payload) => {
  const { customer, errors } = await load(customerId);
  if (!customer) return { errors };
  const address = customer.addresses.id(addressId);
  if (!address) {
    return { errors: [{ name: 'address', message: 'Address not found.' }] };
  }

  address.label = (payload.label || address.label || 'Home').trim();
  address.firstName = payload.firstName.trim();
  address.lastName = payload.lastName.trim();
  address.phone = payload.phone.trim();
  address.street = payload.street.trim();
  address.city = payload.city.trim();
  address.state = (payload.state || '').trim();
  address.postalCode = payload.postalCode.trim();
  address.country = (payload.country || 'India').trim();
  if (payload.isDefault) {
    clearDefault(customer);
    address.isDefault = true;
  }
  await customer.save();
  return { doc: customer };
};

const removeAddress = async (customerId, addressId) => {
  const { customer, errors } = await load(customerId);
  if (!customer) return { errors };
  const address = customer.addresses.id(addressId);
  if (!address) {
    return { errors: [{ name: 'address', message: 'Address not found.' }] };
  }
  const wasDefault = address.isDefault;
  address.deleteOne();
  if (wasDefault && customer.addresses.length > 0) {
    customer.addresses[0].isDefault = true;
  }
  await customer.save();
  return { doc: customer };
};

module.exports = {
  updateProfile, addAddress, updateAddress, removeAddress,
};
