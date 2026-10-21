const crypto = require('crypto');
const mongoose = require('mongoose');
const { Admin } = require('../../database/models');
const password = require('../../utils/password');
const { toAdminDTO } = require('../../utils/serializers');

const notFound = { errors: [{ name: 'member', message: 'Team member not found.' }] };
const conflict = (name, message) => ({ type: 'conflict', errors: [{ name, message }] });

// Readable one-time password: 4 groups of 4 from an unambiguous alphabet (~80 bits).
const temporaryPassword = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(16);
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]).join('');
  return chars.match(/.{4}/g).join('-');
};

const toMemberDTO = (admin, currentId) => ({
  ...toAdminDTO(admin),
  isYou: String(admin._id) === String(currentId),
});

/** Would this change leave the team without an active admin? */
const leavesNoAdmin = async (member, next) => {
  const stillAdmin = (next.role ?? member.role) === 'admin' && (next.active ?? member.active) !== false;
  if (member.role !== 'admin' || member.active === false || stillAdmin) return false;
  const others = await Admin.countDocuments({
    _id: { $ne: member._id }, role: 'admin', active: { $ne: false },
  });
  return others === 0;
};

const find = async (id) => (mongoose.isValidObjectId(id) ? Admin.findById(id) : null);

const list = async (currentId) => {
  const admins = await Admin.find({}).sort({ createdAt: 1 });
  return { doc: admins.map((a) => toMemberDTO(a, currentId)) };
};

const create = async ({
  name, email, role, password: chosen,
}, currentId) => {
  const normalized = email.trim().toLowerCase();
  if (await Admin.exists({ email: normalized })) {
    return conflict('email', `${normalized} is already on the team.`);
  }
  const plain = chosen || temporaryPassword();
  const admin = await Admin.create({
    name: name.trim(),
    email: normalized,
    role,
    passwordHash: await password.hash(plain),
    createdBy: currentId,
  });
  // The password is only ever returned here, once, when it was generated.
  return { doc: { member: toMemberDTO(admin, currentId), temporaryPassword: chosen ? null : plain } };
};

const update = async (id, changes, currentId) => {
  const member = await find(id);
  if (!member) return notFound;
  const isYou = String(member._id) === String(currentId);
  if (isYou && changes.active === false) return conflict('active', "You can't deactivate yourself.");
  if (isYou && changes.role && changes.role !== member.role) {
    return conflict('role', "You can't change your own role — ask another admin.");
  }
  if (await leavesNoAdmin(member, changes)) {
    return conflict('role', 'The team needs at least one active admin.');
  }
  if (changes.name !== undefined) member.name = changes.name.trim();
  if (changes.role !== undefined) member.role = changes.role;
  if (changes.active !== undefined) member.active = changes.active;
  await member.save();
  return { doc: toMemberDTO(member, currentId) };
};

const resetPassword = async (id, currentId) => {
  const member = await find(id);
  if (!member) return notFound;
  if (String(member._id) === String(currentId)) {
    return conflict('member', 'Change your own password from Profile.');
  }
  const plain = temporaryPassword();
  member.passwordHash = await password.hash(plain);
  await member.save();
  return { doc: { member: toMemberDTO(member, currentId), temporaryPassword: plain } };
};

const remove = async (id, currentId) => {
  const member = await find(id);
  if (!member) return notFound;
  if (String(member._id) === String(currentId)) return conflict('member', "You can't remove yourself.");
  if (await leavesNoAdmin(member, { active: false })) {
    return conflict('member', 'The team needs at least one active admin.');
  }
  await member.deleteOne();
  return { doc: { id } };
};

module.exports = {
  list, create, update, resetPassword, remove, temporaryPassword,
};
