const snakeToCamelKey = (key) => key.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

const camelToSnakeKey = (key) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

const convertKeys = (value, convertKey) => {
  if (Array.isArray(value)) {
    return value.map((item) => convertKeys(item, convertKey));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [convertKey(key), convertKeys(val, convertKey)]),
    );
  }

  return value;
};

const convertSnakeToCamel = (value) => convertKeys(value, snakeToCamelKey);

const convertCamelToSnake = (value) => convertKeys(value, camelToSnakeKey);

module.exports = { convertSnakeToCamel, convertCamelToSnake };
