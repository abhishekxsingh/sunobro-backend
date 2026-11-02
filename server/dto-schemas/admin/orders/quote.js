module.exports = {
  title: 'admin order quote',
  type: 'object',
  properties: {
    items: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        properties: { sku: { type: 'string', minLength: 1 }, qty: { type: 'integer', minimum: 1, maximum: 100 } },
        required: ['sku', 'qty'],
      },
    },
    customerId: { type: 'string', pattern: '^[a-f0-9]{24}$' },
    email: { type: 'string' },
    couponCode: { type: 'string', maxLength: 30 },
  },
  required: ['items'],
  additionalProperties: false,
};
