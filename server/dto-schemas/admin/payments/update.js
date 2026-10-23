module.exports = {
  title: 'set active payment gateway',
  type: 'object',
  properties: {
    activeGateway: {
      type: 'string',
      enum: ['razorpay', 'payu', 'easebuzz', 'cashfree'],
    },
  },
  required: ['activeGateway'],
  errorMessage: {
    required: {
      activeGateway: 'Parameter: activeGateway is required.',
    },
    properties: {
      activeGateway: 'Parameter: activeGateway must be razorpay, payu, easebuzz, or cashfree.',
    },
  },
  additionalProperties: false,
};
