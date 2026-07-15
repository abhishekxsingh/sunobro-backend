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
    'max-len': ['error', { code: 160 }],
    'max-lines': ['error', 500],
    'no-console': 'error',
  },
  overrides: [
    {
      files: ['controllers/**/*.js', 'routes/**/*.js'],
      rules: {
        'no-restricted-properties': ['error',
          { object: 'res', property: 'status', message: 'Use the res.* response helpers instead (utils/middleware/http.js).' },
          { object: 'res', property: 'json', message: 'Use the res.* response helpers instead (utils/middleware/http.js).' },
          { object: 'res', property: 'send', message: 'Use the res.* response helpers instead (utils/middleware/http.js).' },
          { object: 'res', property: 'sendStatus', message: 'Use the res.* response helpers instead (utils/middleware/http.js).' },
          { object: 'res', property: 'end', message: 'Use the res.* response helpers instead (utils/middleware/http.js).' },
        ],
      },
    },
  ],
};
