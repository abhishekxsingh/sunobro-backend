const { Customer } = require('../../database/models');
const password = require('../../utils/password');
const jwt = require('../../utils/jwt');
const { TOKEN_TYPE } = require('../../utils/constant');
const emailService = require('../email');
const firebase = require('../../utils/firebase');

const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';
const DUPLICATE_EMAIL_MESSAGE = 'An account with this email already exists.';

const issueSession = (customer) => jwt.sign({ type: TOKEN_TYPE.CUSTOMER, sub: customer.id });

const register = async (payload) => {
  const {
    name: customerName, email, phone, password: plainPassword,
  } = payload;

  const existing = await Customer.findOne({ email });
  if (existing) {
    return { errors: [{ name: 'email', message: DUPLICATE_EMAIL_MESSAGE }] };
  }

  const passwordHash = await password.hash(plainPassword);

  let customer;
  try {
    customer = await Customer.create({
      name: customerName, email, phone, passwordHash,
    });
  } catch (err) {
    if (err.code === 11000) {
      return { errors: [{ name: 'email', message: DUPLICATE_EMAIL_MESSAGE }] };
    }
    throw err;
  }

  emailService.sendWelcome({ to: customer.email, name: customer.name }).catch(() => {});

  return { doc: { customer, token: issueSession(customer) } };
};

const login = async ({ email, password: plainPassword }) => {
  const customer = await Customer.findOne({ email });
  if (!customer) {
    return { errors: [{ name: 'credentials', message: INVALID_CREDENTIALS_MESSAGE }] };
  }

  if (!customer.passwordHash) {
    return {
      errors: [{ name: 'credentials', message: 'This account uses Google sign-in.' }],
      code: 'google',
    };
  }

  const valid = await password.verify(plainPassword, customer.passwordHash);
  if (!valid) {
    return { errors: [{ name: 'credentials', message: INVALID_CREDENTIALS_MESSAGE }] };
  }

  return { doc: { customer, token: issueSession(customer) } };
};

const loginWithFirebase = async ({ idToken }) => {
  let decoded;
  try {
    decoded = await firebase.verifyIdToken(idToken);
  } catch (error) {
    if (error.code === 'FIREBASE_NOT_CONFIGURED') {
      return { code: 'unavailable' };
    }
    return { errors: [{ name: 'idToken', message: 'Google sign-in could not be verified.' }] };
  }

  const email = (decoded.email || '').toLowerCase();
  if (!email) {
    return { errors: [{ name: 'email', message: 'Google account has no email address.' }] };
  }

  const name = decoded.name || email.split('@')[0];
  let customer = await Customer.findOne({ firebaseUid: decoded.uid });
  let created = false;

  if (!customer) {
    customer = await Customer.findOne({ email });
    if (customer) {
      customer.firebaseUid = decoded.uid;
      if (!customer.name) customer.name = name;
      await customer.save();
    } else {
      try {
        customer = await Customer.create({
          name,
          email,
          firebaseUid: decoded.uid,
        });
        created = true;
      } catch (error) {
        if (error.code !== 11000) throw error;
        customer = await Customer.findOne({ email });
      }
    }
  }

  if (!customer) {
    return { errors: [{ name: 'customer', message: 'Could not open this account.' }] };
  }

  // Fill the profile from Google where it's empty — never overwrite what the
  // customer typed themselves.
  const fromGoogle = {};
  if (decoded.picture && customer.avatarUrl !== decoded.picture) fromGoogle.avatarUrl = decoded.picture;
  if (decoded.phone_number && !customer.phone) fromGoogle.phone = decoded.phone_number;
  if (decoded.name && !customer.name) fromGoogle.name = decoded.name;
  if (Object.keys(fromGoogle).length) {
    customer.set(fromGoogle);
    await customer.save();
  }

  if (created) {
    emailService.sendWelcome({ to: customer.email, name: customer.name }).catch(() => {});
  }

  return { doc: { customer, token: issueSession(customer) } };
};

const me = async (customerId) => {
  const customer = await Customer.findById(customerId);
  if (!customer) {
    return { errors: [{ name: 'customer', message: 'Not authenticated.' }] };
  }

  return { doc: customer };
};

module.exports = {
  register, login, loginWithFirebase, me,
};
