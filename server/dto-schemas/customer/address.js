module.exports = {
  title: 'save customer address',
  type: 'object',
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 40 },
    firstName: { type: 'string', minLength: 1, maxLength: 60 },
    lastName: { type: 'string', minLength: 1, maxLength: 60 },
    phone: { type: 'string', minLength: 8, maxLength: 20 },
    street: { type: 'string', minLength: 1, maxLength: 160 },
    city: { type: 'string', minLength: 1, maxLength: 80 },
    state: { type: 'string', maxLength: 80 },
    postalCode: { type: 'string', minLength: 4, maxLength: 12 },
    country: { type: 'string', minLength: 2, maxLength: 60 },
    isDefault: { type: 'boolean' },
  },
  required: ['firstName', 'lastName', 'phone', 'street', 'city', 'postalCode'],
  errorMessage: {
    required: {
      firstName: 'Parameter: firstName is required.',
      lastName: 'Parameter: lastName is required.',
      phone: 'Parameter: phone is required.',
      street: 'Parameter: street is required.',
      city: 'Parameter: city is required.',
      postalCode: 'Parameter: postalCode is required.',
    },
  },
  additionalProperties: false,
};
