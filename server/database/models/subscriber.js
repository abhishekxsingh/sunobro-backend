const { Schema, model } = require('mongoose');

const subscriberSchema = new Schema({
  email: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
  },
}, { timestamps: true });

module.exports = model('Subscriber', subscriberSchema);
