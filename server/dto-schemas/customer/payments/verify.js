module.exports = {
  title: 'verify payment',
  type: 'object',
  properties: {
    orderId: { type: 'string', minLength: 1 },
    paymentOrderId: { type: 'string', minLength: 1 },
    paymentId: { type: 'string', minLength: 1 },
    signature: { type: 'string', minLength: 1 },
  },
  required: ['orderId', 'paymentOrderId', 'paymentId', 'signature'],
  errorMessage: {
    required: {
      orderId: 'Parameter: orderId is required.',
      paymentOrderId: 'Parameter: paymentOrderId is required.',
      paymentId: 'Parameter: paymentId is required.',
      signature: 'Parameter: signature is required.',
    },
  },
  additionalProperties: true,
};
