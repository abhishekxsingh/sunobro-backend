module.exports = {
  title: 'customer register',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    phone: { type: 'string' },
    password: { type: 'string', minLength: 8 },
  },
  required: ['name', 'email', 'password'],
  errorMessage: {
    required: {
      name: 'Parameter: name is required.',
      email: 'Parameter: email is required.',
      password: 'Parameter: password is required.',
    },
    properties: {
      email: 'Parameter: email must be a valid email address.',
      password: 'Parameter: password must be at least 8 characters.',
    },
  },
  additionalProperties: false,
};
