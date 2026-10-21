const name = { type: 'string', minLength: 1, maxLength: 80 };
const role = { type: 'string', enum: ['admin', 'ops'] };

module.exports = {
  create: {
    title: 'add team member',
    type: 'object',
    properties: {
      name,
      email: { type: 'string', format: 'email', maxLength: 120 },
      role,
      // Optional — a temporary password is generated when omitted.
      password: { type: 'string', minLength: 12, maxLength: 128 },
    },
    required: ['name', 'email', 'role'],
    errorMessage: { properties: { password: 'Password must be at least 12 characters.' } },
    additionalProperties: false,
  },
  update: {
    title: 'update team member',
    type: 'object',
    properties: { name, role, active: { type: 'boolean' } },
    additionalProperties: false,
  },
};
