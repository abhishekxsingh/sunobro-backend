module.exports = {
  title: 'customer firebase login',
  type: 'object',
  properties: {
    idToken: { type: 'string', minLength: 20 },
  },
  required: ['idToken'],
  errorMessage: {
    required: {
      idToken: 'Parameter: idToken is required.',
    },
    properties: {
      idToken: 'Parameter: idToken must be a Firebase ID token.',
    },
  },
  additionalProperties: false,
};
