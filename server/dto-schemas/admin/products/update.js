module.exports = {
  title: 'update product',
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
    inStock: { type: 'boolean' },
  },
  additionalProperties: false,
};
