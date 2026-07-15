module.exports = {
  title: 'admin login',
  type: 'object',
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 1 },
  },
  required: ['email', 'password'],
  errorMessage: {
    required: {
      email: 'Parameter: email is required.',
      password: 'Parameter: password is required.',
    },
    properties: {
      email: 'Parameter: email must be a valid email address.',
      password: 'Parameter: password must be a non-empty string.',
    },
  },
  additionalProperties: false,
};
