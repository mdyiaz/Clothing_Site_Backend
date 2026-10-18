# PROJECT MASTER DOCUMENT
## Rangoli — Clothing E-commerce Platform for Bangladesh

**Version:** 2.2
**Last Updated:** 2026-10-18
**Stack:** NestJS + Prisma + PostgreSQL + Next.js 16 (TypeScript) + custom JWT auth¹ + Cloudinary + Groq AI
**Market:** Bangladesh (COD-first, mobile-first, bKash/Nagad ready)
**Team:** 2 partners (50/50) — Software Engineer + Sourcing Partner
**Repos:** `Clothing_Site_Backend` · `Clothing_Site_Frontend` · `Clothing_Site_Admin` (owner: `mdyiaz`)

> ¹ **Auth deviation (v2.2):** the design originally specified **NextAuth v5**. It was replaced with a
> lightweight, dependency-free JWT client (access + refresh tokens) because NextAuth could not be
> verified end-to-end without a live database/OAuth provider. The backend still exposes
> `POST /auth/verify` (the NextAuth helper) so the decision is reversible. See §3.

---

## 📑 TABLE OF CONTENTS

1. Business Context
2. Repository & Folder Structure
3. Security Model (NextAuth + Hardening)
4. Backend Layering (SOLID)
5. Cross-Cutting Concerns
6. Database Schema (Prisma)
7. Admin Roles & Permissions (Pure RBAC)
8. Homepage Builder
9. Footer Structure (Bangladeshi)
10. Media & Cloudinary Integration
11. AI Chatbot (Free Tier)
12. Payments & Shipping
13. SEO Strategy
14. Tech Stack
15. Development Roadmap
16. Idea Log
17. Product Filter & Search API

---

## 0. BUILD STATUS SNAPSHOT (v2.2 — 2026-10-18)

### Legend
✅ done & verified · 🟡 in progress · ⏳ not started · ⛔ blocked by environment

### Repositories

| Repo | Local folder | Stack | Status |
|---|---|---|---|
| `Clothing_Site_Backend` | `rangoli-backend/` | NestJS + Prisma + PostgreSQL | ✅ 41 suites / 452 tests, lint + typecheck clean |
| `Clothing_Site_Frontend` | `Rangoli-frontend/` | Next.js 16 (Turbopack) | ✅ 18 routes build clean; storefront + account complete |
| `Clothing_Site_Admin` | `Rangoli-admin/` | Next.js 16 | ⏳ empty (0%) — next major effort |

### Backend — modules built
Auth (admin/customer/guest login, **register**, **forgot/reset password**, refresh, verify, me),
users (profile + addresses), categories, products (variants, media, facets, cursor paging), collections,
cart, wishlist, orders (checkout, track, cancel, status pipeline), payments (COD + bKash/SSLCommerz stubs),
discounts/coupons, loyalty (points + gift vouchers), reviews, homepage builder, banners, navbar, footer,
search (suggestions/popular/log), analytics, shipping 3PL (Pathao/RedX), chatbot (Groq), settings,
system-health (error logs + reconciliation), notifications (email/SMS templates).

### Frontend — surfaces built (Next.js 16, TS, Tailwind v4)
Homepage (CMS-driven, 13 sections), Shop/PLP with facets + sort + pagination, PDP (SEO JSON-LD),
Cart (guest session + drawer), Checkout (4-step: contact → shipping → delivery → payment; COD/bKash/SSLCommerz),
Order receipt + guest Track, Search overlay (⌘K) + `/search` results, Wishlist (device-local ↔ account-synced),
Account area (`/account` dashboard, orders + order detail, addresses CRUD, profile) and Auth
(`/login`, `/register`, `/forgot-password`, `/reset-password`). Design system: editorial/luxury,
theme tokens in `src/app/globals.css` `@theme`.

### Known environment constraints
- ⛔ **No PostgreSQL/Docker available** → Prisma cannot migrate; backend boots only with a DB, so the
  frontend runs on its bundled demo fallback (`src/data/demo-catalog.ts`) and device-local cart/wishlist.
- ⛔ Live gateway credentials (bKash, SSLCommerz, SMS, mail, Groq) untested.
- Auth flows use the custom JWT client (§3 note); NextAuth deferred.

### Remaining major work
- `Clothing_Site_Admin` (0% → largest effort): RBAC login, catalog CRUD, orders, homepage builder,
  media/Cloudinary, system-health dashboards.
- Real database + migrations, live payment/SMS/mail credentials, sitemap/robots, `<CloudImage/>`.

---

## 1. BUSINESS CONTEXT

### Partnership Model

- **50/50 partnership** between software engineer (technical) and uncle (sourcing)
- **Uncle's role:** Vendor sourcing, product procurement, supply chain
- **Engineer's role:** Website, admin panel, Facebook marketing, technical infrastructure
- **Legal:** Register with RJSC under Bangladesh Companies Act 1994
- **Products:** Men, Women, Kids clothing (Bangladeshi + imported)
- **Channels:** Facebook page (primary), Website (trust + scale)

### Target Market (Bangladesh)

- COD-dominant (~70% of orders)
- Mobile-first (~80% traffic)
- bKash/Nagad/Rocket mobile wallets essential
- Facebook is #1 discovery channel
- Hotline + WhatsApp preferred over email
- Size chart critical for reducing returns
- Trust signals: Trade License, BIN, COD badge, hotline

---

## 2. REPOSITORY & FOLDER STRUCTURE

```text
Rangoli/                               (local workspace)
├── PROJECT_MASTER_DOCUMENT.md      ← this file
├── rangoli-backend/                ← GitHub: Clothing_Site_Backend   (NestJS API, TypeScript)
├── Rangoli-admin/                  ← GitHub: Clothing_Site_Admin     (Next.js 16 admin, TypeScript)
└── Rangoli-frontend/               ← GitHub: Clothing_Site_Frontend  (Next.js 16 customer, TypeScript)
```

> Repo owner: `mdyiaz`. Each folder is an **independent git repository** (own `.git`, own `main` branch).
> The product/store brand shown in the UI is **Rangoli**; the repo names are deliberately brand-neutral.

### `rangoli-backend/` (NestJS)

- **Framework:** NestJS + TypeScript (strict mode)
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Cache:** Redis
- **Queue:** BullMQ (emails, notifications)
- **Storage:** Cloudinary (images + videos)
- **Auth:** NextAuth/JWT verification endpoint for admin + customer sessions
- **Structure:** Controller → Service → Repository → Prisma

```text
rangoli-backend/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── common/            # base classes, guards, filters, interceptors, dto
│   ├── config/            # env validation (joi/zod), typed config
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── departments/
│   │   ├── categories/
│   │   ├── products/
│   │   ├── collections/
│   │   ├── media/
│   │   ├── cart/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── discounts/
│   │   ├── homepage/
│   │   ├── banners/
│   │   ├── footer/
│   │   ├── reviews/
│   │   ├── chatbot/
│   │   └── settings/
│   ├── main.ts
│   └── app.module.ts
├── test/
├── package.json
└── tsconfig.json
```

### `Rangoli-admin/` (Next.js 16 — Admin, TypeScript)

- **Framework:** Next.js 16 (App Router) — **TypeScript only, no `.jsx`**
- **UI:** shadcn/ui + TanStack Table (Ant Design optional)
- **State:** React Query
- **Forms:** React Hook Form + Zod
- **Auth:** NextAuth (Credentials + Google) with department-based permissions
- **Drag-and-drop:** dnd-kit (homepage builder)

```text
Rangoli-admin/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/dashboard/
│   ├── (dashboard)/products/
│   ├── (dashboard)/orders/
│   ├── (dashboard)/departments/
│   ├── (dashboard)/homepage-builder/
│   ├── api/auth/[...nextauth]/route.ts
│   └── layout.tsx
├── src/
│   ├── components/
│   ├── hooks/
│   ├── lib/               # api client, permission helpers, zod schemas
│   ├── providers/
│   ├── stores/
│   └── types/
├── middleware.ts
├── next.config.ts
└── tsconfig.json
```

### `Rangoli-frontend/` (Next.js 16 — Customer, TypeScript)

- **Framework:** Next.js 16 (App Router) — **TypeScript only**
- **UI:** TailwindCSS + shadcn/ui
- **State:** React Query + Zustand
- **Forms:** React Hook Form + Zod
- **Rendering:** SSR for SEO, ISR for homepage
- **Pagination:** Cursor-based infinite scroll
- **Streaming:** Parallel `<Suspense>` per section
- **Auth:** NextAuth (Credentials + Google + guest checkout)

```text
Rangoli-frontend/
├── app/
│   ├── (auth)/login/
│   ├── (shop)/
│   │   ├── page.tsx
│   │   ├── category/[slug]/page.tsx
│   │   ├── product/[slug]/page.tsx
│   │   ├── cart/page.tsx
│   │   ├── checkout/page.tsx
│   │   └── account/
│   ├── api/auth/[...nextauth]/route.ts
│   ├── sitemap.ts
│   ├── sitemap-images.ts
│   ├── robots.ts
│   └── layout.tsx
├── src/
│   ├── components/        # media, sections, product, cart, ...
│   ├── lib/               # cloudinary url builder, api client, zod schemas
│   ├── hooks/
│   ├── providers/
│   ├── stores/
│   └── types/
├── middleware.ts
├── next.config.ts
└── tsconfig.json
```

#### Frontend Build Status (current) — ✅ Storefront + account complete

**Scaffold:** `create-next-app` → Next **16.4.2**, React **19.3**, TypeScript, Tailwind **v4**,
App Router, `src/` dir, `@/*` path alias. Package name `rangoli-frontend`.

> **Next.js 16 caveat:** `params`/`searchParams` are Promises — always `await` them. Run binaries
> directly (`node_modules/.bin/next build`, `tsc --noEmit`, `eslint src`). See `AGENTS.md`.

**Dependencies (kept deliberately light):**
- `next`, `react`, `react-dom`
- `embla-carousel-react` + `embla-carousel-autoplay` + `embla-carousel-fade` — homepage hero slider
- `motion` — scroll-reveal animations
- `lucide-react` — icons
- Not used: React Query / Zustand / shadcn / NextAuth (custom JWT client instead — see §3)

**Design system — editorial / luxury** (Ounass · SSENSE · Net-a-Porter direction): pure-white
canvas, hairline borders instead of shadows, near-zero corner radius, uppercase wide-tracked
micro-type for labels, serif display (Playfair Display) + sans (Inter); imagery carries the colour.
Tokens live in `src/app/globals.css` under `@theme`:

| Token | Hex | Use |
|---|---|---|
| `canvas` | `#ffffff` | page background |
| `surface` | `#f6f4f1` | media / image background |
| `surface-2` | `#efece7` | secondary surface |
| `ink` | `#16130f` | primary text |
| `ink-soft` | `#726b63` | muted text |
| `hairline` | `#e4e0da` | 1px borders |
| `brand-600` | `#8c1c46` | primary accent (deep rose) |
| `gold-500` | `#b8954a` | secondary accent |

> **Colour rule (always):** use theme tokens only (`text-ink`, `bg-surface`, `border-hairline`,
> `text-brand-600`, …). Never hardcode hex in components — add new values to the `@theme` block first.

**Routes built (18):** `/`, `/shop`, `/c/[slug]`, `/products/[slug]`, `/cart`, `/checkout`,
`/order/[orderNumber]`, `/track`, `/search`, `/wishlist`, `/login`, `/register`,
`/forgot-password`, `/reset-password`, `/account`, `/account/orders`, `/account/orders/[id]`,
`/account/addresses`, `/account/profile`.

**Feature surfaces:**
- **Homepage** — CMS-driven from `GET /homepage?pageKey=home`, bundled demo fallback; 13 section
  components + `HomepageRenderer`; ISR `revalidate = 60`; JSON-LD (`WebSite`, `Organization`, `ItemList`).
- **Catalog** — PLP with facets/sort/pagination, PDP with SEO + JSON-LD, cursor + offset paging.
- **Cart** — guest `sessionId` + localStorage fallback, slide-in drawer, cart button badge.
- **Checkout** — 4 steps (Contact → Shipping → Delivery → Payment); BD phone/email validation;
  shipping zone (8 divisions / 64 districts) + free-shipping threshold from `GET /settings`;
  coupon validate; COD / bKash / SSLCommerz; idempotent `POST /orders/checkout`; demo fallback
  (`simulateOrder`) when the API is offline.
- **Orders** — receipt page + guest `/track`; order status pipeline.
- **Search** — ⌘K/Ctrl-K overlay, debounced suggestions, recent (localStorage) + popular, fire-and-forget log.
- **Wishlist** — device-local store that **syncs to the account** on sign-in (heart on card + PDP).
- **Account** — dashboard, orders list + detail (timeline/cancel/reorder), addresses CRUD (+ set default),
  profile edit.
- **Auth** — `/login` (email or phone), `/register`, `/forgot-password`, `/reset-password`;
  tokens in `localStorage` (`rangoli.auth`) via `AuthProvider` with background `/auth/me` verify +
  refresh-token rotation.

**Auth architecture (deviation):** custom JWT client (`src/lib/{http,auth,account}.ts`,
`src/providers/auth-provider.tsx`) instead of NextAuth v5 — see §3.

**Still pending:** `sitemap.ts` / `robots.ts`, Cloudinary `<CloudImage/>`, admin handoff, live API E2E
(blocked — no DB).

---

## 3. SECURITY MODEL (Custom JWT + Hardening)

> **Status note (v2.2):** the original plan used **NextAuth v5** on both Next.js apps. The
> **storefront (`Clothing_Site_Frontend`) ships a dependency-free custom JWT client instead**
> (access + refresh tokens in `localStorage` under `rangoli.auth`, `AuthProvider` for state, backend
> `/auth/me` verification + refresh rotation). Reason: NextAuth could not be verified end-to-end
> without a live DB/OAuth provider, and it added weight the light stack avoids. The backend keeps
> `POST /auth/verify` (the NextAuth helper) so a future migration stays cheap. The **admin app**
> (`Clothing_Site_Admin`, not yet built) will decide separately.

### Authentication — backends-verified credentials (NextAuth v5 or custom JWT)

| App | Provider | Session | Purpose |
|---|---|---|---|
| `Rangoli-frontend` | Credentials (email/phone + password), Google | JWT (httpOnly cookie) | Customer login, wishlist, orders, reviews |
| `Rangoli-admin` | Credentials (email + password), Google | JWT (httpOnly cookie, `Secure`, `SameSite=Strict`) | Admin/department staff login |

**Rules:**

- Passwords hashed with **bcrypt (cost 12)** or **argon2id** in the backend — never stored/verified in the frontend.
- Frontend sends credentials to `rangoli-backend` → backend verifies → returns a signed session payload → NextAuth issues its own JWT.
- Admin session carries `userId`, `departments[]`, `roles[]`, `permissions[]`, `sessionVersion`.
- `sessionVersion` is bumped on password change / role change → backend rejects stale tokens immediately.
- JWT signing secret ≥ 32 random bytes, separate secrets per app.
- Refresh/rotation: sliding expiry for store (7 days), short-lived for admin (2 hours idle / 8 hours absolute).
- Role change, password change, or department removal revokes access on next request.

### Authorization (Admin) — Pure RBAC

- `PERMISSIONS` / `MENU_PERMISSIONS` / `ACTION_PERMISSIONS` constants in `rangoli-backend/src/common/permissions.ts`.
- Guards run in order: `ThrottlerGuard` → `JwtAuthGuard` → `PermissionsGuard`.
- `@RequirePermissions('order:update_status')` on each protected handler; `@Public()` opts a route out of both auth guards.
- **No departments.** One flat `permissions: string[]` on `Role` covers sidebar visibility (`menu.*`) and API access (`resource:action`); `hasPermission()` also lets a parent menu (`menu.delivery`) unlock its children (`menu.delivery.queue`).
- Super Admin holds the wildcard `"*"` and bypasses every check (`isSystem: true`).
- Role assignment / removal bumps `sessionVersion`, revoking issued JWTs on their next request.
- Session payload carries `permissions`, but `PermissionsGuard` re-reads `sessionVersion` from the DB on every request — a role change takes effect immediately.
- NextAuth `authorize()` + `jwt()` / `session()` callbacks in both apps.

### API Security Checklist

- [ ] HTTPS + HSTS everywhere; HTTP → 301 redirect
- [ ] Helmet security headers + strict CSP (`default-src 'self'`, no inline script)
- [ ] CORS allow-list with credentials (never `*`)
- [ ] Rate limiting (`@nestjs/throttler`) — global 100 req/min, auth endpoints 5/min
- [ ] Refresh-token rotation + reuse detection
- [ ] CSRF protection (SameSite cookies + double-submit token for cookie-auth forms)
- [ ] Input validation: `class-validator` on every DTO; Zod on every frontend form
- [ ] Global exception filter — never leak Prisma/stack traces to clients
- [ ] Prisma query logging only in dev; parameterized queries always
- [ ] Secrets in `.env` (git-ignored), validated at boot; `.env.example` committed
- [ ] Upload validation: MIME allow-list, size limits (10 MB image / 100 MB video), re-encode via Sharp
- [ ] Cloudinary signed uploads only — never expose admin API keys
- [ ] Payment gateway callbacks verified server-to-server + signature check + idempotency key
- [ ] Idempotency key on `POST /orders` and payment creation
- [ ] Audit log for sensitive actions (price change, order cancel, refund, permission change)
- [ ] Dependency audit in CI (`npm audit`, `pnpm audit`)
- [ ] Sentry with PII scrubbing
- [ ] Bot protection on checkout (honeypot + rate limit)
- [ ] `robots.txt` blocks `/admin`, `/api/internal`
- [ ] Next.js: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
- [ ] Email verification + phone OTP before first order placement
- [ ] Password policy: min 12 chars, breach-list check (HaveIBeenPwned k-anonymity)
- [ ] Session invalidation on logout everywhere (backend deny-list / sessionVersion)
- [ ] Database least-privilege user (no `DROP`/`ALTER` from app account)
- [ ] Daily encrypted DB backups (off-site)

### Security Headers (middleware.ts, both Next apps)

```ts
// middleware.ts
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; img-src 'self' https://res.cloudinary.com data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.rangoli.com" },
];
```

---

## 4. BACKEND LAYERING (SOLID, TESTABLE)

```text
HTTP Request
    ↓
Controller   ← Validates DTO, returns response. NO business logic.
    ↓
Service      ← Business logic, orchestration, transactions.
    ↓
Repository   ← Data access via Prisma. NO business rules.
    ↓
Prisma Client
    ↓
PostgreSQL
```

### Generic Base Classes (Reusable CRUD)

**`BaseRepository<T>`** — generic Prisma wrapper

- `findById`, `findOne`, `findAll`, `findAndCount`
- `create`, `update`, `delete`, `softDelete`
- `count`, `exists`

**`BaseService<T>`** — CRUD + lifecycle hooks

- Hooks: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`
- `transform(entity)` for output shaping
- `buildWhere(query)` and `buildOrderBy(query)` overridable
- `findAll(query)` — ALWAYS paginated
- `findAllCursor(query)` — cursor-based for infinite scroll

**`BaseController<T>`** — auto REST routes

- `POST /` → create
- `GET /` → paginated list
- `GET /cursor` → cursor list
- `GET /:id` → single
- `PATCH /:id` → update
- `DELETE /:id` → soft delete

**`PaginateHelper`** — for custom list methods (forces pagination)

---

## 5. CROSS-CUTTING CONCERNS

### Correlation ID (End-to-End Tracing)

- Middleware generates `x-correlation-id` (UUID) per request
- Stored in `AsyncLocalStorage`
- Auto-injected into every Prisma query log
- Stored on `OrderStatusHistory` and `Payment` tables
- Passed to payment gateways as reference
- Returned in every API response

### Standard API Response Shape

```json
{
  "success": true,
  "correlationId": "uuid",
  "data": { },
  "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0, "hasNext": false, "hasPrev": false, "from": 0, "to": 0 },
  "timestamp": "ISO8601"
}
```

### Error Contract (User-Friendly)

```json
{
  "success": false,
  "correlationId": "uuid",
  "error": {
    "code": "AUTH.EMAIL_INVALID",
    "message": "Enter a valid email address.",
    "ui": { "field": "email", "action": "focus" }
  },
  "timestamp": "ISO8601"
}
```

### Pagination (Always)

- Offset for admin: `?page=1&limit=20` (cap 100)
- Cursor for customer: `?cursor=uuid&limit=20` (cap 50)
- `meta` always included

### VAT — Optional (Beginner Mode)

- Global setting `vat.enabled = false` by default
- Product-level override: `isVatInclusive`, `vatPercentage`, `isVatExempt`
- Enable when registered with NBR

### DTOs

- `PaginationDto` — shared base
- `PartialType` from `@nestjs/mapped-types` for updates
- `class-validator` + `class-transformer`

---

## 6. DATABASE SCHEMA (Prisma)

### 6.1 Users, Auth

```prisma
model User {
  id            String    @id @default(uuid())
  email         String?   @unique
  phone         String?   @unique
  passwordHash  String?
  fullName      String?
  avatarUrl     String?
  isGuest       Boolean   @default(false)
  googleId      String?   @unique
  facebookId    String?   @unique
  emailVerified Boolean   @default(false)
  phoneVerified Boolean   @default(false)
  loyaltyPoints Int       @default(0)
  loyaltyTier   LoyaltyTier @default(BRONZE)
  sessionVersion Int      @default(0)

  addresses     Address[]
  orders        Order[]
  carts         Cart[]
  wishlists     WishlistItem[]
  reviews       Review[]
  userCoupons   UserCoupon[]
  departments   UserDepartment[]
  chatSessions  ChatSession[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  @@index([phone])
  @@index([email])
}

enum LoyaltyTier { BRONZE SILVER GOLD PLATINUM }

model Address {
  id          String   @id @default(uuid())
  userId      String
  label       String?
  fullName    String
  phone       String
  division    String
  district    String
  upazila     String?
  area        String?
  addressLine String
  postalCode  String?
  isDefault   Boolean  @default(false)
  type        AddressType @default(SHIPPING)
  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([userId])
  @@index([division, district])
}

enum AddressType { SHIPPING BILLING BOTH }
```

### 6.2 Roles & Permissions (Pure RBAC — Admin)

No `Department` model, no `UserDepartment` join: a user simply holds roles, and a role holds one flat permission list.

```prisma
model Role {
  id          String  @id @default(uuid())
  name        String  @unique
  slug        String  @unique
  description String?

  // Super Admin = system role, permissions ["*"]
  isSystem Boolean @default(false)

  // JSON array: menu permissions + action permissions
  // ["menu.dashboard", "menu.delivery", "delivery:mark_shipped"]
  permissions Json @default("[]")

  // UI
  color     String?
  icon      String?
  level     Int     @default(1) // hierarchy for the admin UI only
  sortOrder Int     @default(0)
  isActive  Boolean @default(true)

  users UserRole[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([slug])
  @@index([isActive])
  @@map("roles")
}

model UserRole {
  id     String @id @default(uuid())
  userId String
  roleId String

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  assignedAt DateTime @default(now())
  assignedBy String?

  @@unique([userId, roleId])
  @@index([userId])
  @@index([roleId])
  @@map("user_roles")
}
```

**Roles seeded (`prisma/seed/roles.seed.ts`):**

| # | Role | Slug | Level | Color | Notes |
|---|---|---|---|---|---|
| 1 | Super Admin | `super-admin` | 99 | `#DC2626` | `isSystem: true`, `permissions: ["*"]` |
| 2 | Owner | `owner` | 90 | `#6B7280` | full catalogue + reports |
| 3 | Delivery Department | `delivery-department` | 50 | `#3B82F6` | queue, packing, COD |
| 4 | Customer Care | `customer-care` | 50 | `#EF4444` | tickets, returns, reviews |
| 5 | Marketing Department | `marketing-department` | 50 | `#8B5CF6` | banners, coupons, campaigns |
| 6 | Accounting Department | `accounting-department` | 50 | `#10B981` | invoices, VAT, COD reconciliation |
| 7 | Inventory Manager | `inventory-manager` | 40 | `#F59E0B` | stock, procurement |

Permission format: `resource:action` for API calls (`order:update_status`) and `menu.path` for sidebar entries (`menu.catalog.products`).
Super Admin bypasses both families via `"*"`.

**Endpoints:** `GET/POST/PATCH/DELETE /roles`, `GET /roles/permissions` (checkbox-tree catalog),
`POST /roles/assign`, `POST /roles/unassign`, `GET /roles/:id/users` — all behind `@RequirePermissions(PERMISSIONS.ROLE_*)`.

### 6.3 Categories (Dynamic Tree + Gender)

```prisma
model Category {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  description String?
  imageUrl    String?
  parentId    String?
  parent      Category? @relation("CategoryTree", fields: [parentId], references: [id])
  children    Category[] @relation("CategoryTree")
  gender      Gender?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  products    ProductCategory[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?
  @@index([parentId])
  @@index([slug])
  @@index([gender])
}

enum Gender { MEN WOMEN TEEN KIDS NEW_BORN UNISEX }
```

**Rule:** Admin UI limited to 3 levels. Frontend shows 2 levels. Product belongs to deepest category.

### 6.4 Products, Variants, Media (SEO-Ready)

```prisma
model Product {
  id               String   @id @default(uuid())
  sku              String   @unique
  name             String
  slug             String   @unique
  description      String?  @db.Text
  shortDescription String?

  basePrice        Int
  compareAtPrice   Int?
  costPrice        Int?

  isVatInclusive   Boolean?
  vatPercentage    Decimal? @db.Decimal(5, 2)
  isVatExempt      Boolean  @default(false)

  brand            String?
  material         String?
  careInstructions String?
  sizeChartUrl     String?

  primaryImageUrl  String?
  primaryVideoUrl  String?
  ogImageId        String?

  isActive         Boolean  @default(true)
  isFeatured       Boolean  @default(false)
  totalSold        Int      @default(0)
  totalStock       Int      @default(0)

  categories       ProductCategory[]
  variants         ProductVariant[]
  media            ProductMedia[]
  collections      CollectionProduct[]
  reviews          Review[]
  orderItems       OrderItem[]
  cartItems        CartItem[]
  wishlistItems    WishlistItem[]
  tags             ProductTag[]
  homepageItems    HomepageSectionItem[]

  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?
  @@index([slug])
  @@index([sku])
  @@index([brand])
  @@index([isActive])
  @@index([isFeatured])
}

model ProductVariant {
  id              String   @id @default(uuid())
  productId       String
  sku             String   @unique
  size            String?
  color           String?
  colorHex        String?
  material        String?
  price           Int?
  compareAtPrice  Int?
  stock           Int      @default(0)
  lowStockAlert   Int      @default(5)
  weightGrams     Int?
  primaryImageUrl String?
  media           ProductMedia[]
  product         Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  orderItems      OrderItem[]
  cartItems       CartItem[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([productId])
  @@index([sku])
  @@index([stock])
}

model ProductMedia {
  id              String   @id @default(uuid())
  productId       String
  variantId       String?

  type            MediaType @default(IMAGE)

  // Cloudinary
  publicId        String
  format          String?
  resourceType    String   @default("image")
  version         Int?
  bytes           Int?
  width           Int?
  height          Int?
  duration        Float?
  blurDataUrl     String?  @db.Text
  url             String?
  thumbnailUrl    String?

  // SEO Metadata
  altText         String?
  title           String?
  caption         String?  @db.Text
  description     String?  @db.Text
  keywords        String?
  seoFilename     String?
  geoLocation     String?
  credit          String?

  // Display
  sortOrder       Int      @default(0)
  isPrimary       Boolean  @default(false)
  isActive        Boolean  @default(true)

  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant         ProductVariant? @relation(fields: [variantId], references: [id], onDelete: Cascade)

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([productId, variantId])
  @@index([productId, sortOrder])
  @@index([variantId, isPrimary])
}

enum MediaType { IMAGE VIDEO MODEL_3D }

model ProductCategory {
  productId  String
  categoryId String
  product    Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  category   Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  @@id([productId, categoryId])
}

model ProductTag {
  id        String @id @default(uuid())
  productId String
  tag       String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@index([tag])
  @@unique([productId, tag])
}
```

### 6.5 Collections (Festival/Seasonal/Promo)

```prisma
model Collection {
  id          String   @id @default(uuid())
  name        String
  slug        String   @unique
  description String?
  bannerUrl   String?
  thumbnail   String?
  type        CollectionType @default(MANUAL)
  startsAt    DateTime?
  endsAt      DateTime?
  sortOrder   Int      @default(0)
  isActive    Boolean  @default(true)
  products    CollectionProduct[]
  navbarItems NavbarItem[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([slug])
  @@index([startsAt, endsAt])
}

enum CollectionType { MANUAL AUTO_SALE AUTO_NEW AUTO_TRENDING }

model CollectionProduct {
  collectionId String
  productId    String
  sortOrder    Int    @default(0)
  collection   Collection @relation(fields: [collectionId], references: [id], onDelete: Cascade)
  product      Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@id([collectionId, productId])
  @@index([collectionId, sortOrder])
}
```

### 6.6 Discounts & Coupons

```prisma
model Discount {
  id                String   @id @default(uuid())
  name              String
  description       String?
  scope             DiscountScope
  productId         String?
  categoryId        String?
  collectionId      String?
  type              DiscountType
  value             Int
  minPurchaseAmount Int?
  minQuantity       Int?
  maxDiscountAmount Int?
  startsAt          DateTime?
  endsAt            DateTime?
  isActive          Boolean  @default(true)
  totalUsageLimit   Int?
  perUserLimit      Int?
  currentUsage      Int      @default(0)
  coupons           Coupon[]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@index([scope, isActive])
  @@index([startsAt, endsAt])
}

enum DiscountScope { PRODUCT CATEGORY COLLECTION CART }
enum DiscountType { PERCENTAGE FIXED_AMOUNT FREE_SHIPPING BUY_X_GET_Y }

model Coupon {
  id          String   @id @default(uuid())
  code        String   @unique
  discountId  String
  discount    Discount @relation(fields: [discountId], references: [id], onDelete: Cascade)
  usageCount  Int      @default(0)
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  userCoupons UserCoupon[]
  @@index([code])
}

model UserCoupon {
  id        String @id @default(uuid())
  userId    String
  couponId  String
  usedCount Int    @default(0)
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)
  coupon    Coupon @relation(fields: [couponId], references: [id], onDelete: Cascade)
  @@unique([userId, couponId])
}
```

### 6.7 Cart & Wishlist

```prisma
model Cart {
  id        String   @id @default(uuid())
  userId    String?
  sessionId String?
  user      User? @relation(fields: [userId], references: [id], onDelete: Cascade)
  items     CartItem[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([userId])
  @@index([sessionId])
}

model CartItem {
  id        String @id @default(uuid())
  cartId    String
  productId String
  variantId String?
  quantity  Int
  cart      Cart @relation(fields: [cartId], references: [id], onDelete: Cascade)
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  variant   ProductVariant? @relation(fields: [variantId], references: [id])
  @@unique([cartId, productId, variantId])
}

model WishlistItem {
  id        String @id @default(uuid())
  userId    String
  productId String
  variantId String?
  user      User @relation(fields: [userId], references: [id], onDelete: Cascade)
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@unique([userId, productId, variantId])
}
```

### 6.8 Orders, Payments, Shipping

```prisma
model Order {
  id              String   @id @default(uuid())
  orderNumber     String   @unique
  userId          String?
  user            User? @relation(fields: [userId], references: [id])
  guestEmail      String?
  guestPhone      String?
  guestName       String?
  shippingAddress Json
  billingAddress  Json?
  shippingMethod  String
  shippingZone    ShippingZone
  shippingCost    Int
  subtotal        Int
  vatAmount       Int      @default(0)
  discountAmount  Int      @default(0)
  shippingAmount  Int
  totalAmount     Int
  couponCode      String?
  couponDiscount  Int?
  status          OrderStatus @default(PENDING)
  paymentStatus   PaymentStatus @default(UNPAID)
  paymentMethod   PaymentMethod?
  trackingNumber  String?
  courierName     String?
  customerNote    String?
  adminNote       String?
  idempotencyKey  String?  @unique
  items           OrderItem[]
  payments        Payment[]
  statusHistory   OrderStatusHistory[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([orderNumber])
  @@index([userId])
  @@index([status])
  @@index([paymentStatus])
  @@index([createdAt])
}

enum OrderStatus {
  PENDING CONFIRMED PROCESSING PACKED SHIPPED
  OUT_FOR_DELIVERY DELIVERED CANCELLED
  RETURN_REQUESTED RETURNED REFUNDED
}

enum PaymentStatus {
  UNPAID PENDING PAID PARTIALLY_REFUNDED REFUNDED FAILED CANCELLED
}

enum PaymentMethod {
  COD BKASH NAGAD ROCKET SSLCOMMERZ CARD
}

enum ShippingZone {
  INSIDE_DHAKA OUTSIDE_DHAKA INTERNATIONAL
}

model OrderItem {
  id          String @id @default(uuid())
  orderId     String
  productId   String
  variantId   String?
  order       Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product     Product @relation(fields: [productId], references: [id])
  variant     ProductVariant? @relation(fields: [variantId], references: [id])
  productName String
  variantInfo String?
  sku         String
  price       Int
  quantity    Int
  total       Int
  @@index([orderId])
}

model OrderStatusHistory {
  id            String @id @default(uuid())
  orderId       String
  status        OrderStatus
  note          String?
  createdBy     String?
  correlationId String?
  order         Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  createdAt     DateTime @default(now())
  @@index([orderId])
  @@index([correlationId])
}

model Payment {
  id              String   @id @default(uuid())
  orderId         String
  order           Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
  method          PaymentMethod
  amount          Int
  status          PaymentStatus
  gatewayName     String?
  gatewayTxnId    String?
  gatewayResponse Json?
  codCollected    Boolean  @default(false)
  codCollectedAt  DateTime?
  correlationId   String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([orderId])
  @@index([gatewayTxnId])
  @@index([correlationId])
}

model ShippingRate {
  id                    String   @id @default(uuid())
  name                  String
  zone                  ShippingZone
  minWeightGrams        Int      @default(0)
  maxWeightGrams        Int?
  cost                  Int
  freeShippingThreshold Int?
  estimatedDays         String?
  isActive              Boolean  @default(true)
  createdAt             DateTime @default(now())
}
```

### 6.9 Reviews

```prisma
model Review {
  id         String @id @default(uuid())
  productId  String
  userId     String
  orderId    String?
  rating     Int
  title      String?
  comment    String?  @db.Text
  images     Json?
  isApproved Boolean  @default(false)
  isVerified Boolean  @default(false)
  product    Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  user       User @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([productId, isApproved])
  @@index([userId])
}
```

### 6.10 Homepage Builder, Banners, Navbar

```prisma
model HomepageSection {
  id           String   @id @default(uuid())
  pageKey      String   @default("home")
  title        String?
  subtitle     String?
  sectionType  HomepageSectionType
  columns      Int?
  bgColor      String?
  textColor    String?
  paddingY     String?
  sourceType   SectionSourceType
  collectionId String?
  gender       Gender?
  sortOrder    Int      @default(0)
  isActive     Boolean  @default(true)
  startsAt     DateTime?
  endsAt       DateTime?
  items        HomepageSectionItem[]
  media        HomepageSectionMedia[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([pageKey, sortOrder, isActive])
}

enum HomepageSectionType {
  HERO_BANNER
  EDITORIAL_BANNER
  POSTER_TRIO
  POSTER_GRID
  PRODUCT_CAROUSEL
  PRODUCT_GRID
  EDITORIAL_DUO
  CATEGORY_GRID
  VIDEO_BANNER
  PROMO_DUO
  FEATURE_STRIP
  NEWSLETTER_BLOCK
  CUSTOM_HTML
}

enum SectionSourceType {
  MANUAL
  COLLECTION
  AUTO_TOP_SELLING
  AUTO_NEW_ARRIVALS
  AUTO_DISCOUNTED
}

model HomepageSectionItem {
  id        String @id @default(uuid())
  sectionId String
  productId String?
  sortOrder Int    @default(0)
  section   HomepageSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  product   Product? @relation(fields: [productId], references: [id])
  @@index([sectionId, sortOrder])
}

model HomepageSectionMedia {
  id             String @id @default(uuid())
  sectionId      String
  section        HomepageSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  mediaType      BannerMediaType @default(IMAGE)
  imageUrl       String?
  videoUrl       String?
  mobileImageUrl String?
  videoPoster    String?
  videoDuration  Int?
  title          String?
  subtitle       String?
  description    String?  @db.Text
  ctaText        String?
  ctaUrl         String?
  position       Int      @default(0)
  width          String?
  sortOrder      Int      @default(0)
  isActive       Boolean  @default(true)
  @@index([sectionId, sortOrder])
}

enum BannerMediaType { IMAGE VIDEO }

model Banner {
  id             String   @id @default(uuid())
  title          String?
  subtitle       String?
  mediaType      BannerMediaType @default(IMAGE)
  imageUrl       String?
  videoUrl       String?
  mobileImageUrl String?
  mobileVideoUrl String?
  videoThumbnail String?
  videoDuration  Int?
  linkUrl        String?
  linkTarget     String?  @default("_self")
  ctaText        String?
  position       BannerPosition
  startsAt       DateTime?
  endsAt         DateTime?
  isActive       Boolean  @default(true)
  sortOrder      Int      @default(0)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  @@index([position, isActive])
  @@index([startsAt, endsAt])
}

enum BannerPosition {
  HOMEPAGE_HERO
  HOMEPAGE_MIDDLE
  CATEGORY_PAGE
  PRODUCT_PAGE
  CHECKOUT
}

model NavbarItem {
  id           String   @id @default(uuid())
  label        String
  linkType     NavbarLinkType
  categoryId   String?
  collectionId String?
  customUrl    String?
  highlight    Boolean  @default(false)
  sortOrder    Int      @default(0)
  isActive     Boolean  @default(true)
  collection   Collection? @relation(fields: [collectionId], references: [id])
  parentId     String?
  parent       NavbarItem? @relation("NavbarTree", fields: [parentId], references: [id])
  children     NavbarItem[] @relation("NavbarTree")
  createdAt    DateTime @default(now())
  @@index([sortOrder])
}

enum NavbarLinkType { CATEGORY COLLECTION CUSTOM_URL PAGE }
```

### 6.11 Footer

```prisma
model FooterColumn {
  id        String   @id @default(uuid())
  title     String
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  links     FooterLink[]
  createdAt DateTime @default(now())
  @@index([sortOrder, isActive])
}

model FooterLink {
  id        String   @id @default(uuid())
  columnId  String
  label     String
  url       String
  target    String   @default("_self")
  icon      String?
  sortOrder Int      @default(0)
  isActive  Boolean  @default(true)
  column    FooterColumn @relation(fields: [columnId], references: [id], onDelete: Cascade)
  @@index([columnId, sortOrder])
}

model StoreContactInfo {
  id        String   @id @default(uuid())
  type      ContactType
  label     String?
  value     String
  linkUrl   String?
  isActive  Boolean  @default(true)
  sortOrder Int      @default(0)
  updatedAt DateTime @updatedAt
}

enum ContactType {
  HOTLINE WHATSAPP EMAIL ADDRESS TRADE_LICENSE BIN TIN
}

model SocialLink {
  id        String   @id @default(uuid())
  platform  String
  url       String
  isActive  Boolean  @default(true)
  sortOrder Int      @default(0)
}

model NewsletterSubscriber {
  id         String   @id @default(uuid())
  email      String?  @unique
  phone      String?  @unique
  source     String?
  isVerified Boolean  @default(false)
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())
  @@index([email])
  @@index([phone])
}
```

### 6.12 Store Settings

```prisma
model StoreSetting {
  id        String   @id @default(uuid())
  key       String   @unique
  value     Json
  updatedAt DateTime @updatedAt
}
```

Seed defaults:

- `vat.enabled` = false
- `vat.defaultPercentage` = 15
- `vat.showOnProductPage` = false
- `vat.showOnInvoice` = true
- `store.currency` = "BDT"
- `store.freeShippingThreshold` = 8000
- `store.shippingInsideDhaka` = 60
- `store.shippingOutsideDhaka` = 100
- `store.codEnabled` = true
- `store.guestCheckoutEnabled` = true
- `store.chatbotEnabled` = true
- `store.chatbotWelcomeMessage` = "Hi! How can I help you today?"

### 6.13 AI Chatbot

```prisma
model ChatSession {
  id           String   @id @default(uuid())
  userId       String?
  sessionToken String   @unique
  user         User? @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages     ChatMessage[]
  context      Json?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@index([userId])
  @@index([sessionToken])
}

model ChatMessage {
  id          String @id @default(uuid())
  sessionId   String
  role        ChatRole
  content     String @db.Text
  provider    String?
  model       String?
  tokensUsed  Int?
  latencyMs   Int?
  session     ChatSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())
  @@index([sessionId])
}

enum ChatRole { USER ASSISTANT SYSTEM }

model ProductEmbedding {
  id         String @id @default(uuid())
  productId  String @unique
  content    String @db.Text
  embedding  Unsupported("vector(1536)")?
  updatedAt  DateTime @updatedAt
}
```

---

## 7. ADMIN ROLES & PERMISSIONS (PURE RBAC)

> There is **no Department table**. A user holds roles (`user_roles`), a role holds one flat `permissions: string[]`,
> and that single array drives both the admin sidebar (`menu.*`) and API access (`resource:action`).

### Roles to Seed

| Role | Slug | Level | Color | Purpose |
|---|---|---|---|---|
| Super Admin | `super-admin` | 99 | `#DC2626` | system role (`isSystem`), wildcard `*` |
| Owner | `owner` | 90 | `#6B7280` | owners (you + uncle) |
| Delivery Department | `delivery-department` | 50 | `#3B82F6` | order confirmation, packing, shipping, COD |
| Customer Care | `customer-care` | 50 | `#EF4444` | chat, phone, returns, reviews |
| Marketing Department | `marketing-department` | 50 | `#8B5CF6` | banners, collections, coupons, campaigns |
| Accounting Department | `accounting-department` | 50 | `#10B981` | invoices, VAT, P&L, COD reconciliation |
| Inventory Manager | `inventory-manager` | 40 | `#F59E0B` | stock, procurement |

**Total roles at launch: 7** — seeded idempotently by `prisma/seed/roles.seed.ts`.

### How a Permission Check Works

```ts
@Post('orders/:id/status')
@RequirePermissions(PERMISSIONS.ORDER_UPDATE_STATUS)
```

1. `JwtAuthGuard` validates the bearer token and puts `{ userId, permissions, roles, sessionVersion }` on the request.
2. `PermissionsGuard` re-reads `sessionVersion` from the DB — a role change, assignment or logout bumps it, so old tokens die on the next request.
3. `hasPermission(granted, required)`:
   - `"*"` (Super Admin) → always allow;
   - exact match (`order:update_status`) → allow;
   - parent menu unlock (`menu.delivery` satisfies `menu.delivery.queue`) → allow;
   - otherwise `403 AUTH.MISSING_PERMISSION`.

### Permission Constants

Two families, one flat array (`rangoli-backend/src/common/permissions.ts`):

```ts
// Sidebar visibility — `MENU_PERMISSIONS`
'menu.dashboard',
'menu.orders',
'menu.catalog' | 'menu.catalog.products' | 'menu.catalog.categories' | …,
'menu.delivery' | 'menu.delivery.queue' | 'menu.delivery.cod' | …,
'menu.marketing' | 'menu.accounting' | 'menu.support' | …,
'menu.customers', 'menu.reports',
'menu.settings' | 'menu.settings.roles' | 'menu.settings.users' | 'menu.settings.store',
```

```ts
export const ACTION_PERMISSIONS = {
  // Products
  PRODUCT_READ: 'product:read',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',

  // Categories
  CATEGORY_READ: 'category:read',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',

  // Orders
  ORDER_READ: 'order:read',
  ORDER_UPDATE_STATUS: 'order:update_status',
  ORDER_CANCEL: 'order:cancel',
  ORDER_REFUND: 'order:refund',
  ORDER_ASSIGN_DELIVERY: 'order:assign_delivery',

  // Delivery
  DELIVERY_VIEW_QUEUE: 'delivery:view_queue',
  DELIVERY_MARK_PACKED: 'delivery:mark_packed',
  DELIVERY_MARK_SHIPPED: 'delivery:mark_shipped',
  DELIVERY_MARK_DELIVERED: 'delivery:mark_delivered',
  DELIVERY_COLLECT_COD: 'delivery:collect_cod',
  DELIVERY_MANAGE_3PL: 'delivery:manage_3pl',

  // Support
  SUPPORT_VIEW_TICKETS: 'support:view_tickets',
  SUPPORT_REPLY: 'support:reply',
  SUPPORT_MANAGE_RETURNS: 'support:manage_returns',
  SUPPORT_MANAGE_REVIEWS: 'support:manage_reviews',

  // Marketing
  MARKETING_VIEW_ANALYTICS: 'marketing:view_analytics',
  MARKETING_MANAGE_BANNERS: 'marketing:manage_banners',
  MARKETING_MANAGE_COLLECTIONS: 'marketing:manage_collections',
  MARKETING_MANAGE_COUPONS: 'marketing:manage_coupons',
  MARKETING_MANAGE_HOMEPAGE: 'marketing:manage_homepage',
  MARKETING_MANAGE_CAMPAIGNS: 'marketing:manage_campaigns',

  // Accounting
  ACCOUNTING_VIEW_REPORTS: 'accounting:view_reports',
  ACCOUNTING_MANAGE_INVOICES: 'accounting:manage_invoices',
  ACCOUNTING_MANAGE_EXPENSES: 'accounting:manage_expenses',
  ACCOUNTING_RECONCILE_COD: 'accounting:reconcile_cod',
  ACCOUNTING_MANAGE_VENDORS: 'accounting:manage_vendors',
  ACCOUNTING_VIEW_PROFIT: 'accounting:view_profit',

  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_UPDATE: 'inventory:update',
  INVENTORY_PROCURE: 'inventory:procure',

  // Users & roles
  USER_READ: 'user:read',
  USER_MANAGE: 'user:manage',
  ROLE_READ: 'role:read',
  ROLE_MANAGE: 'role:manage',

  // Settings
  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',

  // Dashboards
  DASHBOARD_SUPER: 'dashboard:super',
  DASHBOARD_DELIVERY: 'dashboard:delivery',
  DASHBOARD_MARKETING: 'dashboard:marketing',
  DASHBOARD_ACCOUNTING: 'dashboard:accounting',
} as const;

export const PERMISSIONS = ACTION_PERMISSIONS; // `PERMISSIONS.X` reads better at call sites
```

---

## 8. HOMEPAGE BUILDER

### Section Types (13)

| Type | Purpose |
|---|---|
| `HERO_BANNER` | Full-width campaign hero (image or video) |
| `FEATURE_STRIP` | Trust badges strip (icons + text) |
| `EDITORIAL_BANNER` | Story feature with overlay |
| `POSTER_TRIO` | 3 category tiles side by side |
| `PRODUCT_CAROUSEL` | Horizontal product scroll |
| `EDITORIAL_DUO` | 2 editorial images side by side |
| `CATEGORY_GRID` | Category tiles grid |
| `VIDEO_BANNER` | Video with overlay text |
| `PROMO_DUO` | 2 promo cards |
| `NEWSLETTER_BLOCK` | Newsletter signup |
| `PRODUCT_GRID` | Static product grid |
| `POSTER_GRID` | Poster grid |
| `CUSTOM_HTML` | Escape hatch |

### Source Types (Content Origin)

- `MANUAL` — admin hand-picks
- `COLLECTION` — from a collection
- `AUTO_TOP_SELLING` — by `totalSold`
- `AUTO_NEW_ARRIVALS` — by `createdAt`
- `AUTO_DISCOUNTED` — by `compareAtPrice > basePrice`

### Frontend Renderer Pattern

```tsx
// HomepageRenderer.tsx
export function HomepageRenderer({ sections }: { sections: HomepageSection[] }) {
  return (
    <>
      {sections
        .filter((s) => s.isActive)
        .map((section) => {
          switch (section.sectionType) {
            case 'HERO_BANNER': return <HeroBanner key={section.id} section={section} />;
            case 'EDITORIAL_BANNER': return <EditorialBanner key={section.id} section={section} />;
            case 'POSTER_TRIO': return <PosterTrio key={section.id} section={section} />;
            case 'PRODUCT_CAROUSEL': return <ProductCarousel key={section.id} section={section} />;
            // ... 13 cases
            default: return null;
          }
        })}
    </>
  );
}
```

### Admin UI — Drag & Drop List

```text
┌─────────────────────────────────────────┐
│ + Add Section                            │
├─────────────────────────────────────────┤
│ ⠿ 🖼️  Hero Banner — "A French Flair"     │
│ ⠿ 🖼️  Editorial Banner — "A Seat..."    │
│ ⠿ 🖼️  Poster Trio — Shoe/Jacket/Bag      │
│ ⠿ 🛒  Product Carousel — Must-Have Styles│
│ ⠿ 🖼️  Editorial Duo — Trending This Week │
│ ⠿ 🖼️  Category Grid — Discover Boutiques │
│ ⠿ 🎬  Video Banner — Ounass Stage        │
│ ⠿ 🛒  Product Carousel — Top Shelf Beauty│
│ ⠿ 🖼️  Promo Duo — Membership + App       │
└─────────────────────────────────────────┘
```

### Next.js 16 Streaming Pattern (Fast Loading)

```tsx
// app/page.tsx
export default function HomePage() {
  return (
    <div>
      {/* Static shell renders immediately */}
      <HeroServer />

      {/* Each section streams in as data resolves */}
      <Suspense fallback={<SectionSkeleton type="carousel" />}>
        <TopSellingWomenSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton type="carousel" />}>
        <TopSellingMenSection />
      </Suspense>

      <Suspense fallback={<SectionSkeleton type="grid" />}>
        <NewArrivalsSection />
      </Suspense>
    </div>
  );
}
```

- Static shell renders instantly (no wait)
- Each section streams independently
- Skeletons prevent CLS
- React hydrates per Suspense boundary (better INP)

---

## 9. FOOTER STRUCTURE (BANGLADESHI)

```text
NEWSLETTER BLOCK
├── Email + WhatsApp opt-in
└── Subscribe button

MAIN FOOTER (4 columns)
├── SHOP: Men, Women, Kids, New Arrivals, Sale, Collections
├── ABOUT US: Our Story, Careers, Store Locator, Blog
├── CUSTOMER SERVICE: Contact, FAQ, Track Order, Return Policy, Shipping, Size Guide
└── HELP: Terms, Privacy, Refund Policy

PAYMENT METHODS ROW
└── bKash | Nagad | Rocket | Visa | Mastercard | COD | SSLCommerz

CONTACT STRIP
├── Hotline: 16247 (10 AM - 8 PM)
├── WhatsApp: +880 1XXX-XXXXXX
├── Email: support@rangoli.com.bd
├── Address: [Physical address], Dhaka, Bangladesh
└── Trade License | BIN | TIN

SOCIAL LINKS
└── Facebook | Instagram | YouTube | TikTok | Pinterest

COPYRIGHT BAR
├── © 2026 Brand Ltd. All rights reserved.
├── Made with ❤️ in Bangladesh
└── Payment icons
```

All content admin-editable via `FooterColumn`, `FooterLink`, `StoreContactInfo`, `SocialLink`.

---

## 10. MEDIA & CLOUDINARY INTEGRATION

### Storage Strategy

- Cloudinary for all images and videos (free tier)
- Store `publicId` (not full URL) in DB — build URLs dynamically
- Auto-generate SEO filename from context

### Cloudinary Folder Structure

```text
products/{productId}/variants/{variantId}/   ← variant-specific
products/{productId}/common/                 ← common for all variants
banners/{bannerId}/
collections/{collectionId}/
homepage/{sectionId}/
```

### URL Builder (Frontend)

```ts
// src/lib/cloudinary/url.ts
export function buildCloudinaryUrl(
  publicId: string,
  options: { type?: 'image' | 'video'; transform?: CloudinaryTransform; version?: number } = {},
): string {
  const { type = 'image', transform = {}, version } = options;
  const parts: string[] = [];
  parts.push(`f_${transform.format ?? 'auto'}`);
  parts.push(`q_${transform.quality ?? 'auto'}`);
  if (transform.width) parts.push(`w_${transform.width}`);
  if (transform.height) parts.push(`h_${transform.height}`);
  if (transform.aspectRatio) parts.push(`ar_${transform.aspectRatio.replace(':', '_')}`);
  if (transform.crop) parts.push(`c_${transform.crop}`);
  if (transform.gravity) parts.push(`g_${transform.gravity}`);
  const transformString = parts.join(',');
  const versionPart = version ? `v${version}/` : '';
  return `https://res.cloudinary.com/${CLOUD_NAME}/${type}/upload/${transformString}/${versionPart}${publicId}`;
}

export const CLOUDINARY_PRESETS = {
  thumbnail: { width: 300, aspectRatio: '1:1', crop: 'fill', gravity: 'auto' },
  card: { width: 600, aspectRatio: '4:5', crop: 'fill', gravity: 'auto' },
  gallery: { width: 1200, aspectRatio: '4:5', crop: 'fill', gravity: 'auto' },
  heroDesktop: { width: 1920, aspectRatio: '16:9', crop: 'fill', gravity: 'auto' },
  heroMobile: { width: 800, aspectRatio: '4:5', crop: 'fill', gravity: 'auto' },
  banner: { width: 1600, aspectRatio: '16:9', crop: 'fill', gravity: 'auto' },
  zoom: { width: 2000, crop: 'limit' },
  blur: { width: 20, quality: 30, blur: 1000 },
} as const;
```

### Reusable `<CloudImage />` Component

```tsx
// src/components/media/CloudImage.tsx
interface CloudImageProps {
  publicId: string;
  preset?: keyof typeof CLOUDINARY_PRESETS;
  aspectRatio?: string;
  blurDataUrl?: string;
  version?: number;
  alt: string;          // REQUIRED
  title?: string;
  seoFilename?: string;
  priority?: boolean;
  sizes?: string;
  className?: string;
}
```

Used everywhere. No raw `<img>` tags in the codebase.

### Variant-Aware Gallery (Dynamic Image Count)

```tsx
// Filter logic: variantId === null (common) OR variantId === selectedVariantId
const visibleMedia = productMedia
  .filter((m) => m.variantId === null || m.variantId === selectedVariantId)
  .sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
```

Image count varies per variant:

- Red/S: 4 images
- Blue/M: 6 images
- Common: 2 images (shown for all)

### Media Features

| Feature | Status | Notes |
|---|---|---|
| Video autoplay | ✅ Enabled | autoPlay muted loop playsInline |
| Click-to-zoom | ✅ Desktop | Cloudinary `w_2000` preset |
| Pinch-zoom | ✅ Mobile | Native browser |
| 360° product view | ⏳ Phase 2 | Requires 24-36 angle images |
| Image size limit | ✅ 10 MB | Enforced on upload |
| Video size limit | ✅ 100 MB | Enforced on upload |
| Formats | ✅ Auto | JPEG/PNG/WebP/AVIF in, WebP/AVIF out via `f_auto` |
| Responsive | ✅ Everywhere | CSS Grid/Flex mobile-first |

### SEO Metadata per Image (Admin-Provided)

| Field | Purpose | Required |
|---|---|---|
| `altText` | Accessibility + SEO | ⚠️ Strongly recommended (max 125 chars) |
| `title` | Hover tooltip + schema | Optional |
| `caption` | Visible under image | Optional |
| `description` | For structured data | Optional |
| `keywords` | For structured data | Optional |
| `seoFilename` | URL slug override | Auto-generated, editable |
| `geoLocation` | Schema.org geo | Optional |
| `credit` | Photographer credit | Optional |

### Structured Data (JSON-LD)

Every product page includes `ProductSchema` with `ImageObject[]` — Google Image SEO.

**Image Sitemap:** `/sitemap-images.xml` route generates image sitemap. Submit to Google Search Console.

---

## 11. AI CHATBOT (FREE TIER)

### Architecture — 3 Layers

**Layer 1: LLM Provider Fallback Chain**

1. **Groq** (primary) — fastest, best free tier, Llama/Mixtral
2. **OpenRouter** (`:free` models) — fallback aggregator
3. **Google Gemini** — final fallback

All use OpenAI-compatible API → single adapter works.

**Layer 2: RAG (Retrieval-Augmented Generation)**

- Supabase pgvector for product embeddings
- Product content embedded on create/update
- Query → vector search → inject top matches into context

**Layer 3: Streaming UI**

- Vercel AI SDK (`useChat` hook)
- Server-sent events for streaming responses
- No custom SSE plumbing

### Features

- Auto-greeting
- Product-aware (via RAG)
- Order status lookup (via tool calls)
- Size guide assistance
- Bangla + English (bilingual)
- Fallback to WhatsApp if bot fails

### Cost

$0 at launch. Scales with usage. Groq's free tier is generous for small e-commerce.

---

## 12. PAYMENTS & SHIPPING

### Payment Methods

| Method | Gateway | Status | Notes |
|---|---|---|---|
| COD | Manual | ✅ Phase 3 | 70% of orders |
| bKash | Tokenized Checkout | ✅ built | `src/modules/payments/bkash.gateway.ts` (token grant → create → execute) |
| SSLCommerz | Redirect + callback | ✅ built | `src/modules/payments/sslcommerz.gateway.ts` (session → validator API) |
| Nagad | Merchant API | ⏳ Phase 5 | Optional |
| Rocket | DBBL API | ⏳ Phase 5 | Optional |

Partial COD (later): customer pays delivery fee in advance via bKash to confirm COD order. Reduces RTO.

### Shipping Zones

| Zone | Rate | Free Threshold |
|---|---|---|
| Inside Dhaka | ৳60 | Over ৳8000 |
| Outside Dhaka | ৳100 | Over ৳8000 |

3PL integration (future): Pathao, RedX, Paperfly via unified API.

### Payment Flow (COD)

1. Customer selects COD
2. Order created with `paymentStatus = UNPAID`
3. Admin confirms
4. Order shipped
5. Delivery agent collects cash
6. Admin marks `codCollected = true`, `paymentStatus = PAID`

### Payment Flow (bKash/SSLCommerz)

1. Customer selects gateway
2. Backend creates payment session
3. Customer redirected to gateway
4. Gateway returns `transactionId`
5. Backend verifies server-to-server
6. Order created with `paymentStatus = PAID`

Every gateway call includes `correlationId` for end-to-end tracing.

---

## 13. SEO STRATEGY

### On-Page SEO

- SSR product pages with Next.js 16
- Semantic HTML (`<article>`, `<h1>`, `<nav>`)
- Meta title + description per product
- OG tags for Facebook/WhatsApp sharing
- Canonical URLs to prevent duplicates

### Image SEO

- Descriptive alt text (admin-provided)
- SEO filenames via Cloudinary `public_id`
- Caption under images
- `ImageObject[]` in JSON-LD schema
- Image sitemap submitted to Google

### Structured Data

- Product schema with offers, brand, reviews
- `BreadcrumbList` schema
- `Organization` schema
- `ImageObject` for each product image

### Technical SEO

- Next.js 16 with App Router
- Streaming HTML with Suspense
- Cloudinary `f_auto,q_auto` — serves AVIF/WebP
- Cloudflare free-tier CDN in front
- `sitemap.xml` + `sitemap-images.xml`
- `robots.txt`

---

## 14. TECH STACK

### Backend

- NestJS + TypeScript (strict)
- Prisma ORM + PostgreSQL
- Redis (cache + sessions)
- BullMQ (background jobs)
- Cloudinary (media)
- Groq + Vercel AI SDK (chatbot)
- JWT + bcrypt/argon2 (verifies NextAuth sessions)
- class-validator + class-transformer
- AsyncLocalStorage (correlation ID)
- Sharp (image processing)

### Frontend Store (`Rangoli-frontend/`)

- Next.js 16 (App Router) — **TypeScript**
- **NextAuth v5** (customer login)
- TailwindCSS + shadcn/ui
- React Query (server state)
- Zustand (client state)
- React Hook Form + Zod
- Embla Carousel (product carousels)
- `next/image` + `next/font`
- Vercel AI SDK `useChat` (chatbot)

### Frontend Admin (`Rangoli-admin/`)

- Next.js 16 — **TypeScript**
- **NextAuth v5** (credentials + department permissions)
- shadcn/ui + TanStack Table (Ant Design optional)
- React Query
- React Hook Form + Zod
- Recharts (dashboard charts)
- dnd-kit (drag-and-drop section ordering)

### DevOps

- Docker (Postgres, Redis local)
- GitHub Actions (CI/CD)
- Vercel (frontends)
- Railway / VPS (backend)
- Sentry (error tracking)
- Cloudflare free tier (DNS + CDN)
- Cloudinary free tier (images + videos)
- Groq free tier (chatbot)

---

## 15. DEVELOPMENT ROADMAP

### Phase 1 (Week 1-2) — Foundation

- Folder scaffolding: `rangoli-backend/`, `Rangoli-admin/`, `Rangoli-frontend/`
- Prisma schema + migrate
- Seed data (roles, permissions, settings, categories, departments)
- Common layer (base classes, filters, guards, interceptors, correlation ID)
- **NextAuth setup on both frontends + Auth module (JWT + guest)**
- Categories module (reference implementation)

### Phase 2 (Week 3-4) — Catalog

- Products module (with variants + media)
- Cloudinary integration
- Collections module
- Homepage sections + builder
- 🟡 **Frontend homepage** (CMS-driven, Embla slider, SEO/SSR, responsive) — built (`Rangoli-frontend/`)
- Banners + Navbar + Footer
- Admin CRUD screens for all

### Phase 3 (Week 5-6) — Commerce

- Cart module
- Wishlist module
- Checkout flow
- COD payment
- bKash integration
- Order module + admin order management
- Delivery department dashboard
- ✅ **Frontend storefront complete** (`Clothing_Site_Frontend`): PLP + PDP, cart drawer, 4-step
  checkout (COD/bKash/SSLCommerz), order receipt + guest track, search overlay, wishlist
  (account-synced), account area (dashboard/orders/addresses/profile) + auth (login/register/
  forgot/reset). Verified: build clean, 18 routes 200.

### Phase 4 (Week 7-8) — Growth 🟡 BACKEND ~MOSTLY BUILT

- ✅ SSLCommerz integration (`src/modules/payments/`)
- ✅ Discounts + Coupons engine (`src/modules/discounts/`)
- ✅ Reviews + Ratings (`src/modules/reviews/`)
- ✅ Email/SMS notifications (`src/modules/notifications/`)
- ✅ Customer account dashboard backend — profile + addresses (`src/modules/users/`)
- ⏳ Marketing department dashboard (analytics/reports)
- ⏳ Accounting department dashboard (analytics/reports)

### Phase 5 (Week 9-10) — Scale 🟡 BACKEND BUILT

- ✅ AI Chatbot (Groq + product RAG + catalog fallback) — `src/modules/chatbot/`
- ✅ 3PL integration (Pathao/RedX) — `src/modules/shipping/`
- ✅ Analytics + Reports — `src/modules/analytics/`
- ✅ Loyalty/Rewards — `src/modules/loyalty/`
- ✅ Gift vouchers (checkout-integrated) — `src/modules/loyalty/`
- ~~Multi-language (Bangla/English)~~ — **dropped from scope by request**
- ⏳ 360° product view (asset/frontend concern)

### Phase 6 (Week 11-12) — System Health & Observability 🟡 BACKEND BUILT, ADMIN UI PENDING

> Full design spec: **Section 18**. Redis decision: local = skip (in-memory cache), production = Docker (see §18.0).

- **System 1 — Error Logs:** ✅ `ErrorLog` table + `GlobalExceptionFilter` persistence (fire-and-forget,
  secrets redacted, Prisma errors tagged `source: "database"`) via existing APP_FILTER registration —
  `ErrorLogService` (filters + resolve) + `GET/PATCH /admin/system-health/errors*` behind
  `menu.settings.errors`. ⏳ Admin page + CSV export + CRITICAL alerts still pending.
- **System 2 — Data Mismatch Detection:** ✅ `DataMismatch` table + `ReconciliationService`
  (`@nestjs/schedule` hourly cron) with **8 checks** (order totals, payment↔order, negative stock,
  over-discount, ghost orders, duplicate orders, price drift, COD not collected), dedupe on
  (type + referenceId) while unresolved + `GET/PATCH /admin/system-health/mismatches*` and manual
  `POST …/rerun` behind `menu.settings.mismatches`. ⏳ Admin pages still pending.
- ✅ Dashboard `GET /admin/system-health/summary` (`menu.settings`) + 3 menu permission keys
  (`menu.settings.system_health/errors/mismatches`, inherited by owner via `menu.settings` prefix).
- Install: ✅ `@nestjs/schedule` installed; `ScheduleModule.forRoot()` registered in `AppModule`.

---

## 16. IDEA LOG

Features discussed across all sessions — chronological.

**Session 1: Discounts + Coupons + Banners**
Product-level conditional discounts, category-level discounts, Black Friday/campaign discounts. Coupons: date-based, usage-limited per user, admin-controlled. Homepage banners/posters.

**Session 2: Category System**
Dynamic self-referencing category tree. Admin UI limited to 3 levels. Frontend navigation shows 2 levels. Product belongs to deepest category.

**Session 3: Gender + Homepage**
Men/Women/Kids as separate top-level categories. Top selling products per gender on homepage. Admin manual override for homepage sections.

**Session 4: Collections**
Festival/seasonal collections (not categories). Products can belong to multiple collections. Dynamic navbar with mega menu. Collection has own landing page + banner.

**Session 5: Full Customer Journey (Le Reve + Inte Blu Analysis)**
Product detail page features (SKU, VAT, size chart, Try On, scarcity). Cart with gift voucher + VAT breakdown. Category listing page (PLP) with color swatches. Checkout: guest, shipping zones, payment methods. Wishlist system. Stock scarcity indicators. VAT handling (inclusive vs exclusive). Rewards/loyalty (phase 2).

**Session 6: Correlation ID + VAT Optional + Variant Media**
Correlation ID for end-to-end tracing. VAT optional (beginner mode default off). Variant-wise images and videos. Video support (product + banner). Backend layering (Controller → Service → Repository).

**Session 7: Generic CRUD Base Classes**
`BaseRepository`, `BaseService`, `BaseController`. Lifecycle hooks. Reusable DTOs with `PartialType`. Global exception filter (Prisma). Response interceptor with `correlationId`.

**Session 8: Pagination Everywhere**
Offset pagination for admin. Cursor pagination for customer. Hard caps (100 / 50). Consistent meta shape. `paginate()` helper for custom methods.

**Session 9: Homepage Builder (Ounass Analysis)**
13 section types. Two content sources (media-driven, product-driven). Source types (manual, collection, auto top-selling, etc.). Drag-and-drop admin UI. Bangladeshi footer structure.

**Session 10: Admin Departments & Roles**
Departments as org units. Roles as permission sets within departments. Users belong to multiple departments. Super Admin bypasses all checks. Department-scoped dashboards. Cross-department order flow.

**Session 11: Cloudinary Integration**
Store `publicId` (not URLs). Reusable `<CloudImage />` component. Presets (card, gallery, hero, thumbnail, blur). Variant-aware gallery (dynamic image count). Video autoplay in gallery.

**Session 12: SEO-First Media**
8 SEO fields per image. Auto-generation of SEO defaults. SEO filename becomes Cloudinary `public_id`. JSON-LD schema for product images. Image sitemap for Google.

**Session 13: Media Features + AI Chatbot**
Video autoplay confirmed. Click-to-zoom confirmed. Responsive design everywhere. 360° view deferred to Phase 2. Image size limits (10MB image / 100MB video). Free AI chatbot: Groq + Vercel AI SDK + Supabase RAG. Provider fallback chain (Groq → OpenRouter → Gemini).

**Session 14: Repo Structure + NextAuth + Security**
Split into `rangoli-backend/`, `Rangoli-admin/`, `Rangoli-frontend/`. TypeScript enforced in both frontends. NextAuth v5 for customer and admin login with backend-verified sessions. Full security hardening checklist (Section 3).

**Session 15: Phase 1 Build + Pure RBAC Pivot**
NestJS scaffold, Prisma schema, seeds, common layer (correlation ID, response interceptor, exception filter, pagination, base CRUD), Auth + Categories + Health modules. **Departments dropped — replaced by pure RBAC** (Role → `permissions[]` → `user_roles`), 7 seeded roles, `@RequirePermissions` guard with `*` wildcard and `sessionVersion` revocation. Then the product filter/search system: shared `buildProductWhere` (list ↔ facets), computed `discountPercent`, cursor + offset listing, in-memory `CacheService`, and the `/search` module (suggestions, popular, log).

**Session 28: Redis Decision + System Error Detection**
Redis final call: **local = skip** (in-memory cache, JWT sessions, throttler in-memory), **production = Docker on VPS** (cache + BullMQ + Pub/Sub, ~30-100 MB) — migration is config-only since the cache API stays identical. Two new systems designed: **(1) Error Logs** — `ErrorLog` table + `GlobalExceptionFilter` writing every 4xx/5xx with correlation ID, severity, source, stack, request context; admin filter/search/resolve/export. **(2) Data Mismatch Detection** — `DataMismatch` table + hourly reconciliation cron with 6 checks (order total ≠ items, payment PAID but order not confirmed, negative stock, ghost orders, price drift, COD not collected after delivery), deduplicated so repeat detections only bump `lastCheckedAt`. Admin gets a combined **System Health** dashboard with 3 new menu items and permission keys. Full spec: **Section 18** (planned as roadmap **Phase 6**).

---

## 17. PRODUCT FILTER & SEARCH API

Implemented in `rangoli-backend/src/modules/products/` and `rangoli-backend/src/modules/search/`.

### Storefront endpoints (public — `@Public()`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/products` | filtered + searched + sorted listing (offset pagination) |
| GET | `/products/cursor` | same query, cursor mode for infinite scroll |
| GET | `/products/filters/facets` | counts for every filter option matching the query |
| GET | `/products/:slug` | product detail by slug |

Sending `cursor=<id>` on `GET /products` switches it to cursor mode (`page` is ignored and `meta.nextCursor` is returned).

### Query parameters (`QueryProductDto`)

| Param | Type | Example | Filters on |
|---|---|---|---|
| `q` | string | `panjabi` | name, sku, brand, description (case-insensitive) |
| `categorySlug` / `categorySlugs` | string / csv | `men-panjabi,men-shirt` | product ↔ category (nesting-safe) |
| `gender` | enum | `MEN` | category gender |
| `sizes` | csv | `S,M,L` | variant size (implies `stock > 0`) |
| `colors` | csv | `Red,Blue` | variant color (implies `stock > 0`) |
| `minPrice` / `maxPrice` | int | `590` / `4500` | `basePrice` range (BDT) |
| `brands` / `materials` | csv | `Rangoli,Envoy` | exact match list |
| `onSale` | bool | `true` | `compareAtPrice IS NOT NULL` |
| `minDiscount` | int 0–100 | `20` | computed `discountPercent` |
| `inStock` | bool | `true` | `totalStock > 0` |
| `minRating` | int 1–5 | `4` | approved reviews average |
| `collectionSlug` | string | `eid-collection` | festival/seasonal collections |
| `tags` | csv | `summer,cotton` | product tags |
| `newArrivals` | bool | `true` | created in the last 30 days |
| `sort` | enum | `price_asc` | see below |
| `cursor` | string | uuid | switches to cursor mode |
| `page` / `limit` | int | `1` / `20` | offset mode (limit cap 100) |

Arrays accept both `?sizes=M,L` and `?sizes=M&sizes=L`.
`sort` ∈ `newest` (default), `oldest`, `price_asc`, `price_desc`, `best_selling`, `discount_desc`, `relevance`.
Every sort appends `id` as a tiebreaker so cursor pages never skip or repeat a row.

### Admin endpoints (permission-guarded)

| Method | Path | Permission |
|---|---|---|
| GET | `/products/admin` | `product:read` (includes inactive products) |
| POST | `/products` | `product:create` |
| PATCH | `/products/:id` | `product:update` |
| DELETE | `/products/:id` | `product:delete` (soft delete) |

### Shared filter builder (list ↔ facets never disagree)

`buildProductWhere(query)` in `product-filter.builder.ts` is the single source of truth for both
`GET /products` and `GET /products/facets`. The facet count you see in the sidebar is computed from
the exact same `where` clause as the rows you get after ticking the box.
Filtered fields are indexed in Prisma: `basePrice`, `totalSold`, `material`, `discountPercent`, `size`, `color`, `createdAt`.

Facets response:

```json
{
  "total": 128,
  "price": { "min": 590, "max": 4500 },
  "maxDiscount": 35,
  "categories": [{ "value": "men-panjabi", "label": "Panjabi", "count": 42 }],
  "brands": [{ "value": "Rangoli", "count": 31 }],
  "materials": [{ "value": "Cotton", "count": 55 }],
  "sizes": [{ "value": "M", "count": 24 }],
  "colors": [{ "value": "Red", "count": 12 }]
}
```

### Slug rules (URLs are slug-based)

Frontend builds every canonical URL from the slug: `/products/:slug`, `/c/:slug`, `/collections/:slug`.

- **Default:** slug is derived from the name on create — `"Classic Cotton Panjabi — Eid Edition"` → `classic-cotton-panjabi-eid-edition`.
- **Admin override:** `slug` is an editable field on the admin create/edit form (validated `^[a-z0-9]+(-[a-z0-9]+)*$`).
- **Rename safety:** changing the name only rewrites the slug while the slug is still auto-derived. A slug the admin customised is **never** overwritten, so shared links keep working.
- **Uniqueness:** duplicate slug → `409 PRODUCT.SLUG_TAKEN` (`/products/...`) or `409 CATEGORY.SLUG_TAKEN` (`/c/...`).
- Collections (Part 3) follow the same three rules.

### `discountPercent` (computed, never trusted)

Stored on `Product` as `((compareAtPrice - basePrice) / compareAtPrice) * 100`, rounded.
Recomputed in `beforeCreate` / `beforeUpdate`; stripped from the incoming DTO before persistence.
Any product write invalidates the cached facets and search suggestions.

### Caching (`src/modules/cache/`)

`CacheService` — in-memory LRU + per-entry TTL (`get` / `set` / `getOrSet` / `deletePrefix`), global module.
Facets TTL 300s (key `facets:…`), suggestions TTL 120s (key `search:suggest:…`), popular searches TTL 600s.
Same async interface as a Redis implementation, so swapping `get`/`set` for ioredis is a drop-in change.

### Search endpoints (public)

| Method | Path | Purpose |
|---|---|---|
| GET | `/search/suggestions?q=&limit=` | type-ahead: products (name, slug, image, price) + categories |
| GET | `/search/popular?limit=` | top queries from `search_logs` (last 30 days, min length 2) |
| POST | `/search/log` | record a shopper search `{ query, resultCount }` |

`POST /search/log` attaches the session `userId` when present, is covered by the global rate limit
(100 req/min), and never fails the request — a write error is logged with `Logger.warn` only.

---

## 18. SYSTEM HEALTH & ERROR DETECTION (PHASE 6 DESIGN)

> Status: **backend built (2026-10-03) — admin UI + alerts pending**. This is the build spec for roadmap **Phase 6**.
> Goal: *"Any error, mismatch calculation, or problem in the project should be visible in the Admin Panel."*
> Two independent systems: **🅰 Error Logs** (exception monitoring) + **🅱 Data Mismatch Detection** (reconciliation).

### 18.0 Redis — Final Decision

| Context | Decision |
|---|---|
| **Local development (now)** | ❌ Skip Redis. In-memory cache (`CacheService` / `@nestjs/cache-manager` API), JWT for sessions, `@nestjs/throttler` in-memory, synchronous background jobs. |
| **Production VPS (later)** | ✅ Add Redis via Docker: cache + queue (BullMQ) + real-time (Pub/Sub) + rate limiting. ~30-100 MB RAM, self-hosted = free. |

Why not now: weak local RAM; Phases 1-3 (Auth, Catalog, Orders) run fine without it; only Phase 4-5
(chatbot, notifications, multi-instance) truly need it.

**Migration path is trivial:** the cache API (`get/set/getOrSet/deletePrefix`) stays identical —
only the module config changes, service code is untouched.

When it becomes necessary: background jobs (email/SMS queue), real-time admin updates (Pub/Sub),
multi-server cache sharing.

---

### 🅰 System 1 — Error Logs (Exception Monitoring)

**Captures:** API errors (4xx/5xx), unhandled backend exceptions, database errors,
third-party failures (Cloudinary, payment gateway), validation errors.

#### Schema

```prisma
model ErrorLog {
  id            String     @id @default(uuid())
  correlationId String?
  level         ErrorLevel
  source        String     // "api" | "database" | "payment" | "cloudinary"
  code          String?    // "AUTH.INVALID_TOKEN"
  message       String     @db.Text
  stackTrace    String?    @db.Text
  context       Json?      // request body, query, params, user info
  userId        String?
  userRole      String?
  path          String?    // "/api/v1/orders"
  method        String?    // "POST"
  ipAddress     String?
  userAgent     String?
  statusCode    Int?
  isResolved    Boolean    @default(false)
  resolvedBy    String?
  resolvedAt    DateTime?
  resolvedNote  String?    @db.Text
  createdAt     DateTime   @default(now())

  @@index([level])
  @@index([source])
  @@index([isResolved])
  @@index([createdAt])
  @@index([correlationId])
  @@map("error_logs")
}

enum ErrorLevel {
  CRITICAL
  ERROR
  WARNING
  INFO
}
```

#### Global Exception Filter

`src/common/filters/global-exception.filter.ts` — `@Catch()` everything:

1. Read `correlationId` from `correlationStorage` (already implemented — §5 Correlation ID).
2. Normalize: `HttpException` → status + `code`/`message` from the response body;
   plain `Error` → message + stack (treated as 500).
3. Level: `status >= 500 → CRITICAL`, `400-499 → ERROR`, else `WARNING`.
4. If `status >= 400`: **fire-and-forget** `prisma.errorLog.create({...})` with correlationId,
   code, message, stackTrace, context (body/query/params), userId/userRole (when `request.user`
   exists), path, method, ipAddress, userAgent, statusCode — `.catch()` logs a warning if the
   insert itself fails (never loop).
5. Console: `logger.error('[corrId] 500 message')`.
6. Respond with the **existing standard envelope**
   `{ success:false, correlationId, error:{ code, message, stackTrace? }, timestamp }`
   (stack only in development).

**Register in `main.ts`:** `app.useGlobalFilters(new GlobalExceptionFilter(app.get(PrismaService)))`
— must sit with the existing Prisma exception filter behavior; keep one source of truth.

#### Admin — Error Logs page

- Summary chips: 🔴 CRITICAL (n) · 🟠 ERROR (n) · 🟡 WARNING (n).
- List rows: level, message, path · relative time · correlationId · acting user.
  Actions: **View Details** (full context/stack) · **Mark Resolved** (with note).
- Filters: level, source (`api/database/payment/cloudinary`), date range.
- Search: message / correlationId.
- Export CSV. Auto-refresh for critical errors. Group/dedupe similar errors.

---

### 🅱 System 2 — Data Mismatch Detection (Reconciliation)

**Catches:** order total ≠ item totals, payment success but order not confirmed, negative stock,
over-discount, price mismatch, ghost orders, duplicate orders, COD delivered but never collected.

#### Schema

```prisma
model DataMismatch {
  id             String            @id @default(uuid())
  type           MismatchType
  severity       MismatchSeverity
  referenceType  String            // "order" | "payment" | "product" | "inventory"
  referenceId    String            // order id, product id, ...
  referenceCode  String?           // order number, SKU
  expected       Json              // { total: 550000 }
  actual         Json              // { total: 480000 }
  variance       Json?             // { amount: 70000 }
  description    String            @db.Text
  metadata       Json?
  isResolved     Boolean           @default(false)
  resolvedBy     String?
  resolvedAt     DateTime?
  resolvedNote   String?           @db.Text
  detectedAt     DateTime          @default(now())
  lastCheckedAt  DateTime          @default(now())

  @@index([type])
  @@index([severity])
  @@index([isResolved])
  @@index([detectedAt])
  @@map("data_mismatches")
}

enum MismatchType {
  ORDER_TOTAL_MISMATCH
  PAYMENT_ORDER_MISMATCH
  NEGATIVE_STOCK
  OVER_DISCOUNT
  PRICE_MISMATCH
  GHOST_ORDER
  DUPLICATE_ORDER
  COD_NOT_COLLECTED
  INVENTORY_COUNT_MISMATCH
}

enum MismatchSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}
```

#### ReconciliationService (`src/modules/reconciliation/`)

- `@Cron(CronExpression.EVERY_HOUR)` → `runAllChecks()` runs all checks via `Promise.all`.
- Amounts are **poisha integers** (divide by 100 for ৳ display). Order-total variance
  threshold: > 100 poisha (৳1).

| # | Check | Severity | Rule |
|---|---|---|---|
| 1 | `ORDER_TOTAL_MISMATCH` | HIGH | `itemsTotal - discount + shipping + vat` vs `totalAmount`, ±variance > ৳1; skip CANCELLED/REFUNDED |
| 2 | `PAYMENT_ORDER_MISMATCH` | CRITICAL | payment `PAID` but order `paymentStatus != PAID` |
| 3 | `NEGATIVE_STOCK` | CRITICAL | `productVariant.stock < 0` |
| 4 | `GHOST_ORDER` | MEDIUM | PENDING + UNPAID + no payment rows + older than 24h |
| 5 | `PRICE_MISMATCH` | LOW | order item price differs >50% from current `product.basePrice` (last 7 days of orders) |
| 6 | `COD_NOT_COLLECTED` | HIGH | status DELIVERED + method COD + not PAID + older than 7 days |

(Schema also reserves `OVER_DISCOUNT`, `DUPLICATE_ORDER` — same user, same minute —
and `INVENTORY_COUNT_MISMATCH` for later checks.)

**Deduplication helper (`logMismatch`):** look up existing unresolved row by
`(type, referenceId)` — if found, bump `lastCheckedAt` and return; otherwise `create` + `logger.warn`.
Never create duplicate rows for the same ongoing issue.

**Registration:** `npm install @nestjs/schedule` → `ScheduleModule.forRoot()` in `AppModule`
imports → `ReconciliationService` as provider. Admin can also trigger `runAllChecks()` manually.

#### Admin — Data Mismatches page

- Summary chips: 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🟢 LOW.
- Rows: type, description (product/order context), expected vs actual + variance,
  detected time. Actions: **Resolve** (note) · deep-link **View Order / View Product /
  Mark COD Collected**.
- Buttons: **Re-run checks now**, **Export CSV**.

---

### 18.1 Admin Panel — combined "System Health" dashboard

Single page with: three stat cards (critical errors / open mismatches / resolved last 24h),
recent errors list (24h), recent mismatches list (24h), and buttons to
**View All Errors · View All Mismatches · Re-run Checks**.

Sub-pages: `/settings/system-health`, `/settings/errors`, `/settings/mismatches`.

### 18.2 API endpoints (`src/modules/system-health/`)

Controller prefix `admin/system-health` — **every route gets `@RequirePermissions(...)`
on top of the global guard order (Throttler → JwtAuthGuard → PermissionsGuard)**:

| Method | Path | Permission |
|---|---|---|
| GET | `/admin/system-health/errors` | `menu.settings.errors` |
| GET | `/admin/system-health/mismatches` | `menu.settings.mismatches` |
| GET | `/admin/system-health/summary` | `menu.settings` |
| POST | `/admin/system-health/mismatches/rerun` | `menu.settings.mismatches` |
| PATCH | `/admin/system-health/errors/:id/resolve` | `menu.settings.errors` |
| PATCH | `/admin/system-health/mismatches/:id/resolve` | `menu.settings.mismatches` |

DTOs: `QueryErrorLogDto`, `QueryMismatchDto`, `ResolveDto { note: string }`.

### 18.3 RBAC additions

Menu registry entries:

| key | label | path | permission | order |
|---|---|---|---|---|
| `settings.system_health` | System Health | `/settings/system-health` | `menu.settings.system_health` | 8 |
| `settings.errors` | Error Logs | `/settings/errors` | `menu.settings.errors` | 9 |
| `settings.mismatches` | Data Mismatches | `/settings/mismatches` | `menu.settings.mismatches` | 10 |

New permission constants follow the existing `menu.*` prefix rules so `hasPermission`
parent-menu unlocking works (`menu.settings` unlocks children). Super Admin (`*`) sees all;
assign `menu.settings.errors` / `menu.settings.mismatches` to support roles as needed.

### 18.4 Notification (optional, last)

On `level = CRITICAL` error → email to admin (`MailService`, already planned in Phase 4)
and optional WhatsApp via Twilio. Must be async and failure-proof (never block the request).

### 18.5 Build checklist

- [x] Prisma: `ErrorLog` + `DataMismatch` models, enums, indexes (migrate on a live DB still pending)
- [x] `GlobalExceptionFilter` persists ErrorLogs (APP_FILTER registration reused; `main.ts` untouched)
- [x] `ErrorLogModule` → folded into `SystemHealthModule` (service, controller, DTOs)
- [x] `DataMismatchModule` / `ReconciliationModule` → `MismatchService` + `ReconciliationService` (hourly cron + manual rerun)
- [x] `SystemHealthModule` (summary aggregation)
- [x] `npm install @nestjs/schedule` + `ScheduleModule.forRoot()`
- [x] Permission constants + menu registry (owner inherits via `menu.settings` prefix; no seed change needed)
- [ ] Admin pages: system-health / errors / mismatches (Next.js, `Rangoli-admin/`)
- [x] Tests: filter writes ErrorLog for 4xx/5xx/Prisma/500s + redaction; reconciliation flags known fixtures;
      dedupe bumps `lastCheckedAt`; resolve flow; route-security contract covers new routes
- [ ] (Optional) CRITICAL alert email/WhatsApp

---

## READY FOR IMPLEMENTATION

This document contains everything needed to start building:

- ✅ Repository & folder structure (`rangoli-backend/`, `Rangoli-admin/`, `Rangoli-frontend/`)
- ✅ Full database schema (Prisma)
- ✅ Backend architecture (NestJS layering)
- ✅ Generic CRUD base classes
- ✅ Pure RBAC permission system (roles + flat `permissions[]`, no departments)
- ✅ Product filtering, facets & search API
- ✅ NextAuth security model + hardening checklist
- ✅ Homepage builder design
- ✅ Media strategy (Cloudinary)
- ✅ AI chatbot plan (Groq)
- ✅ SEO strategy
- ✅ Payment + shipping flows
- ✅ Footers, navbars, banners
- ✅ Full roadmap

**Next step:** Start with Phase 1 — scaffold the three folders, Prisma schema, seed data, common layer, NextAuth, Auth module, Categories module.
