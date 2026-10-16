module.exports = {
  title: 'update customer profile',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    phone: { type: 'string', minLength: 8, maxLength: 20 },
  },
  required: ['name', 'phone'],
  errorMessage: {
    required: {
      name: 'Parameter: name is required.',
      phone: 'Parameter: phone is required.',
    },
    properties: {
      name: 'Parameter: name must be 1-80 characters.',
      phone: 'Parameter: phone must be 8-20 characters.',
    },
  },
  additionalProperties: false,
};
