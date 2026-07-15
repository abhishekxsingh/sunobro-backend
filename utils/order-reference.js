const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const generate = () => {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return `SB-${suffix}`;
};

module.exports = { generate };
