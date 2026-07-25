module.exports = {
  title: 'create product',
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    slug: { type: 'string', minLength: 1 },
    description: { type: 'string' },
    price: { type: 'number', minimum: 0 },
    currency: { type: 'string', maxLength: 3 },
    images: { type: 'array', items: { type: 'string' } },
    sizes: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['active', 'draft'] },
  },
  required: ['name', 'price'],
  errorMessage: {
    required: {
      name: 'Parameter: name is required.',
      price: 'Parameter: price is required.',
    },
    properties: {
      name: 'Parameter: name must be a non-empty string.',
      price: 'Parameter: price must be a non-negative number.',
    },
  },
  additionalProperties: false,
};
