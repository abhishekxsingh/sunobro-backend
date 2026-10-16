/* eslint-disable no-console -- CLI script: output is the interface. */
/**
 * Create an admin, or reset one admin's password, without touching any other
 * data (unlike database/seed/seed.js, which wipes admins and products).
 *
 *   ADMIN_EMAIL=you@sunobro.com ADMIN_PASSWORD='long-password' npm run admin:create
 *   ADMIN_EMAIL=you@sunobro.com ADMIN_PASSWORD='new-password' npm run admin:create -- --reset
 *
 * Optional: ADMIN_NAME, ADMIN_ROLE (admin | ops). Uses MONGODB_URI from .env.
 */
const mongoose = require('mongoose');
const { Admin } = require('../models');
const { MONGODB_URI } = require('../../config');
const { hash } = require('../../utils/password');

const MIN_PASSWORD_LENGTH = 12;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const run = async () => {
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'SunoBro Admin';
  const role = process.env.ADMIN_ROLE || 'admin';
  const reset = process.argv.includes('--reset');

  if (!email.includes('@')) fail('Set ADMIN_EMAIL.');
  if (password.length < MIN_PASSWORD_LENGTH) fail(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (!['admin', 'ops'].includes(role)) fail('ADMIN_ROLE must be admin or ops.');

  await mongoose.connect(MONGODB_URI);
  console.log(`Database: ${mongoose.connection.db.databaseName}`);

  const existing = await Admin.findOne({ email });
  if (existing && !reset) {
    fail(`${email} already exists. Re-run with --reset to change its password.`);
  }

  const passwordHash = await hash(password);
  if (existing) {
    existing.passwordHash = passwordHash;
    await existing.save();
    console.log(`Password reset for ${email}.`);
  } else {
    await Admin.create({
      name, email, passwordHash, role,
    });
    console.log(`Created ${role} ${email}.`);
  }

  await mongoose.disconnect();
};

run().catch((err) => fail(err.message));
