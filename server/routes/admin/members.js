const MembersController = require('../../controllers/admin/members');
const { requireAdmin, requireRole } = require('../../utils/middleware/auth');

// Team management is for the admin role only; ops members get 403.
module.exports = (router) => {
  const guard = [requireAdmin, requireRole('admin')];
  router.get('/admin/members', ...guard, MembersController.list);
  router.post('/admin/members', ...guard, MembersController.create);
  router.put('/admin/members/:id', ...guard, MembersController.update);
  router.post('/admin/members/:id/reset-password', ...guard, MembersController.resetPassword);
  router.delete('/admin/members/:id', ...guard, MembersController.remove);
};
