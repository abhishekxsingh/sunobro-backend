module.exports = {
  env: {
    node: true,
    es2021: true,
    mocha: true,
  },
  extends: ['airbnb-base'],
  parserOptions: {
    ecmaVersion: 2021,
  },
  rules: {
    'no-underscore-dangle': 'off',
    'max-len': ['error', { code: 120 }],
    'no-console': 'off',
  },
};
