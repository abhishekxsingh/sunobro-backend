const orderLineItem = {
  type: 'object',
  properties: {
    productId: { type: 'string' },
    name: { type: 'string' },
    size: { type: 'string' },
    color: { type: 'string' },
    sku: { type: 'string' },
    price: { type: 'number' },
    qty: { type: 'integer', minimum: 1 },
  },
  required: ['productId', 'sku', 'qty'],
  additionalProperties: true,
};

const shippingAddress = {
  type: 'object',
  properties: {
    firstName: { type: 'string', minLength: 1 },
    lastName: { type: 'string', minLength: 1 },
    street: { type: 'string', minLength: 1 },
    city: { type: 'string', minLength: 1 },
    postalCode: { type: 'string', minLength: 1 },
    country: { type: 'string', minLength: 1 },
  },
  required: ['firstName', 'lastName', 'street', 'city', 'postalCode', 'country'],
  additionalProperties: true,
};

module.exports = {
  title: 'create order',
  type: 'object',
  properties: {
    items: { type: 'array', items: orderLineItem, minItems: 1 },
    shipping: shippingAddress,
  },
  required: ['items', 'shipping'],
  errorMessage: {
    required: {
      items: 'Parameter: items is required and must contain at least one line item.',
      shipping: 'Parameter: shipping address is required.',
    },
  },
  additionalProperties: true,
};
