module.exports = {
  title: 'create payment order',
  type: 'object',
  properties: {
    orderId: { type: 'string', minLength: 1 },
  },
  required: ['orderId'],
  errorMessage: {
    required: {
      orderId: 'Parameter: orderId is required.',
    },
  },
  additionalProperties: true,
};
