const customerAuthService = require('../services/customer-auth-service');
const { toCustomerDTO } = require('../utils/serializers');
const { setSessionCookie, clearSessionCookie } = require('../utils/cookies');
const { CUSTOMER_SESSION_COOKIE } = require('../config');

const register = async (req, res) => {
  const { customer, token } = await customerAuthService.register(req.body);
  setSessionCookie(res, CUSTOMER_SESSION_COOKIE, token);
  res.status(201).json(toCustomerDTO(customer));
};

const login = async (req, res) => {
  const { customer, token } = await customerAuthService.login(req.body);
  setSessionCookie(res, CUSTOMER_SESSION_COOKIE, token);
  res.json(toCustomerDTO(customer));
};

const logout = async (req, res) => {
  clearSessionCookie(res, CUSTOMER_SESSION_COOKIE);
  res.status(204).end();
};

const me = async (req, res) => {
  const customer = await customerAuthService.me(req.customer.sub);
  res.json(toCustomerDTO(customer));
};

module.exports = {
  register, login, logout, me,
};
