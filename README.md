# Clothing_Site_Backend

REST API for **Rangoli** — a clothing e-commerce platform for Bangladesh.

Built with **NestJS · Prisma · PostgreSQL · TypeScript** (strict). Layering:
Controller → Service → Repository → Prisma. Pure RBAC (Role → `permissions[]` → `user_roles`).

## Modules

Auth (admin/customer/guest login, register, forgot/reset password, refresh, verify, me) ·
users (profile + addresses) · categories · products (variants, media, facets, cursor paging) ·
collections · cart · wishlist · orders (checkout, track, cancel, status pipeline) ·
payments (COD + bKash/SSLCommerz) · discounts/coupons · loyalty (points + gift vouchers) ·
reviews · homepage builder · banners · navbar · footer · search · analytics ·
shipping 3PL (Pathao/RedX) · chatbot (Groq) · settings · system-health
(error logs + reconciliation) · notifications (email/SMS).

## API conventions

Every response uses a consistent envelope and a correlation ID:

```json
{
  "success": true,
  "correlationId": "…",
  "data": {},
  "meta": {},
  "timestamp": "…"
}
```

## Requirements

- Node.js 20+ (developed on Node 26)
- PostgreSQL (required to boot — Prisma connects on start)
- Redis — optional in dev (in-memory cache / throttler)

## Getting started

```bash
npm install
cp .env.example .env         # fill in DATABASE_URL + JWT secrets
npx prisma migrate dev       # requires a running PostgreSQL
npm run start:dev            # http://localhost:4000/api/v1
```

### Key environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | ≥ 32-byte signing secrets (access / refresh) |
| `JWT_RESET_SECRET` | optional; signs password-reset tokens (defaults to `JWT_SECRET`) |
| `FRONTEND_URL` | base URL for password-reset links |
| `CORS_ORIGINS` | comma-separated allowed origins |
| `MAIL_*` / `SMS_*` | transactional email / SMS (console-log when disabled) |
| `BKASH_*` / `SSLCOMMERZ_*` | payment gateways |
| `PATHAO_*` / `REDX_*` | 3PL couriers |
| `GROQ_*` | AI chatbot |

See [`.env.example`](./.env.example) for the full list.

## Scripts

```bash
npm run start:dev     # watch mode
npm run start         # run once
npm run build         # compile to dist/
npm run start:prod    # node dist/src/main
npm run lint          # eslint (zero warnings)
npm run typecheck     # tsc --noEmit
npx jest              # unit tests
```

## Documentation

- [`PROJECT_MASTER_DOCUMENT.md`](./PROJECT_MASTER_DOCUMENT.md) — full product spec + architecture.
- [`BACKEND_PROGRESS.md`](./BACKEND_PROGRESS.md) — backend build log.

## License

Proprietary — all rights reserved.
