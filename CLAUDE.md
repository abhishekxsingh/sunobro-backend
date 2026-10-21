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

## Coupons

- `Coupon` model: `code` (unique, upper-case), `kind` (general / festival / seasonal / customer — a label), `discountType` percent|flat, `value`, `maxDiscount` (percent cap), `minOrderValue`, `customerIds` (non-empty = only those logged-in customers), `startsAt`/`endsAt`, `usageLimit` (total), `perCustomerLimit` (default 1, null = unlimited), `firstOrderOnly`, `showAtCheckout` (listed as an offer), `active`, `usedCount`.
- Rules live in `services/coupons.js` (`evaluate`, `check`, `discountFor`, `redeem`, `release`, `available`). Discount never takes an order below ₹1 (Razorpay minimum).
- `POST /orders` takes `couponCode`; the order stores `subtotal`, `discount`, `couponId`, `couponCode`, `couponHolder` (`c:<customerId>` or `e:<email>`), `total = subtotal − discount`.
- **A use counts only when the order is paid** (`markPaidAndFulfill`, admin prepaid/COD create, admin status → paid/shipped/delivered) via `couponCounted` — abandoned pending orders don't burn a customer's coupon. Cancelling releases the use. `POST /payments/create-order` re-checks the coupon (expired / used up / already used by this shopper) and returns 409 asking to remove it.
- Qikink line prices are scaled by `(subtotal − discount) / subtotal` so they add up to `total_order_value`. The confirmation email shows the coupon line.
- Endpoints: storefront `GET /coupons/available` (public offers + coupons issued to the logged-in customer), `POST /coupons/validate` `{ code, items, email? }` (preview; per-customer checks skipped until there's an email). Admin `GET/POST /admin/coupons`, `PUT/DELETE /admin/coupons/:id` (delete refused once on an order — switch off instead), `GET /admin/coupons/:id/redemptions`, `GET /admin/customers/search?q=`. Admin orders accept `couponCode`.

## Customers (admin) and checkout accounts

- **Checkout needs an account.** `POST /orders` is `requireCustomer` (401 for guests); the order uses the account's email. A checkout phone is saved onto a profile that has none (typical after Google sign-in). Google sign-in fills `avatarUrl` (Google photo) and phone/name only where empty.
- `GET /admin/customers?q=&page=&limit=` — search name, email, phone (digits match despite spaces/+91), saved address street/city/PIN, or id; each row has `orders`, `purchasedOrders`, `totalSpent` (paid/shipped/delivered), `lastOrderAt`, `authMethod`. `GET /admin/customers/:id` adds addresses and every order with items. (`/admin/customers/search` is the coupon picker's lightweight lookup.)
- `GET /admin/orders?q=&status=` — every word of `q` must match one of: reference, name, email, phone, city, PIN, product name, SKU, Store SKU, colour, Qikink order id, AWB, coupon, Razorpay payment id. Queue rows include `customerId`, `email`, `phone`.

## Team members (admin accounts)

- `Admin`: `role` admin | ops, `active`, `lastLoginAt`, `createdBy`. **admin** = everything incl. the team; **ops** = everything except team management.
- `requireAdmin` looks the account up on every request (role from the DB, inactive/removed → 401), so deactivating/removing a member or changing a role takes effect on their open session immediately. `requireRole('admin')` guards team routes (403 otherwise).
- `GET/POST /admin/members`, `PUT /admin/members/:id` (name / role / active), `POST /admin/members/:id/reset-password`, `DELETE /admin/members/:id` (`services/admin/members.js`). Adding without a password generates a one-time password (`xxxx-xxxx-xxxx-xxxx`) returned once — share it; the member changes it in Profile. Guards: can't deactivate/demote/remove/reset yourself; the team always keeps ≥1 active admin. Emails are stored lower-case; login is case-insensitive.
- CLI fallback still exists: `npm run admin:create`.

## Required for selling (enforced)

- Saving a product rejects any `qikinkSku` that isn't a Store SKU (`v-…`) and any variant without a size or colour. Publishing (`active`) needs: a price > 0, a cover image, at least one switched-on variant, and a Store SKU on every switched-on variant. Order creation then resolves each line to its variant's Store SKU, which is all Qikink needs (`search_from_my_products: 1`).

## Data safety — deploys never wipe data

- **Deploys don't touch data.** The backend workflow zips `server/` and uploads it; Azure restarts `node server.js`. Nothing seeds, migrates or deletes on deploy or start. Data lives in MongoDB Atlas, separate from the app, and survives every deploy. Admin/storefront deploys don't touch the database at all.
- **Schema changes are additive only** (new optional fields with defaults, new collections). Never ship code that drops/renames fields or collections without an explicit, reviewed migration.
- `npm run db:seed` **deletes all admins, products and variants** — for an empty dev DB only. It refuses `NODE_ENV=production` and any database that already has admins/products/orders/customers unless `SEED_CONFIRM_DB=<that db name>` is set. `.env` points at PRODUCTION (`test` db): never set `SEED_CONFIRM_DB=test`.
- Tests run only against `sunobro_test` (guard in `test/setup.js`); e2e uses `sunobro_e2e`. Print `mongoose.connection.db.databaseName` before any script writes.
- Deleting a product removes only that product's variants; orders keep their own copy of line items.

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
