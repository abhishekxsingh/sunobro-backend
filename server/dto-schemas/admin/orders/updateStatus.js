module.exports = {
  title: 'update order status',
  type: 'object',
  properties: {
    status: {
      type: 'string',
      enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled'],
    },
    note: { type: 'string' },
  },
  required: ['status'],
  errorMessage: {
    required: {
      status: 'Parameter: status is required.',
    },
    properties: {
      status: 'Parameter: status must be one of: pending, paid, shipped, delivered, cancelled.',
    },
  },
  additionalProperties: false,
};
