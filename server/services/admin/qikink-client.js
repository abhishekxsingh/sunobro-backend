// Low-level Qikink HTTP client: token cache, auth headers, order list,
// and dashboard My Products (fetch_my_products).
const { QIKINK } = require('../../config');

const USER_AGENT = 'SunoBro/1.0';

const baseUrl = () => QIKINK.BASE_URL;
const DASHBOARD_MY_PRODUCTS_URL = () => QIKINK.FETCH_MY_PRODUCTS_URL
  || 'https://dashboard.qikink.com/index.php/products/fetch_my_products';

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
// accepts a single `id` (`order_reference_no` is rejected). Neither host
// supports the documented multi-order `ids` filter (it returns 500).
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
  const { res, data } = await request(`${LEGACY_ROUTE}${toQueryString(query)}`, { headers });
  if (!res.ok || data?.error) throw new Error(qikinkMessage(data, res.status));
  return Array.isArray(data) ? data : data?.data || [];
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

/**
 * Build the DataTables form body Qikink's My Products grid posts
 * (same shape as the dashboard / Postman curl).
 */
const myProductsFormBody = ({ draw = 1, start = 0, length = 100 } = {}) => {
  const body = new URLSearchParams();
  body.set('draw', String(draw));
  for (let i = 0; i < 6; i += 1) {
    const data = i === 3 ? 'base_price' : (i === 4 ? 'price_range' : 'function');
    const orderable = i === 3 || i === 5 ? 'true' : 'false';
    body.set(`columns[${i}][data]`, data);
    body.set(`columns[${i}][name]`, '');
    body.set(`columns[${i}][searchable]`, 'true');
    body.set(`columns[${i}][orderable]`, orderable);
    body.set(`columns[${i}][search][value]`, '');
    body.set(`columns[${i}][search][regex]`, 'false');
  }
  body.set('order[0][column]', '0');
  body.set('order[0][dir]', 'asc');
  body.set('start', String(start));
  body.set('length', String(length));
  body.set('search[value]', '');
  body.set('search[regex]', 'false');
  body.set('searched_client_product_id', '');
  return body;
};

/**
 * Dashboard DataTables endpoint for My Products.
 * Needs a logged-in dashboard Cookie (browser/Postman attach it automatically;
 * server cron must set QIKINK_DASHBOARD_COOKIE). Custom API token alone → signin.
 */
const fetchMyProductsPage = async ({
  draw = 1, start = 0, length = 100,
} = {}) => {
  if (!QIKINK.DASHBOARD_COOKIE) {
    throw new Error(
      'QIKINK_DASHBOARD_COOKIE is empty. Copy the Cookie header from the working '
      + 'fetch_my_products request in browser DevTools / Postman (Code → cURL) into .env.',
    );
  }

  const headers = {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': USER_AGENT,
    Referer: 'https://dashboard.qikink.com/',
    Origin: 'https://dashboard.qikink.com',
    Cookie: QIKINK.DASHBOARD_COOKIE,
  };

  const res = await fetch(DASHBOARD_MY_PRODUCTS_URL(), {
    method: 'POST',
    headers,
    body: myProductsFormBody({ draw, start, length }),
    redirect: 'manual',
  });
  const location = res.headers.get('location') || '';
  const raw = await res.text();
  if (res.status >= 300 && res.status < 400 && /signin|login/i.test(location)) {
    throw new Error(
      'Qikink session expired (redirected to sign-in). Refresh QIKINK_DASHBOARD_COOKIE from a logged-in fetch_my_products request.',
    );
  }
  let data = {};
  try {
    data = JSON.parse(raw);
  } catch {
    if (/signin|sign up|login/i.test(raw)) {
      throw new Error(
        'Qikink returned the sign-in page. Refresh QIKINK_DASHBOARD_COOKIE.',
      );
    }
    throw new Error(`Qikink fetch_my_products returned non-JSON (${res.status}).`);
  }
  if (!res.ok || data?.error) {
    throw new Error(qikinkMessage(data, res.status));
  }
  return data;
};

/** Pages through fetch_my_products until all rows are loaded. */
const fetchMyProducts = async ({ pageSize = 100 } = {}) => {
  const all = [];
  let start = 0;
  let draw = 1;
  let total = Infinity;
  while (start < total) {
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchMyProductsPage({ draw, start, length: pageSize });
    const rows = Array.isArray(page?.data) ? page.data : [];
    total = Number(page?.recordsFiltered ?? page?.recordsTotal ?? rows.length) || rows.length;
    all.push(...rows);
    if (!rows.length) break;
    start += rows.length;
    draw += 1;
    if (rows.length < pageSize) break;
  }
  return all;
};

module.exports = {
  isConfigured,
  qikinkMessage,
  request,
  getAccessToken,
  qikinkHeaders,
  listOrders,
  fetchMyProductsPage,
  fetchMyProducts,
};
