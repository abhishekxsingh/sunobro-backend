module.exports = {
  title: 'check coupon',
  type: 'object',
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 30 },
    email: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: { sku: { type: 'string', minLength: 1 }, qty: { type: 'integer', minimum: 1 } },
        required: ['sku', 'qty'],
      },
    },
  },
  required: ['code', 'items'],
  additionalProperties: true,
};
