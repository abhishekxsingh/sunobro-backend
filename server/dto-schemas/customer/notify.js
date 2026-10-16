module.exports = {
  title: 'drop notify',
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email', maxLength: 254 },
  },
  required: ['email'],
  errorMessage: {
    required: {
      email: 'Parameter: email is required.',
    },
    properties: {
      email: 'Parameter: email must be a valid email address.',
    },
  },
  additionalProperties: false,
};
