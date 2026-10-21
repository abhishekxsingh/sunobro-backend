const MembersService = require('../../services/admin/members');
const Schemas = require('../../dto-schemas');
const Validator = require('../../utils/validator');

const reply = (res, { doc, errors, type }, ok) => {
  if (doc) return ok(doc);
  if (type === 'conflict') return res.conflict('conflict', errors);
  return res.notFound();
};

const validated = (schema, handler) => async (req, res) => {
  try {
    if (schema) {
      const { errors } = Validator.isSchemaValid({ data: req.body, schema });
      if (errors) return res.badRequest('field-validation', errors);
    }
    return await handler(req, res);
  } catch (error) {
    return res.serverError(error);
  }
};

module.exports = {
  list: validated(null, async (req, res) => res.getRequest((await MembersService.list(req.admin.sub)).doc)),
  create: validated(Schemas.admin.members.create, async (req, res) => (
    reply(res, await MembersService.create(req.body, req.admin.sub), res.postSuccessfully)
  )),
  update: validated(Schemas.admin.members.update, async (req, res) => (
    reply(res, await MembersService.update(req.params.id, req.body, req.admin.sub), res.getRequest)
  )),
  resetPassword: validated(null, async (req, res) => (
    reply(res, await MembersService.resetPassword(req.params.id, req.admin.sub), res.getRequest)
  )),
  remove: validated(null, async (req, res) => (
    reply(res, await MembersService.remove(req.params.id, req.admin.sub), () => res.deleted())
  )),
};
