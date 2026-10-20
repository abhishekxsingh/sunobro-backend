# SunoBro Backend

Node.js (>=18, Node 24 in CI) / Express 4 / Mongoose 8 / MongoDB Atlas. See `../CLAUDE.md` for the cross-service overview and order lifecycle. All code is under `server/`.

## Commands (run in `server/`)

```bash
npm run start:dev   # node --watch server.js  (there is NO "dev" script)
npm start           # production
npm run db:seed     # database/seed/seed.js — WIPES admins + products; never run against production
ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run admin:create [-- --reset]   # add an admin / reset one password, touches nothing else
npm test            # eslint (airbnb-base) + mocha/chai-http/nyc on test/
npm run test-lint   # lint only
```

Startup throws if `JWT_SECRET` is unset. Qikink target: `QIKINK_ENV=sandbox` (ignored when `NODE_ENV=production`) → `https://sandbox.qikink.com` with `QIKINK_CLIENT_SECRET` from `.env`; otherwise live. `PORT` defaults to 3000 in config; local `.env` sets 4000.

Deploys to Azure App Service `preFlight` on push to `main` (`.github/workflows/azure-deploy.yml`). Only `main` (+ a stale `origin/test`) exist.

## Structure

```
server/
├── server.js                 app setup: correlation-id, res.* helpers, CORS (isAllowedOrigin), helmet, cookie-parser, error safety net
├── config/index.js           env + startup guards; RAZORPAY {KEY_ID, KEY_SECRET, WEBHOOK_SECRET}, QIKINK {hardcoded!}
├── routes/                   each file exports (router) => { router.<verb>(...) }; mounted in routes/index.js
│   ├── health.js, auth.js    customer auth: /auth/register, /login, /logout, GET /auth/me
│   ├── admin/                auth, stats, inventory, orders, products, profile (mounted via admin/index.js)
│   ├── customer/             products, orders, payment
│   └── webhook/              razorpay, cashfree (501 stub)
├── controllers/              thin: validate DTO → call service → res.* helper
│   ├── auth.js               customer auth controller (lives at top level, not customer/)
│   ├── admin/, customer/, webhook/
├── services/                 business logic; return { doc, meta? } or { type?, errors }
│   ├── admin/qikink-client.js  Qikink HTTP: token cache, headers, listOrders (falls back to legacy /api/order?id= on hosts without /api/order/list, i.e. sandbox)
│   ├── admin/qikink.js       fulfillOrder (atomic claim + dedupe lookup), syncOrders (batched, TTL), syncActiveOrders, retryFailedPushes, syncProduct/All, getStatus
│   ├── admin/{orders,products,inventory,stats,profile,auth}.js
│   ├── customer/payment.js   Razorpay createOrder / verify / markPaidAndFulfill
│   ├── customer/orders.js    create (DB re-price + atomic stock decrement + email), get, listMine (both sync Qikink)
│   ├── customer/{auth,products}.js
│   ├── webhook/cashfree.js   not-implemented stub
│   └── email.js              Resend: sendWelcome, sendOrderConfirmation (fire-and-forget, never throws)
├── database/models/          Admin, Customer, Product, ProductVariant, Order (+ connect)
├── dto-schemas/              AJV schemas per endpoint (admin/*, customer/*); validator in utils/validator.js
├── utils/
│   ├── middleware/auth.js    requireAdmin, requireCustomer, attachCustomerIfPresent
│   ├── middleware/http.js    res.getRequest / postSuccessfully / badRequest / conflict / notFound / serverError …
│   ├── constant/index.js     ORDER_STATUS, TOKEN_TYPE, STOCK_THRESHOLD (5/20), PAGINATION (20/100)
│   ├── cookies.js, jwt.js (7d), password.js (bcrypt), order-reference.js (SB-XXXXXX), logger.js (pino)
├── cron/                     index.js starts jobs after listen(); qikink.js = retry failed pushes + sync in-flight orders every QIKINK.SYNC_INTERVAL_MS
├── test/api-test/            admin-auth, catalog, health, orders, products, qikink (catalog + qikink stub global fetch — never hit live Qikink)
└── postman/                  collection + environment
```

## API surface

| Area | Routes |
|---|---|
| Customer auth | `POST /auth/register` `/auth/login` `/auth/logout`, `GET /auth/me` (requireCustomer) |
| Products | `GET /products`, `GET /products/:idOrSlug` |
| Orders | `POST /orders` (guest or attachCustomerIfPresent; rejects draft products), `GET /orders/me` (requireCustomer), `GET /orders/:id` (**public**) |
| Payments | `POST /payments/create-order`, `POST /payments/verify` |
| Webhooks | `POST /webhook/razorpay`, `POST /webhook/cashfree` (501) |
| Admin (all requireAdmin except login/logout) | `/admin/auth/{login,logout,me}`, `GET /admin/stats`, `GET /admin/inventory`, `GET /admin/orders`, `POST /admin/orders` (admin-created, prepaid/COD), `GET /admin/orders/:id`, `PUT /admin/orders/:id/status`, `GET/POST /admin/products`, `POST /admin/products/bulk`, `POST /admin/orders/:id/qikink/push`, `POST /admin/orders/:id/qikink/sync`, `GET/PUT/DELETE /admin/products/:id`, `POST /admin/products/:id/sync-qikink`, `GET /admin/qikink/status`, `POST /admin/qikink/sync-products`, `POST /admin/qikink/sync-orders`, `PUT /admin/profile`, `PUT /admin/profile/password` |

Register static paths (`/orders/me`, `/admin/products/bulk`) **before** `/:id` routes.

## Data model notes

- `Product` holds display data + base `price`; `ProductVariant` (size × color) holds `sku` (unique), `stock`, optional `price` override, `qikinkSku` (= Qikink **Store SKU** `v-…`, never the Product SKU) and optional colour `image`. Order items are keyed by `sku`.
- `POST /admin/products/import` `{ file: <base64 .xlsx>, dryRun }` — `services/admin/product-sheet.js` parses SunoBro-Product-Sheet.xlsx (Products + Variants tabs, headers matched loosely), returns problems + a per-product plan; with `dryRun: false` and no problems it creates/updates via the products service (match by slug, then name; variants by colour + size).
- Qikink two-step catalog: `services/admin/qikink-catalog.js` — `importExport` (My Products CSV → review shells linked by `qikinkProductId`; never touches an existing product's name/price/status/variants) and `applyVariations` (pasted Product Variations TSV + `images` per colour → variants via the products service). Fixtures: `test/fixtures/qikink-export.csv`, `qikink-variations-shipfix.tsv` (real files).
- `Product.status`: `review` (default) / `active` / `draft`; `resolveStatus` only enforces mapping + cover image when the result is `active`. `ProductVariant.enabled` (default true) — `setAvailability` toggles a colour or colour+size; customer `get` filters `enabled: {$ne:false}`; orders reject disabled variants. Test fixtures that need a storefront-visible product must set `status: 'active'` explicitly.
- Admin product create/update takes explicit `variants[]` (`size`, `color`, `qikinkSku`, optional `sku`/`price`/`stock`). Update syncs variants **in place** by size+colour (SKUs, ids, stock survive). Validation: no duplicate size/colour, SKU or Qikink SKU; `status: active` requires every variant mapped (409 otherwise); omitted status → active if fully mapped else draft. Legacy `sizes × colors + qikinkSku` base only fills Qikink SKUs for single-colour products.
- `Product.trackInventory` (default false = print-on-demand): stock is only checked/decremented when true. Customer variant DTO returns `stock: null, available: true` for untracked products; inventory shows `ON_DEMAND`.
- `customer/orders.create(payload, customerId, { source, paymentGateway, allowDraft })` is shared by storefront checkout and `admin/orders.create`. `Order.source` = `storefront` | `admin`; `paymentGateway` = `razorpay` | `manual` | `cod`.
- `Order` statuses: `pending → paid → shipped → delivered`, or `cancelled`. `statusHistory[]` logs every transition. Razorpay fields: `razorpayOrderId`, `razorpayPaymentId`. Qikink fields: `qikinkOrderId`, `qikinkOrderNumber` (≤15 chars from reference), `qikinkStatus` (`submitting`/`created`/`skipped`/`error`, then Qikink's own label e.g. `Live`, `In-Transit`), `qikinkError`, `qikinkAwb`, `qikinkTrackingLink`, `qikinkCourier`, `qikinkAttempts`, `qikinkLastAttemptAt`, `qikinkSyncedAt`.
- Customer `toOrderDTO` never exposes `qikinkError`; internal states show as `Processing`.
- Order totals: `SHIPPING_FEE = 0`, `TAX_RATE = 0`. Client-sent totals are ignored.

## Auth pattern

httpOnly cookies only (no Bearer tokens). JWT payload includes `type: 'admin' | 'customer'` (TOKEN_TYPE); middleware rejects a token of the wrong type. Cookie names configurable via `ADMIN_SESSION_COOKIE` / `CUSTOMER_SESSION_COOKIE`.

## Adding an endpoint

1. AJV schema in `dto-schemas/<area>/<resource>/<action>.js`, export via `dto-schemas/index.js`
2. Service method in `services/<area>/<name>.js` returning `{ doc }` or `{ type, errors }`
3. Controller in `controllers/<area>/<name>.js` mapping result → `res.*` helper
4. Route in `routes/<area>/<name>.js` with `requireAdmin` / `requireCustomer` as needed; mount in `routes/index.js` or `routes/admin/index.js`
5. Add a mocha test under `test/api-test/` and keep `npm test` (lint) green

## Known issues

- `config/index.js` hardcodes live Razorpay secret fallback + Qikink credentials (committed). Move to env and rotate.
- Razorpay webhook accepts unsigned requests and signs the re-serialized body, not the raw body (needs `express.raw` on that route).
- `.env` still carries unused `CASHFREE_*` / `QIKINK_*` keys and no `RAZORPAY_*` keys (so the hardcoded fallback is what runs).
