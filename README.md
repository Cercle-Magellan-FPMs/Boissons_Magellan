# Boissons Magellan

Boissons Magellan is a small drink-selling system for the Cercle Magellan. It is designed around an RFID kiosk where a user scans a badge, selects drinks, and the purchase is added to their debt. A separate admin interface is used to manage products, stock, users, and debt-closing operations.

The repository is split into 3 main applications:

- `backend`: Fastify + TypeScript API backed by SQLite
- `kiosk`: React/Vite frontend used on the physical kiosk
- `admin`: React/Vite frontend for committee/admin operations

An Nginx reverse proxy and a backup container are also included for deployment.

## What The Project Does

Main workflow:

1. A user scans an RFID badge on the kiosk.
2. The kiosk calls the backend to identify the user.
3. The kiosk displays available drinks and current stock.
4. The user places an order.
5. The backend stores the order, decrements stock, and records stock movements.
6. Admins can review current debts, close billing periods, mark debts as paid, restock products, and manage users/products.

Business concepts implemented in the codebase:

- Users have an RFID badge and can be active or disabled.
- Products have current stock and a price history.
- Orders are recorded immediately when placed on the kiosk.
- Debt can be viewed in two ways:
  - live/current debt from open orders
  - closed debt generated when an admin closes a billing period
- Admin actions are protected with an `x-admin-token` header.

## High-Level Architecture

The default deployed architecture is:

- `proxy` (`nginx:alpine`): entrypoint on port `80`
- `backend`: Fastify API on port `3000`
- `kiosk`: static frontend served behind `/kiosk/`
- `admin`: static frontend served behind `/admin/`
- `backup`: periodic SQLite backup container

The SQLite database is mounted from `/var/lib/boissons` in Docker Compose.

## Public URLs And Reverse Proxy Routes

Defined in `ops/nginx/nginx.conf`:

- `/` -> redirects to `/kiosk/`
- `/kiosk/` -> kiosk frontend
- `/admin/` -> admin frontend, IP-restricted
- `/api/kiosk/` -> kiosk API, IP-restricted
- `/api/admin/` -> admin API, IP-restricted

Current access restrictions in Nginx:

- `/admin/` is only allowed from `172.16.0.111`
- `/api/admin/` is only allowed from `172.16.0.111`
- `/api/kiosk/` is allowed from `172.20.0.4` and `172.16.0.111`

## Backend API

Backend entrypoint: `backend/src/index.ts`

Registered route groups:

- `healthRoutes`
- `kioskRoutes`
- `productRoutes`
- `orderRoutes`
- `adminRoutes`
- `adminDebtRoutes`
- `adminCloseMonthRoutes`
- `adminDebtSummaryRoutes`
- `adminDebtSummaryCurrentRoutes`
- `adminClosePeriodRoutes`
- `adminUserRoutes`

### Health

- `GET /health`
  - Simple healthcheck endpoint

### Kiosk API

- `POST /api/kiosk/identify`
  - Identifies a user from an RFID UID
  - Request body: `{ uid: string }`

- `GET /api/kiosk/debt/:userId`
  - Returns the user debt summary
  - Includes:
    - unpaid closed debts
    - open debt since the last billing period
    - aggregated purchased items

- `GET /api/kiosk/products`
  - Lists active products visible on the kiosk
  - Includes current price, current stock, availability, and image slug

- `POST /api/kiosk/order`
  - Creates an order for a user
  - Validates user status, stock, and product price
  - Decrements stock and writes stock movement rows

### Admin API

All admin endpoints require the `x-admin-token` header, validated in `backend/src/routes/admin/_auth.ts`.

Products:

- `GET /api/admin/products`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`
- `POST /api/admin/products/:id/price`

Stock / restock:

- `POST /api/admin/restock`

Debts:

- `GET /api/admin/debts`
- `POST /api/admin/debts/pay`
- `POST /api/admin/debts/unpay`
- `GET /api/admin/debts/summary`
- `GET /api/admin/debts/user/:userId`
- `GET /api/admin/debts/summary-current`

Closing operations:

- `POST /api/admin/close-period`
  - Closes everything since the last billing period and creates `period_debts`

- `POST /api/admin/close-month`
  - Older monthly closing logic based on `monthly_debts`

Users:

- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/badge`

## Frontend Structure

### Kiosk frontend

Location: `kiosk/`

Purpose:

- Wait for a badge scan
- Identify the user
- Display available drinks
- Build a cart
- Submit orders
- Show current debt summary

Main files:

- `kiosk/src/App.tsx`: main kiosk flow and API calls
- `kiosk/src/main.tsx`: React bootstrap
- `kiosk/src/App.css`: kiosk UI styles
- `kiosk/public/magellan-logo.png`: kiosk branding asset
- `kiosk/public/products/`: product images used by the kiosk

Main UI states in `kiosk/src/App.tsx`:

- `badge`
- `products`
- `thanks`

### Admin frontend

Location: `admin/`

Purpose:

- Manage products and prices
- Adjust stock
- Manage users and RFID badges
- Close periods
- Review and mark debts as paid
- Display debt summary by user

Main files:

- `admin/src/App.tsx`: main layout and page navigation
- `admin/src/lib/api.ts`: fetch wrapper adding `x-admin-token`
- `admin/src/lib/types.ts`: shared frontend types
- `admin/src/pages/ProductsPage.tsx`: product listing, creation, rename, price updates, activation, image slug
- `admin/src/pages/RestockPage.tsx`: stock input form and correction/restock submission
- `admin/src/pages/DebtsPage.tsx`: close period and manage debt payment state
- `admin/src/pages/DebtSummaryPage.tsx`: debt overview by user with detail panel
- `admin/src/pages/UsersPage.tsx`: user creation, activation, rename, RFID linking

## Database Structure

SQLite is initialized in `backend/src/db/db.ts`.

Migrations are stored in `backend/src/db/migrations/`:

- `001_init.sql`
- `002_billing_periods.sql`

Core tables:

- `users`: users and RFID mapping
- `products`: drink catalog
- `product_prices`: price history per product
- `stock_current`: current stock per product
- `stock_moves`: inventory movement log
- `orders`: committed kiosk orders
- `order_items`: line items per order
- `billing_periods`: closed billing windows
- `period_debts`: debt generated for each user per closed period

Legacy / secondary tables still present:

- `admins`
- `monthly_debts`
- `debt_mail_log`
- `schema_migrations`

## Important Backend Files

- `backend/src/index.ts`: server bootstrap and route registration
- `backend/src/db/db.ts`: SQLite initialization and access
- `backend/src/db/migrate.ts`: migration runner
- `backend/src/db/seed.ts`: example seed users
- `backend/src/db/seed_products.ts`: example seed products
- `backend/src/lib/productSlug.ts`: mapping between product IDs and image slugs
- `backend/src/routes/`: all API handlers

## File Structure

```text
.
├── admin/
│   ├── public/
│   ├── src/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── backend/
│   ├── src/
│   │   ├── db/
│   │   │   ├── migrations/
│   │   │   ├── db.ts
│   │   │   ├── migrate.ts
│   │   │   ├── seed.ts
│   │   │   └── seed_products.ts
│   │   ├── lib/
│   │   ├── routes/
│   │   │   └── admin/
│   │   └── index.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tsconfig.json
├── kiosk/
│   ├── public/
│   │   └── products/
│   ├── src/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   ├── package.json
│   └── vite.config.ts
├── ops/
│   ├── backup/
│   │   ├── Dockerfile
│   │   ├── boissons-backup.sh
│   │   └── run.sh
│   └── nginx/
│       └── nginx.conf
├── docker-compose.yml
└── README.md
```

## Run And Deploy

### Local backend

From `backend/`:

- `npm install`
- `npm run migrate`
- `npm run seed`
- `npm run seed:products`
- `npm run dev`

Default backend port:

- `3000`

Relevant backend environment variables:

- `PORT`
- `DB_PATH`
- `ADMIN_TOKEN`
- `PRODUCT_SLUG_PATH`

### Frontends

From `kiosk/` or `admin/`:

- `npm install`
- `npm run dev`

### Docker deployment

Root file:

- `docker-compose.yml`

Services:

- `proxy`
- `backend`
- `kiosk`
- `admin`
- `backup`

## Notes

- CORS is currently configured in `backend/src/index.ts` for `http://localhost:5173`.
- Product images are resolved through an image slug mapping stored in `data/product_slugs.json`.
- There are two debt models in the database: older `monthly_debts` logic and current `billing_periods` / `period_debts` logic. The current admin UI uses the billing period flow.
- If you change Nginx configuration, validate and reload it:
  - `sudo nginx -t`
  - `sudo systemctl reload nginx`
