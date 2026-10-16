const { Subscriber } = require('../../database/models');
const emailService = require('../email');
const logger = require('../../utils/logger');

const subscribe = async ({ email }) => {
  const normalized = email.trim().toLowerCase();
  let subscriber = await Subscriber.findOne({ email: normalized });

  if (!subscriber) {
    try {
      subscriber = await Subscriber.create({ email: normalized });
    } catch (error) {
      if (error.code !== 11000) throw error;
      subscriber = await Subscriber.findOne({ email: normalized });
    }
  }

  if (!subscriber) {
    return { errors: [{ name: 'email', message: 'Could not save that email.' }] };
  }

  try {
    await emailService.sendDropNotice({ to: normalized });
  } catch (error) {
    logger.error(error, 'Failed to send drop notice email');
    return {
      errors: [{
        name: 'email',
        message: 'Could not send the confirmation email. Try again in a moment.',
      }],
    };
  }

  return { doc: subscriber };
};

module.exports = { subscribe };
