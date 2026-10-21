module.exports = {
  title: 'admin create order',
  type: 'object',
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          sku: { type: 'string', minLength: 1 },
          qty: { type: 'integer', minimum: 1, maximum: 100 },
        },
        required: ['sku', 'qty'],
        additionalProperties: false,
      },
    },
    shipping: {
      type: 'object',
      properties: {
        firstName: { type: 'string', minLength: 1 },
        lastName: { type: 'string', minLength: 1 },
        street: { type: 'string', minLength: 1 },
        city: { type: 'string', minLength: 1 },
        state: { type: 'string' },
        postalCode: { type: 'string', minLength: 1 },
        country: { type: 'string', minLength: 1 },
        email: { type: 'string' },
        // Qikink's courier needs a reachable phone number.
        phone: { type: 'string', pattern: '^[0-9+ -]{10,15}$' },
      },
      required: ['firstName', 'lastName', 'street', 'city', 'postalCode', 'country', 'phone'],
      additionalProperties: false,
    },
    paymentMethod: { type: 'string', enum: ['prepaid', 'cod'] },
    note: { type: 'string' },
    couponCode: { type: 'string', maxLength: 30 },
    pushToQikink: { type: 'boolean' },
  },
  required: ['items', 'shipping', 'paymentMethod'],
  errorMessage: {
    required: {
      items: 'Parameter: items is required and must contain at least one line item.',
      shipping: 'Parameter: shipping address is required.',
      paymentMethod: 'Parameter: paymentMethod must be prepaid or cod.',
    },
  },
  additionalProperties: false,
};
