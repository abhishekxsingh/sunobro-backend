// Low-level Qikink HTTP client: token cache, auth headers, order list.
const { QIKINK } = require('../../config');

const USER_AGENT = 'SunoBro/1.0';

const baseUrl = () => QIKINK.BASE_URL;

let cachedToken = null;
let cachedTokenUntil = 0;

const isConfigured = () => Boolean(QIKINK.CLIENT_ID && QIKINK.CLIENT_SECRET);

const qikinkMessage = (data, status) => (
  data?.error
  || data?.message
  || `Qikink request failed (${status})`
);

const request = async (path, { method = 'GET', headers = {}, body } = {}) => {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
      ...headers,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
};

const getAccessToken = async (force = false) => {
  if (!isConfigured()) {
    throw new Error('Qikink credentials are not configured.');
  }

  if (!force && cachedToken && Date.now() < cachedTokenUntil) {
    return cachedToken;
  }

  const body = new URLSearchParams();
  body.append('ClientId', QIKINK.CLIENT_ID);
  body.append('client_secret', QIKINK.CLIENT_SECRET);

  const { res, data } = await request('/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok || !data?.Accesstoken || data?.error) {
    throw new Error(qikinkMessage(data, res.status));
  }

  const ttlSeconds = Number(data.expires_in) || 3600;
  cachedToken = data.Accesstoken;
  cachedTokenUntil = Date.now() + Math.max((ttlSeconds - 60) * 1000, 30_000);
  return cachedToken;
};

const qikinkHeaders = async () => {
  const token = await getAccessToken();
  return {
    'Content-Type': 'application/json',
    ClientId: QIKINK.CLIENT_ID,
    Accesstoken: token,
  };
};

const LIST_ROUTE = '/api/order/list';
const LEGACY_ROUTE = '/api/order';
// The sandbox host has no /api/order/list and its legacy /api/order only
// accepts a single `id` (`ids` errors, `order_reference_no` is rejected).
let useLegacyRoute = false;

const toQueryString = (query) => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value) !== '') {
      params.set(key, String(value));
    }
  });
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const isMissingRoute = (res, data) => res.status === 404
  && /find a route/i.test(qikinkMessage(data, res.status));

const listOrdersLegacy = async (query, headers) => {
  if (query.order_reference_no) return [];
  const ids = query.ids ? String(query.ids).split(',') : [query.id];
  const rows = [];
  for (let i = 0; i < ids.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const { res, data } = await request(`${LEGACY_ROUTE}${toQueryString({ ...query, ids: undefined, id: ids[i] })}`, { headers });
    if (!res.ok || data?.error) throw new Error(qikinkMessage(data, res.status));
    rows.push(...(Array.isArray(data) ? data : data?.data || []));
  }
  return rows;
};

const listOrders = async (query = {}) => {
  const headers = await qikinkHeaders();
  if (useLegacyRoute) return listOrdersLegacy(query, headers);

  const { res, data } = await request(`${LIST_ROUTE}${toQueryString(query)}`, { headers });
  if (isMissingRoute(res, data)) {
    useLegacyRoute = true;
    return listOrdersLegacy(query, headers);
  }
  if (!res.ok || data?.success === false) {
    throw new Error(qikinkMessage(data, res.status));
  }
  return Array.isArray(data?.data) ? data.data : [];
};

module.exports = {
  isConfigured, qikinkMessage, request, getAccessToken, qikinkHeaders, listOrders,
};
