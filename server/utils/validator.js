const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const ajvErrors = require('ajv-errors');

const ajv = new Ajv({ allErrors: true, coerceTypes: false });
addFormats(ajv);
ajvErrors(ajv);

const compiledBySchema = new WeakMap();

const compile = (schema) => {
  if (!compiledBySchema.has(schema)) {
    compiledBySchema.set(schema, ajv.compile(schema));
  }

  return compiledBySchema.get(schema);
};

const isSchemaValid = ({ data, schema }) => {
  const validate = compile(schema);
  const valid = validate(data);

  if (valid) {
    return { data, errors: null };
  }

  const errors = validate.errors.map((err) => ({
    name: (err.instancePath || err.params?.missingProperty || '').replace(/^\//, '') || err.params?.missingProperty || 'request',
    message: err.message,
  }));

  return { data, errors };
};

module.exports = { isSchemaValid };
