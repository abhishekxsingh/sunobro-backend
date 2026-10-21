const nullableNumber = { type: ['number', 'null'], minimum: 0 };
const nullableDate = { type: ['string', 'null'], format: 'date-time' };

// Shared by create (code, discountType and value required) and update (partial).
const properties = {
  code: {
    type: 'string',
    pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{2,29}$',
    errorMessage: 'Code must be 3–30 letters, numbers, - or _.',
  },
  name: { type: 'string', maxLength: 80 },
  description: { type: 'string', maxLength: 200 },
  kind: { type: 'string', enum: ['general', 'festival', 'seasonal', 'customer'] },
  discountType: { type: 'string', enum: ['percent', 'flat'] },
  value: { type: 'number', exclusiveMinimum: 0 },
  maxDiscount: nullableNumber,
  minOrderValue: { type: 'number', minimum: 0 },
  customerIds: { type: 'array', items: { type: 'string', pattern: '^[a-f0-9]{24}$' }, maxItems: 500 },
  startsAt: nullableDate,
  endsAt: nullableDate,
  usageLimit: { type: ['integer', 'null'], minimum: 1 },
  perCustomerLimit: { type: ['integer', 'null'], minimum: 1 },
  firstOrderOnly: { type: 'boolean' },
  showAtCheckout: { type: 'boolean' },
  active: { type: 'boolean' },
};

module.exports = {
  create: {
    title: 'admin create coupon',
    type: 'object',
    properties,
    required: ['code', 'discountType', 'value'],
    additionalProperties: false,
  },
  update: {
    title: 'admin update coupon',
    type: 'object',
    properties,
    additionalProperties: false,
  },
};
