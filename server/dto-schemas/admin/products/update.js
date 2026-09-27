const variantItem = {
  type: 'object',
  properties: {
    size: { type: 'string', minLength: 1 },
    color: { type: 'string', minLength: 1 },
    sku: { type: 'string', minLength: 1 },
    stock: { type: 'integer', minimum: 0 },
    price: { type: 'number', minimum: 0 },
    qikinkSku: { type: 'string' },
  },
  required: ['size', 'color'],
  additionalProperties: false,
};

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
    colors: { type: 'array', items: { type: 'string' } },
    stock: { type: 'integer', minimum: 0 },
    qikinkSku: { type: 'string' },
    variants: { type: 'array', items: variantItem },
    status: { type: 'string', enum: ['active', 'draft'] },
    inStock: { type: 'boolean' },
  },
  additionalProperties: false,
};
