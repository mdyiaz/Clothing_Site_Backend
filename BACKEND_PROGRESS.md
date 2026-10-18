# Rangoli Backend — Build Progress Log

> Living document for **`rangoli-backend/`** (NestJS 11 + Prisma + PostgreSQL).
> Source of truth for *what the product should be* is `PROJECT_MASTER_DOCUMENT.md`.
> This doc records **what has actually been built, tested, and what remains**.
>
> **Last updated:** 2026-10-17 (Phase 4: discounts, reviews, notifications, users, payments; 406 tests green)

---

## 1. Status snapshot

| Area | State | Notes |
|---|---|---|
| Phase 1 — foundation (auth, RBAC, products, categories, search, health) | ✅ done | ~90% of Phase 1 scope |
| Phase 2 — media, collections, homepage builder, banners, navbar, footer, settings | ✅ code complete | 58 new routes, all registered in `src/app.module.ts` |
| Products — nested variants + media writes | ✅ done | `toPersistence` nested payloads + stock sync |
| Categories — public storefront routes (bug fix) | ✅ done | `GET /categories/storefront(/:slug)` now `@Public()` |
| Seeds (roles, settings, categories, products, content) | ✅ done | All idempotent, wired in `prisma/seed.ts` |
| Unit tests | ✅ 442 tests / 41 suites, full run green | `npm test` + lint + typecheck all clean |
| Phase 3 — cart + wishlist + orders | ✅ built | guest/user carts, stock checks, merge, totals; wishlist toggle/list/move-to-cart; checkout with snapshots + idempotency, status pipeline with restock, COD payment tracking, guest tracking |
| Route security contract | ✅ done | every route is `@Public()` or `@RequirePermissions()` (only `AuthController.me` exempt); all permission values validated against catalog |
| Phase 4 — discounts + coupons | ✅ built | validate/redeem engine, scopes/limits, checkout integration (`couponCode`) |
| Phase 4 — reviews + ratings | ✅ built | verified-purchase reviews, duplicate guard, summary/distribution, admin moderation |
| Phase 4 — notifications | ✅ built | mail + SMS adapters, templates, checkout/status hooks (fire-and-forget) |
| Phase 4 — customer/admin users | ✅ built | profile + address book; admin list/detail/update/soft-delete |
| Phase 4 — payments (bKash + SSLCommerz) | ✅ built | redirect checkout, server-to-server verification, idempotent settlement, gateway config |
| Phase 4 — dashboards (analytics/reports) | ✅ built | summary, sales series, payments, inventory, customers, marketing, accounting |
| Phase 5 — loyalty + gift vouchers | ✅ built | points ledger + tiers; voucher issue/preview/redeem; checkout integration |
| Phase 5 — AI chatbot (Groq) | ✅ built | keyword RAG over products, Groq completion, catalog fallback, persisted transcript |
| Phase 5 — 3PL (Pathao/RedX) | ✅ built | shipment create/track/cancel adapters + admin routes |
| Phase 5 — multi-language | ❌ dropped | removed from scope by request |
| Phase 6 — System Health backend | ✅ built | ErrorLog + filter persistence, System Health module (errors/mismatches/summary/resolve/rerun), hourly reconciliation (8 checks), 3 menu permission keys; admin UI + migration pending |
| `npm run lint` + `npm run typecheck` | ✅ clean | re-verified 2026-10-17 |
| Prisma migrations (`prisma/migrations/`) | ❌ missing | Needs a live DB / Docker — deferred by user (weak RAM, no Docker locally) |
| Docker (`docker-compose`) | ⏸ deferred | Production concern only |
| Admin + storefront frontends | ⏸ not started | `Rangoli-admin/`, `Rangoli-frontend/` are empty dirs |

---

## 2. Environment, commands, conventions

Commands (run from `rangoli-backend/`):

```bash
npm run dev          # start (watch)
npm run build        # tsc build
npm run typecheck    # tsc --noEmit  (includes spec files)
npm run lint         # eslint .  (0 warnings expected)
npm test             # jest (rootDir=src, testRegex *.spec.ts)
npx prisma generate  # after schema changes
npm run seed         # prisma/seed.ts (roles → settings → categories → products → content → admin)
```

Conventions every contributor must follow:

- **Global guard order:** `ThrottlerGuard → JwtAuthGuard → PermissionsGuard`.
- **`@Public()`** opts a route out of JWT (storefront). **`@RequirePermissions(PERMISSIONS.X)`** gates admin routes. Routes should be one or the other.
- **Route declaration order matters** — static routes (`admin`, `storefront`, `cursor`) before `:param` routes, otherwise the param swallows them.
- **Base stack:** `BaseController / BaseService / BaseRepository` with lifecycle hooks
  (`beforeCreate/afterCreate/beforeUpdate/afterUpdate/beforeDelete/afterDelete`,
  `buildWhere/buildOrderBy/toPersistence/transform`).
- **Errors:** always `AppException.badRequest/conflict/notFound/unauthorized/forbidden` →
  envelope `{ success:false, correlationId, error:{ code, message, ui? }, timestamp }`.
  Error codes are `SCREAMING_SNAKE` domains, e.g. `CATEGORY.SLUG_TAKEN`.
- **No global `fetch`** (ESLint `no-restricted-globals`) — use `src/common/http/post-form.ts` (https module).
- **Models without `deletedAt`** (Collection, HomepageSection, Banner, NavbarItem, Footer*) need
  `protected readonly softDeleteField: string | null = null;` in their repositories → hard delete.
- **PrismaModule is `@Global()`** — never import it per-feature-module.
- tsconfig: `strict: true`, `useDefineForClassFields: false`.

---

## 3. Phase 2 — what was built (endpoint reference)

All paths are relative to the API global prefix (`/api/v1`). **Public** = no token.
Access column shows the required permission otherwise.

### 3.1 Media — Cloudinary signed uploads (`src/modules/media/`)

Signed uploads so the **API secret never leaves the server**. `configuration.ts` gained a
`cloudinary` block (`CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`), env-validated at boot.
Signature = SHA-1 of sorted `k=v` pairs + secret (see `media.service.ts:95`).

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/media/config` | Public | `{ cloudName, configured }` for URL builders |
| POST | `/media/sign` | `media:upload` | Signed payload: timestamp, signature, uploadUrl, folder, resourceType |
| POST | `/media/destroy` | `media:manage` | Signed form-POST to Cloudinary destroy (via `postForm`) |

Failure codes: `MEDIA.NOT_CONFIGURED`, `MEDIA.DESTROY_FAILED`.

### 3.2 Collections (`src/modules/collections/`)

Manual + scheduled collections with window (`startsAt`/`endsAt`) support.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/collections` | Public | Live-now list (`liveNow()` window helper) |
| GET | `/collections/:slug` | Public | Live detail + `resolvedProducts` |
| GET | `/collections/admin` | `content:manage` | Admin list (with product counts) |
| GET | `/collections/admin/:id` | `content:manage` | Admin detail (joined products) |
| POST | `/collections` | `content:manage` | Create (slug rules + window validation) |
| PATCH | `/collections/:id` | `content:manage` | Update (custom slug preserved on rename) |
| DELETE | `/collections/:id` | `content:manage` | Delete (blocked if used by navbar) |
| PUT | `/collections/:id/products` | `content:manage` | Replace product set |
| POST | `/collections/:id/products` | `content:manage` | Add products |
| DELETE | `/collections/:id/products` | `content:manage` | Remove products |

- Product resolution: `MANUAL` → join rows; `AUTO_SALE` → biggest discount;
  `AUTO_NEW` → newest; `AUTO_TRENDING` → `totalSold` desc (limit 50).
- Codes: `COLLECTION.SLUG_TAKEN`, `COLLECTION.BAD_WINDOW`, `COLLECTION.UNKNOWN_PRODUCT`, `COLLECTION.IN_NAVBAR`.
- Static `admin` routes are declared **before** `:slug` — do not reorder.

### 3.3 Homepage builder (`src/modules/homepage/`)

Sections per `pageKey` (default `home`), each with a `sourceType`, schedule window,
media (banner-style images) and hand-picked items.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/homepage?pageKey=` | Public | Storefront payload (cached 60s, key `homepage:`) |
| GET | `/homepage/admin?pageKey=` | `content:manage` | Admin list with media + items |
| POST | `/homepage/sections` | `content:manage` | Create section |
| GET | `/homepage/sections/:id` | `content:manage` | Section detail |
| PATCH | `/homepage/sections/:id` | `content:manage` | Update section |
| DELETE | `/homepage/sections/:id` | `content:manage` | Delete section |
| POST | `/homepage/reorder` | `content:manage` | Drag-and-drop order (10-step sortOrder) |
| PUT | `/homepage/sections/:id/items` | `content:manage` | Replace hand-picked products |
| POST | `/homepage/sections/:id/media` | `content:manage` | Add section media |
| PATCH | `/homepage/sections/:id/media/:mediaId` | `content:manage` | Update section media |
| DELETE | `/homepage/sections/:id/media/:mediaId` | `content:manage` | Remove section media |

- `sourceType`: `MANUAL` (items), `COLLECTION` (needs `collectionId`), `AUTO_TOP_SELLING`,
  `AUTO_NEW_ARRIVALS`, `AUTO_DISCOUNTED` (limit 12).
- Codes: `HOMEPAGE.COLLECTION_REQUIRED`, `HOMEPAGE.UNKNOWN_COLLECTION`, `HOMEPAGE.BAD_WINDOW`,
  `HOMEPAGE.REORDER_MISMATCH`, `HOMEPAGE.UNKNOWN_PRODUCT`.
- Every write invalidates the `homepage:` cache prefix.

### 3.4 Banners (`src/modules/banners/`)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/banners?position=` | Public | Live banners, optional placement filter |
| GET | `/banners/admin` | `content:manage` | Admin list |
| GET | `/banners/admin/:id` | `content:manage` | Admin detail |
| POST | `/banners` | `content:manage` | Create (media required per type) |
| PATCH | `/banners/:id` | `content:manage` | Update (merged window/media validation) |
| DELETE | `/banners/:id` | `content:manage` | Delete |

Codes: `BANNER.IMAGE_REQUIRED`, `BANNER.VIDEO_REQUIRED`, `BANNER.BAD_WINDOW`.

### 3.5 Navbar (`src/modules/navbar/`)

Two-level menu (top links + mega-menu children), URLs resolved server-side.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/navbar` | Public | Active tree with resolved URLs |
| GET | `/navbar/admin` | `content:manage` | Flat admin list |
| POST | `/navbar` | `content:manage` | Create (link-type validation) |
| GET | `/navbar/:id` | `content:manage` | Detail |
| PATCH | `/navbar/:id` | `content:manage` | Update (cycle + depth checks) |
| DELETE | `/navbar/:id` | `content:manage` | Delete (blocked while it has children) |
| POST | `/navbar/reorder` | `content:manage` | Reorder (validates all ids exist) |

- `linkType` → URL: `CATEGORY` → `/c/:slug` (only if active), `COLLECTION` → `/collections/:slug`
  (only if live), `CUSTOM_URL`/`PAGE` → `customUrl`. Broken targets are **hidden**, not rendered.
- Codes: `NAVBAR.CATEGORY_REQUIRED`, `NAVBAR.UNKNOWN_CATEGORY`, `NAVBAR.COLLECTION_REQUIRED`,
  `NAVBAR.UNKNOWN_COLLECTION`, `NAVBAR.URL_REQUIRED`, `NAVBAR.MAX_DEPTH` (max 2 levels),
  `NAVBAR.PARENT_SELF`, `NAVBAR.CYCLE`, `NAVBAR.HAS_CHILDREN`, `NAVBAR.REORDER_MISMATCH`.

### 3.6 Footer (`src/modules/footer/`)

Columns + links + contact strip + social icons + newsletter — one admin screen, one payload.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/footer` | Public | Storefront payload (cached 300s, key `footer:`) |
| POST | `/footer/newsletter` | Public | Subscribe (email or phone, upsert/reactivate) |
| GET | `/footer/admin` | `content:manage` | Everything incl. inactive |
| GET | `/footer/newsletter` | `content:manage` | Paginated subscribers (+ search) |
| POST | `/footer/columns` | `content:manage` | Create column |
| PATCH/DELETE | `/footer/columns/:id` | `content:manage` | Update/delete (links cascade) |
| POST | `/footer/columns/:columnId/links` | `content:manage` | Create link |
| PATCH/DELETE | `/footer/links/:id` | `content:manage` | Update/delete link |
| POST/PATCH/DELETE | `/footer/contact[/:id]` | `content:manage` | Contact strip CRUD |
| POST/PATCH/DELETE | `/footer/social[/:id]` | `content:manage` | Social icons CRUD |

Codes: `NEWSLETTER.CONTACT_REQUIRED`, `RESOURCE.NOT_FOUND` (missing rows).
Every write invalidates the `footer:` prefix.

### 3.7 Settings (`src/modules/settings/`)

Key/value store with dotted lowercase keys (`store.currency`, `vat.enabled`).

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/settings` | Public | Flat map for the storefront (cached 300s, key `settings:storefront`) |
| GET | `/settings/:key` | Public | One setting |
| GET | `/settings/admin` | `settings:manage` (SETTINGS_VIEW) | Full rows sorted by key |
| PATCH | `/settings` | `settings:manage` (SETTINGS_UPDATE) | Batch upsert `{ "key": value }` |
| DELETE | `/settings/:key` | `settings:manage` (SETTINGS_UPDATE) | Delete + invalidate |

Validation: `KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/`, values must be
string/number(finite)/boolean/object/null. Codes: `SETTINGS.EMPTY`, `SETTINGS.BAD_KEY`,
`SETTINGS.BAD_VALUE`.

### 3.8 Products — nested variants + media (`src/modules/products/`)

`Create/UpdateProductDto` accept nested `variants[]` and `media[]`:

- `media[]`: entry with `id` → update, with `publicId` → create, otherwise dropped.
- `variants[]`: entry with `id` → update, without → create; variant-level `media[]` is always
  **new** rows (ids stripped); removals via `removeVariantIds` / `removeMediaIds` (update only).
- `discountPercent` / `totalSold` are **never** client-writable — computed server-side
  (`((compareAt - base) / compareAt)`, rounded).
- `totalStock` = Σ variant stock, recomputed in `afterCreate/afterUpdate` whenever the payload
  contains variants; single-SKU products keep their manual number.
- Variant SKU uniqueness: duplicates inside payload → `PRODUCT.VARIANT_SKU_DUPLICATE`,
  clash with another product → `PRODUCT.VARIANT_SKU_TAKEN`.
- All product writes invalidate `facets:` + `search:` cache prefixes.
- `GET /products/filters/facets` shares `buildProductWhere` with the list so counts can never drift.

| Method | Path | Access |
|---|---|---|
| GET | `/products`, `/products/cursor`, `/products/filters/facets`, `/products/:slug` | Public |
| GET | `/products/admin` | `product:read` |
| POST | `/products` | `product:create` |
| PATCH | `/products/:id` | `product:update` |
| DELETE | `/products/:id` | `product:delete` |

### 3.9 Categories — bug fix (`src/modules/categories/`)

Storefront had **no public routes** — fixed:

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/categories/storefront` | Public | Active category list |
| GET | `/categories/storefront/:slug` | Public | Active category by slug (`CategoryService.findBySlug`) |

Everything else unchanged: admin list/cursor/tree/detail + CRUD behind
`category:read/create/update/delete`. Slug rules, 3-level depth cap, cycle detection,
`HAS_CHILDREN`/`HAS_PRODUCTS` delete guards (covered by tests).

### 3.10 Discounts + Coupons — Phase 4 (`src/modules/discounts/`)

Discount rules (scope `CART` / `PRODUCT` / `CATEGORY` / `COLLECTION`, type
`PERCENTAGE` / `FIXED_AMOUNT` / `FREE_SHIPPING` / `BUY_X_GET_Y`) plus coupons with
per-user limits (tracked in `UserCoupon`) and validity windows. Category scope resolves
descendants. Redeemed atomically inside the checkout transaction.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/discounts/validate` | Public | Preview the best discount for a cart/coupon |
| GET | `/discounts/admin`, `/discounts/admin/coupons` | `marketing:manage_coupons` | Admin lists |
| POST/PATCH/DELETE | `/discounts[/:id]`, `/discounts/coupons[/:id]` | `marketing:manage_coupons` | Discount + coupon CRUD |

- Checkout (`CheckoutDto.couponCode`) stores `couponCode`, `couponDiscount`,
  `discountAmount`, `shippingAmount`, `vatAmount=0`, and the settled `totalAmount`.
- Codes: `DISCOUNT.NOT_FOUND`, `DISCOUNT.INVALID`, `COUPON.LIMIT_REACHED`, …

### 3.11 Reviews + Ratings — Phase 4 (`src/modules/reviews/`)

Only customers with a `DELIVERED` order containing the product may review; one review
per product per user. Public reads expose approved reviews only; admin moderates.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/reviews?productId=` | Public | Approved reviews for a product |
| GET | `/reviews/summary?productId=` | Public | Avg + star distribution |
| POST | `/reviews` | auth (customer) | Create (verified-purchase only) |
| GET | `/reviews/mine` | auth | Own reviews |
| DELETE | `/reviews/:id` | auth (owner) | Delete own review |
| GET | `/reviews/admin` | `support:manage_reviews` | Moderation list |
| PATCH | `/reviews/admin/:id/approve` | `support:manage_reviews` | Approve |
| DELETE | `/reviews/admin/:id` | `support:manage_reviews` | Remove |

- Duplicate guard: `REVIEW.ALREADY_REVIEWED`; unverified: `REVIEW.NOT_PURCHASED`.

### 3.12 Notifications — Phase 4 (`src/modules/notifications/`)

Provider-agnostic outbound email + SMS via `postJson` (node:https). Disabled /
unconfigured → logs to console and never throws, so a provider outage can never break
checkout or a status change. Templates live in `templates.ts`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/notifications/status` | `settings:view` | Which channels are configured |
| POST | `/notifications/test` | `settings:update` | Send a test mail + SMS |

- Hooks in `order.service.ts`: `notifyOrderPlaced` (after checkout) and
  `notifyOrderStatus` (after every status transition), both fire-and-forget.
- Config: `mail` + `sms` blocks; env keys `MAIL_*`, `SMS_*`.

### 3.13 Users — Phase 4 (`src/modules/users/`)

Customer profile + address book, and admin user management. `passwordHash` is stripped
from every response by the service `transform`.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET/PATCH | `/users/me` | auth | Read/update own profile |
| GET/POST | `/users/me/addresses` | auth | List / add address (first becomes default) |
| PATCH/DELETE | `/users/me/addresses/:id` | auth | Update / delete owned address |
| PATCH | `/users/me/addresses/:id/default` | auth | Make default (unsets the rest) |
| GET | `/users/admin` | `user:read` | List (search, `isActive`, `roleSlug`) |
| GET | `/users/admin/:id` | `user:read` | Detail with roles |
| PATCH | `/users/admin/:id` | `user:manage` | Update (contact, `isActive`, loyalty) |
| DELETE | `/users/admin/:id` | `user:manage` | Soft-delete |

- Codes: `USER.EMAIL_TAKEN`, `USER.PHONE_TAKEN`, `RESOURCE.NOT_FOUND`.

### 3.14 Payments — bKash + SSLCommerz — Phase 3/4 (`src/modules/payments/`)

Redirect-based gateways behind a `PaymentGateway` interface. The browser callback is
**never** trusted: the final state is confirmed server-to-server (bKash `execute`,
SSLCommerz validator API) and settlement is **idempotent** (repeat IPNs are safe).

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/payments/checkout` | Public (guest phone / owner) | Start payment → gateway redirect URL |
| GET | `/payments/status/:orderNumber` | Public (guest phone / owner) | Payment status + amount due |
| POST | `/payments/bkash/callback` | Public | bKash execute + settle |
| POST | `/payments/sslcommerz/ipn` | Public | SSLCommerz IPN validate + settle |
| POST | `/payments/sslcommerz/{success,fail,cancel}` | Public | SSLCommerz redirects |

- Adapters: `bkash.gateway.ts` (token grant → create → execute, token cached), 
  `sslcommerz.gateway.ts` (session create → validator API).
- Codes: `PAYMENT.METHOD_UNSUPPORTED`, `PAYMENT.NOT_CONFIGURED`, `PAYMENT.ALREADY_PAID`.
- Config: `payments` block; env keys `PAYMENT_CALLBACK_BASE_URL`, `BKASH_*`, `SSLCOMMERZ_*`.

### 3.15 Loyalty + Gift Vouchers — Phase 5 (`src/modules/loyalty/`)

Append-only points ledger (`LoyaltyTransaction`) mirrored onto `User.loyaltyPoints`
(+ recomputed `loyaltyTier`). Tiers: BRONZE <500, SILVER ≥500, GOLD ≥2000,
PLATINUM ≥5000; earn rate 1 point / ৳100. Gift vouchers are stored-value rows
(`GiftVoucher`) with lazy expiry checks; partial redemption decrements the balance
and flips to `REDEEMED` at zero.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/loyalty/me` | auth | Points summary + recent activity |
| GET | `/loyalty/me/history` | auth | Paginated points ledger |
| POST | `/loyalty/me/redeem` | auth | Redeem points |
| GET | `/loyalty/admin/users/:userId` | `loyalty:read` | Admin summary + activity |
| POST | `/loyalty/admin/users/:userId/adjust` | `loyalty:manage` | Grant/deduct points |
| POST | `/vouchers/validate` | Public | Preview balance + applicable amount |
| GET | `/vouchers/admin`, `/vouchers/admin/:id` | `voucher:read` | Admin list/detail |
| POST/PATCH/DELETE | `/vouchers[/:id]` | `voucher:manage` | Issue / update / cancel |

- Checkout: registered users earn points fire-and-forget; `CheckoutDto.voucherCode`
  applies the voucher to the post-coupon total and **folds it into `discountAmount`**
  so the reconciliation identity still holds. New order columns `voucherCode`,
  `voucherAmount`.
- Codes: `LOYALTY.INSUFFICIENT`, `LOYALTY.INVALID_POINTS`, `VOUCHER.NOT_FOUND`,
  `VOUCHER.EXPIRED`, `VOUCHER.ALREADY_REDEEMED`, `VOUCHER.CANCELLED`, `VOUCHER.CODE_TAKEN`.

### 3.16 Analytics / Reports — Phase 4 dashboards (`src/modules/analytics/`)

Read-only aggregation over orders/payments/products/customers. All money is integer ৳.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/analytics/summary` | `dashboard:super` | Revenue, orders, AOV, pending, customers |
| GET | `/analytics/sales` | `dashboard:super` | Revenue/orders series (day or month) |
| GET | `/analytics/top-products` | `marketing:view_analytics` | Best sellers |
| GET | `/analytics/customers` | `marketing:view_analytics` | Registered/guest/new-30d |
| GET | `/analytics/marketing` | `marketing:view_analytics` | Coupon uptake + discount rate |
| GET | `/analytics/payments` | `accounting:view_reports` | Volume by payment method |
| GET | `/analytics/accounting` | `accounting:view_reports` | Collected, COD, refunds, VAT, net |
| GET | `/analytics/inventory` | `inventory:read` | Low / out-of-stock variants |

### 3.17 AI Chatbot — Phase 5 (`src/modules/chatbot/`)

Three layers: keyword product retrieval (RAG-lite) → Groq completion → catalog-only
fallback. Guest-friendly via an opaque session token; every turn persisted
(`ChatSession`/`ChatMessage`) for support review. Disabled/failed Groq never errors —
it returns a catalog answer.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/chat/start` | Public | New session (guest or signed-in) |
| POST | `/chat/message` | Public | Send a message → reply + matched products |
| GET | `/chat/history/:sessionToken` | Public | Full transcript |

- `groq.client.ts` (OpenAI-compatible `/chat/completions`). Config: `ai.groq`
  block; env `GROQ_ENABLED`, `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`.

### 3.18 3PL Shipping — Phase 5 (`src/modules/shipping/`)

One active courier (`THREEPL_DEFAULT_COURIER`): **Pathao** (Aladdin) or **RedX**
OpenAPI. Creating a parcel stores `trackingNumber` + `courierName` on the order and
writes a status-history note; COD collection amount is derived from the order.

| Method | Path | Access | Purpose |
|---|---|---|---|
| POST | `/shipments/orders/:orderId` | `delivery:manage_3pl` | Create parcel |
| GET | `/shipments/orders/:orderId/track` | `delivery:manage_3pl` | Live tracking |
| POST | `/shipments/orders/:orderId/cancel` | `delivery:manage_3pl` | Cancel parcel |

- New helper `src/common/http/get-json.ts` (node:https GET, no global fetch).
- Config: `shipping3pl` block; env `THREEPL_DEFAULT_COURIER`, `PATHAO_*`, `REDX_*`.
- Codes: `SHIPMENT.ALREADY_SHIPPED`, `SHIPMENT.NOT_SHIPPED`, `SHIPMENT.NOT_CONFIGURED`,
  `SHIPMENT.UNKNOWN_COURIER`, `SHIPMENT.GATEWAY_ERROR`.

---

## 4. Permissions

Added in `src/common/permissions.ts`:

```ts
MEDIA_UPLOAD:    'media:upload',
MEDIA_MANAGE:    'media:manage',
CONTENT_MANAGE:  'content:manage',
LOYALTY_READ:    'loyalty:read',
LOYALTY_MANAGE:  'loyalty:manage',
VOUCHER_READ:    'voucher:read',
VOUCHER_MANAGE:  'voucher:manage',
```

Role seeding (`prisma/seed/roles.seed.ts`):

- **super-admin** → `*` (wildcard, `hasPermission` grants everything).
- **marketing** → granted `media:upload`, `media:manage`, `content:manage` in addition to prior set.
- **owner** → read-only surface (admin UI affordance).
- `assertKnownPermissions` in `RoleService` rejects any string not in `ALL_PERMISSIONS`
  (`ROLE.PERMISSION_UNKNOWN`) — guards cannot drift from the catalog.

---

## 5. Cache map (in-memory LRU, `CacheService`)

| Prefix / key | Written by | Invalidated by |
|---|---|---|
| `homepage:<pageKey>` | HomepageService.getStorefront (TTL 60s) | any section/item/media/reorder write |
| `footer:storefront` | FooterService.getStorefront (TTL 300s) | any footer write |
| `settings:storefront` | SettingsService.getPublic (TTL 300s) | upsertMany / remove |
| `facets:*`, `search:*` | Facets + search suggestions | every product write |
| `search:popular:*` | SearchService.popular (TTL 600s) | TTL only |

Swapping to Redis later = reimplement `CacheService` internals (interface already Redis-shaped).

---

## 6. Seeds (`prisma/seed.ts`)

Run order — all idempotent:

1. `roles.seed.ts` — system roles + permission grants (incl. new media/content perms).
2. `settings.seed.ts` — store settings (currency, VAT, etc.).
3. `categories.seed.ts` — Men/Women/Kids trees.
4. `products.seed.ts` — demo products, variants, media.
5. **`content.seed.ts` (new)** — footer columns (SHOP / ABOUT US / CUSTOMER SERVICE / HELP),
   contact strip (Hotline 16247, WhatsApp, Email, Address), social icons
   (facebook/instagram/youtube/tiktok — placeholder profile URLs to swap in admin),
   navbar (Men/Women/Kids from categories + highlighted **Sale** custom link).
   Each group seeds **only while its table is empty** → admin edits are never overwritten.
6. `admin.seed.ts` — owner/super-admin user (interactive password on first run).

---

## 7. Test suite

Config: `jest.config.js` (rootDir `src`, `testRegex *.spec.ts`), `tsconfig.spec.json`,
`jest-mock-extended` available. Convention: **service-level unit tests with hand-rolled mock
repositories / mock Prisma delegates** — no DB needed.

| Spec file | Covers | Tests |
|---|---|---|
| `common/utils/slug.spec.ts` | slugify edge cases | 5 |
| `common/utils/schedule.spec.ts` | `liveNow()` / `isLive()` windows | 6 |
| `common/permissions.spec.ts` | `hasPermission` (wildcard, menu prefix), catalog | 8 |
| `common/base/paginated-result.spec.ts` | `buildMeta` + `PaginatedResult` | 6 |
| `common/base/base.service.spec.ts` | hooks order, soft-delete, search/sort, cursor | 12 |
| `modules/auth/auth.service.spec.ts` | admin/customer/guest login, refresh rotation, `sv` revocation, `verifySession`, `getMe` | 18 |
| `modules/roles/role.service.spec.ts` | assign/unassign (+session bump), users, slug/permission hooks, system-role + in-use delete guards | 14 |
| `modules/categories/category.service.spec.ts` | slug rules, rename behavior, depth/cycle, delete guards, tree, storefront | 17 |
| `modules/products/product-filter.builder.spec.ts` | every `buildProductWhere` filter + sort map | 16 |
| `modules/products/products.service.spec.ts` | nested toPersistence, SKU guards, slug/SKU uniqueness, stock sync, admin/storefront scope, cursor mode | 17 |
| `modules/products/products-facets.service.spec.ts` | facet assembly, shared where, cache key stability | 5 |
| `modules/search/search.service.spec.ts` | suggestions (+cache), popular clamping, log fire-and-forget | 8 |
| `modules/media/media.service.spec.ts` | sha1 signature determinism (fake timers), config gate, destroy form + failure | 7 |
| `modules/settings/settings.service.spec.ts` | public map + cache, batch upsert validation, remove | 14 |
| `modules/cache/cache.service.spec.ts` | TTL, LRU eviction + touch, getOrSet, deletePrefix, stats | 13 |
| `modules/collections/collection.service.spec.ts` | live reads, AUTO resolution, setProducts modes, hooks | 16 |
| `modules/banners/banner.service.spec.ts` | findLive, defaults, media/window validation | 9 |
| `modules/navbar/navbar.service.spec.ts` | storefront URL resolution + hiding, reorder, link validation, tree guards | 19 |
| `modules/footer/footer.service.spec.ts` | storefront + cache invalidation, CRUD 404s, newsletter, subscribers paging | 16 |
| `modules/homepage/homepage.service.spec.ts` | storefront resolution per sourceType, cache per pageKey, section/item/media CRUD | 16 |
| `src/route-security.spec.ts` | every route `@Public()` vs `@RequirePermissions()`, no both, known-permission values, spot checks | 6 |
| `common/filters/global-exception.filter.spec.ts` | ErrorLog persistence per branch, redaction, insert-failure safety, DB-less mode | 8 |
| `modules/system-health/error-log.service.spec.ts` | filters, resolve audit fields, append-only guards | 4 |
| `modules/system-health/mismatch.service.spec.ts` | filters, resolve, reconciliation-only guards | 3 |
| `modules/system-health/system-health.service.spec.ts` | summary aggregation | 1 |
| `modules/system-health/reconciliation.service.spec.ts` | all 8 checks, tolerance, dedupe, report | 11 |
| `modules/cart/cart.service.spec.ts` | identity, totals/savings, merge, stock guards, merge-cap, cleanup | 19 |
| `modules/wishlist/wishlist.service.spec.ts` | snapshots, toggle, remove, move-to-cart | 7 |
| `modules/orders/order.service.spec.ts` | checkout math/snapshots/idempotency/stock guards, track authZ, transitions + restock, COD payment, coupon + notification hooks | 22 |
| `modules/discounts/discount.service.spec.ts` | scope/type resolution, category descendants, coupon limits/windows, redeem | 20 |
| `modules/reviews/review.service.spec.ts` | verified-purchase guard, duplicate guard, summary, moderation | 9 |
| `modules/notifications/mail.service.spec.ts` | config gate, provider POST, failure safety | 5 |
| `modules/notifications/notification.service.spec.ts` | template dispatch, channel fan-out, test send | 3 |
| `modules/users/user.service.spec.ts` | password-hash stripping, admin filters, contact uniqueness | 5 |
| `modules/users/address.service.spec.ts` | default handling, ownership scoping | 6 |
| `modules/payments/payment.service.spec.ts` | initiate guards, callback settle, idempotency, status | 9 |
| `modules/loyalty/loyalty.service.spec.ts` | tier thresholds, earn rate, insufficient redeem, ledger write | 6 |
| `modules/loyalty/voucher.service.spec.ts` | code format, duplicate/expiry guards, partial/full redemption | 8 |
| `modules/analytics/analytics.service.spec.ts` | KPIs, day/month bucketing, payment breakdown, marketing/accounting | 8 |
| `modules/chatbot/chat.service.spec.ts` | session reuse, Groq vs fallback, product retrieval, history | 5 |
| `modules/shipping/shipping.service.spec.ts` | parcel create, COD amount, already-shipped, track/cancel | 7 |
| **Total** | | **442 / 41 suites** |

Run: `npm test` or a slice — `npx jest src/modules/navbar`.

---

## 8. Known gaps / pending

1. **~~Full verification run~~ ✅ done 2026-10-03** — `npm test` (301/301), `npm run lint`
   (0 warnings), `npm run typecheck` (clean) all green in one pass.
2. **~~Route security contract spec~~ ✅ done** — `src/route-security.spec.ts` asserts every
   route is `@Public()` or `@RequirePermissions()`; only `AuthController.me` is exempt (deliberate,
   documented in the spec); all permission values validated against the catalog.
3. **`prisma/migrations/`** — none exist yet. First `prisma migrate dev` against a real DB
   (Docker on a beefier machine, or a local Postgres) will generate the baseline — now covering
   Phase 1 + 2 **plus** ErrorLog + DataMismatch.
4. **docker-compose** — deferred by request (weak local RAM). Needed before production deploy.
5. **Full-text search** — `product-filter.builder.ts` notes tsvector ranking arrives with the
   migration work (currently `relevance` falls back to `totalSold` desc).
6. **Frontends** — `Rangoli-admin/`, `Rangoli-frontend/` untouched, including the Phase 6
   System Health / Error Logs / Data Mismatches pages (NextAuth helper endpoint
   `POST /auth/verify` is ready for them).
7. **~~Phase 6 backend~~ ✅ built 2026-10-03** — remaining: admin pages, CSV export,
   optional CRITICAL alerts. Redis decision stands: **local skip, production Docker**.
8. **~~Phase 4 commerce~~ ✅ built 2026-10-17** — discounts/coupons, reviews, notifications,
   users, payments (bKash + SSLCommerz). Campaign/dashboard aggregates still pending.
9. **~~Phase 4 dashboards + Phase 5~~ ✅ built 2026-10-17** — analytics/reports
   (super/marketing/accounting/inventory), loyalty/rewards, gift vouchers (checkout
   integrated), AI chatbot (Groq + catalog fallback), 3PL (Pathao/RedX).
   Remaining in Phase 5: 360° product view (frontend/asset concern).
   **Multi-language dropped** from scope by request.
10. **Gateway/live creds** — bKash / SSLCommerz / SMS / mail adapters are built and unit-tested
    with mocked HTTP, but have not been exercised against live credentials.

---

## 9. Next-session checklist

```bash
cd rangoli-backend
npm test              # 1. full suite
npm run lint          # 2. must be 0 warnings
npm run typecheck     # 3. must be clean
# then: write route-security.spec.ts, fix anything above fails
# then: prisma migrate dev (when a DB is available) + npm run seed
```

- [x] Full `npm test` green (**301 tests / 26 suites**)
- [x] `npm run lint` → 0 warnings
- [x] `npm run typecheck` → clean
- [x] `route-security.spec.ts` written and passing (covers new System Health routes)
- [ ] Baseline migration generated against a real DB (now includes ErrorLog + DataMismatch)
- [ ] Seed verified end-to-end (footer/navbar content appears on storefront)
- [x] Update §1 snapshot + §8 when items close
- [x] **Phase 6 backend**: System Health per `PROJECT_MASTER_DOCUMENT.md` §18 built —
      filter persistence, module (errors/mismatches/summary/resolve/rerun), hourly cron (8 checks)
- [ ] **Phase 6 remaining**: admin pages (system-health / errors / mismatches), CSV export,
      optional CRITICAL alerts
- [x] **Phase 4 commerce**: discounts/coupons, reviews, notifications, users, payments
- [x] **Phase 4 dashboards**: analytics/reports (summary, sales, payments, inventory, customers, marketing, accounting)
- [x] **Phase 5**: loyalty/rewards, gift vouchers (checkout-integrated), AI chatbot (Groq), 3PL (Pathao/RedX)
- [ ] **Phase 5 remaining**: 360° product view (asset/frontend), live gateway credential smoke tests
- [ ] ~~Multi-language~~ — dropped by request (do not build)
- [ ] Run `npx prisma migrate dev` when a DB is available — schema now also has
      `LoyaltyTransaction`, `GiftVoucher` and `Order.voucherCode/voucherAmount`

---

## 10. Changelog

### 2026-10-17 (Phase 5 session)
- **Loyalty + Gift Vouchers** (`src/modules/loyalty/`): `LoyaltyTransaction` ledger +
  tier recompute, earn-on-order hook, redeem/adjust; `GiftVoucher` issue/preview/redeem;
  added `Order.voucherCode`/`voucherAmount` and checkout voucher integration (folded into
  `discountAmount` to keep reconciliation valid); new perms `loyalty:*`, `voucher:*`.
- **Analytics/Reports** (`src/modules/analytics/`): summary KPIs, day/month sales series,
  top products, payment breakdown, low stock, customer stats, marketing + accounting dashboards.
- **AI Chatbot** (`src/modules/chatbot/`): `GroqClient` + keyword product RAG + catalog
  fallback, persisted `ChatSession`/`ChatMessage`, public routes; `ai.groq` config.
- **3PL Shipping** (`src/modules/shipping/`): `ShipmentGateway` with **Pathao** + **RedX**
  adapters, create/track/cancel, `get-json` helper, `shipping3pl` config.
- 442 tests / 41 suites green; lint + typecheck clean.

### 2026-10-17 (Phase 4 session)
- **Discounts + Coupons** (`src/modules/discounts/`): validate/redeem engine with scopes
  (CART/PRODUCT/CATEGORY/COLLECTION), types (PERCENTAGE/FIXED_AMOUNT/FREE_SHIPPING/BUY_X_GET_Y),
  per-user coupon limits via `UserCoupon`, category-descendant resolution; public
  `POST /discounts/validate`; admin CRUD behind `marketing:manage_coupons`; checkout now accepts
  `couponCode` and stores discount/shipping/total + coupon fields.
- **Reviews + Ratings** (`src/modules/reviews/`): verified-purchase (`DELIVERED`) guard, duplicate
  guard, public approved-only list + summary/distribution, customer create/mine/delete, admin
  moderation behind `support:manage_reviews`.
- **Notifications** (`src/modules/notifications/`): provider-agnostic mail + SMS via `postJson`,
  templates, `GET /notifications/status` + `POST /notifications/test`; order checkout/status
  fire-and-forget hooks; `mail`/`sms` config + env keys.
- **Users** (`src/modules/users/`): customer profile + address book (default handling, ownership
  scoping) and admin list/detail/update/soft-delete; `passwordHash` stripped from all responses.
- **Payments** (`src/modules/payments/`): `PaymentGateway` interface with **bKash Tokenized
  Checkout** and **SSLCommerz** adapters, redirect checkout, server-to-server verification,
  idempotent settlement, guest-phone/owner access checks; `payments` config + env keys.
- Removed **multi-language** from the roadmap by request.
- 406 tests / 36 suites green; lint + typecheck clean.

### 2026-10-03 (Phase 6 session)
- Built Phase 2 modules: **media, collections, homepage, banners, navbar, footer, settings**;
  wired all into `src/app.module.ts`.
- Products: nested `variants[]`/`media[]` writes, `removeVariantIds`/`removeMediaIds`,
  server-side `discountPercent`, `totalStock` sync from variants.
- Fixed categories: public `storefront` routes + `CategoryService.findBySlug`.
- Added permissions `media:upload`, `media:manage`, `content:manage`; updated marketing role seed.
- Added `prisma/seed/content.seed.ts` (footer columns, contact strip, socials, navbar) and
  wired it into `prisma/seed.ts`.
- Wrote ≈268 unit tests across common layer + 17 feature specs (see §7).
- Helpers added earlier in Phase 2: `src/common/utils/schedule.ts` (`liveNow`),
  `src/common/http/post-form.ts` (fetch replacement), `cloudinary` config block.
- Phase 6 backend: `ErrorLog` + `DataMismatch` schema, exception-filter persistence with secret
  redaction, `SystemHealthModule` (6 routes), hourly reconciliation (8 checks + dedupe),
  3 menu permission keys, `@nestjs/schedule` wired; route-security contract spec; 301 tests green
  with lint + typecheck clean.
- Phase 3 started: **cart** (`GET /cart`, `POST/PATCH/DELETE /cart/items*`, `DELETE /cart`,
  `POST /cart/merge` — all public, token upgrades to user cart; merge is auth-only) with
  variant-price totals, savings, stock guards, guest→user merge capped at stock;
  **wishlist** (`GET /wishlist`, `POST /wishlist/toggle`, `DELETE /wishlist/:itemId`,
  `POST /wishlist/:itemId/move-to-cart` — auth-only, allow-listed in route-security contract);
  327 tests green with lint + typecheck clean.
- Phase 3 orders: **checkout** (`POST /orders/checkout`, public) with live stock revalidation,
  price/name/SKU snapshots, shipping-rate lookup, `ORD-YYYYMMDD-XXXXXX` numbers, idempotency-key
  replay, single-transaction stock decrement + payment row + history + cart clear; **tracking**
  (`GET /orders/track`, order number + guest phone or owner token); **customer** history/detail/
  cancel-while-early (`/orders/mine*`, auth-only); **admin** list/detail/status pipeline with
  transition map + restock-on-cancel, cancel (`order:cancel`), payment/COD-collect updates that keep
  reconciliation quiet; `shippingMethod` made optional in schema; 347 tests green.
