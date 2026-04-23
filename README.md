# Boissons Magellan

Boissons Magellan is a small drink-selling system for the Cercle Magellan. It is designed around an RFID kiosk where a user scans a badge, selects drinks, and the purchase is paid immediately from their prepaid balance. A separate admin interface is used to manage products, stock, users, balances, and debt-closing operations for legacy unpaid periods.

The repository is split into 3 main applications:

- `backend`: Fastify + TypeScript API backed by SQLite
- `kiosk`: React/Vite frontend used on the physical kiosk
- `admin`: React/Vite frontend for committee/admin operations

Mandatory Codex working rules are defined in `CODEX_RULES.md`.

An Ubuntu host deployment path based on `systemd` and host `nginx` is included for production use.

## Repository Structure

- `backend/`: Fastify API, migrations, DB access, business rules.
- `kiosk/`: user-facing kiosk frontend.
- `admin/`: admin frontend.
- `ops/`: deployment and backup scripts.
- `docs/`: concise technical docs (`api`, `data-model`, `adr`).

## Setup (Quick)

1. Backend:
   - `cd backend`
   - `npm install`
   - `npm run migrate`
   - `npm run dev`
2. Frontends (separate terminals):
   - `cd admin && npm install && npm run dev`
   - `cd kiosk && npm install && npm run dev`
3. Optional seed:
   - `cd backend`
   - `npm run seed`
   - `npm run seed:products`

## Mandatory Codex Workflow

Every Codex agent working on this repository must follow `CODEX_RULES.md`:

- work from `/opt/boissons/Boissons_Magellan` and read this README first
- update `README.md` in the same session for every major functional change
- run and keep migrations aligned with schema changes
- verify changes, push the branch to GitHub, and restart `boissons-backend.service` after deployment-related work
- validate and reload/restart nginx when nginx configuration changes

## What The Project Does

Main workflow:

1. A user scans an RFID badge on the kiosk.
2. The kiosk calls the backend to identify the user.
   - If the badge is unknown, the kiosk can create a badge/account request with a name, email, and badge UID.
   - Requested badges do not work until an admin approves the request.
3. The kiosk displays available drinks and current stock.
4. The user places an order.
5. The backend stores the order, debits the user's prepaid balance, decrements stock, and records stock/account movements.
6. Admins can review debts, close billing periods, mark debts as paid, restock products, top up balances, and manage users/products.
7. User signup in admin requires an email.
8. Top-ups require a mandatory comment and payment metadata (payment date + payment method) for positive recharges.
9. If balance is insufficient at checkout, kiosk proposes a QR Code EPC v2 payment flow and records a pending payment declaration only after explicit user confirmation.

Business concepts implemented in the codebase:

- Users have an RFID badge and can be active or disabled.
- Users can have multiple RFID badge IDs mapped to the same account.
- Unknown kiosk badges can be submitted as pending badge requests for a new user.
- Users have a prepaid balance (`balance_cents`) that is debited at kiosk checkout.
- Products have current stock and a price history.
- Orders are recorded immediately when placed on the kiosk.
- Kiosk checkout is prepaid-only: orders are rejected if the balance would go below `0`.
- Kiosk checkout still authorizes a purchase even when current stock is `0` or negative.
- Prepaid kiosk orders are marked as paid from balance and excluded from debt closing.
- Debt can be viewed in two ways:
  - live/current debt from open orders
  - closed debt generated when an admin closes a billing period
- Admin actions are protected with an `x-admin-token` header.

## Project Overview for AI / LLM

### Purpose
Provide a local drink-selling platform with RFID identification, prepaid balance, stock tracking, debt closing, and QR fallback payment when balance is insufficient.

### Main components
- Backend API (`backend/src/index.ts` + `backend/src/routes/*`)
- Kiosk frontend (`kiosk/src/App.tsx`)
- Admin frontend (`admin/src/App.tsx` + `admin/src/pages/*`)
- SQLite DB (`backend/src/db/migrations/*.sql`)

### Data flow
1. Kiosk identifies user from badge (`/api/kiosk/identify`).
2. Kiosk loads products (`/api/kiosk/products`) and sends order (`/api/kiosk/order`).
3. Backend writes order/items, updates stock, updates balance (or debt/QR flow).
4. Admin manages users/products/stock/debts and verifies QR declarations.

### Key files
- Backend bootstrap: `backend/src/index.ts`
- Checkout logic: `backend/src/routes/order.ts`
- QR flow: `backend/src/routes/qrCode.ts`
- Kiosk UI flow: `kiosk/src/App.tsx`
- Admin routing: `admin/src/App.tsx`
- Migrations: `backend/src/db/migrations/`

### Entry points
- Backend: `backend/src/index.ts`
- Admin app: `admin/src/main.tsx`
- Kiosk app: `kiosk/src/main.tsx`

For compact deep-dive docs:
- `ARCHITECTURE.md`
- `docs/api.md`
- `docs/data-model.md`
- `docs/adr/`

## High-Level Architecture

The default deployed architecture is host-native:

- `nginx` on the VM: entrypoint on port `80`
- `boissons-backend.service`: Fastify API on port `3000`
- static kiosk frontend published under `/var/www/boissons/kiosk`
- static admin frontend published under `/var/www/boissons/admin`
- `boissons-backup.timer`: periodic SQLite backup timer

The SQLite database lives at `/var/lib/boissons/app.db`.

## Host VM Deployment

For a Docker-free deployment directly on the VM, use:

- `ops/vm/deploy-host.sh`

This script provisions and deploys the application stack directly on Ubuntu:

- installs required host packages, including `nginx`
- ensures Node.js 20 is available
- builds `backend`, `admin`, and `kiosk` on the VM
- publishes static files under `/var/www/boissons`
- installs `boissons-backend.service` in `systemd`
- installs a host nginx site that serves `/kiosk/`, `/admin/`, `/api/kiosk/`, and `/api/admin/`
- optionally installs a daily backup timer
Default runtime paths used by the script:

- database: `/var/lib/boissons/app.db`
- static files: `/var/www/boissons`
- backups: `/var/backups/boissons`

## Public URLs And Reverse Proxy Routes

Installed by `ops/vm/deploy-host.sh` into the host nginx configuration:

- `/` -> redirects to `/kiosk/`
- `/kiosk/` -> kiosk frontend
- `/admin/` -> redirects to `/admin/products`
- `/admin/products` -> admin frontend (SPA entry), IP-restricted
- `/api/kiosk/` -> kiosk API, IP-restricted
- `/api/admin/` -> admin API, IP-restricted

Current access restrictions in nginx:

- `/admin/` is only allowed from `172.16.0.111`
- `/api/admin/` is only allowed from `172.16.0.111`
- `/api/kiosk/` is allowed from `172.20.0.4`, `172.20.0.10`, `172.16.0.111`, and `172.19.0.9`

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
- `adminEmailSettingsRoutes`
- `qrCodeRoutes`

### Health

- `GET /health`
  - Simple healthcheck endpoint

### Kiosk API

- `POST /api/kiosk/identify`
  - Identifies a user from an RFID UID
  - Normalizes scanned values before lookup, including common AZERTY keyboard-wedge digit substitutions such as `à -> 0` and `ç -> 9`
  - Matches both `users.rfid_uid` and `user_badges.uid`
  - Request body: `{ uid: string }`

- `GET /api/kiosk/debt/:userId`
  - Returns the user debt summary
  - Includes:
    - current prepaid balance
    - unpaid closed debts
    - open debt since the last billing period
    - aggregated purchased items

- `GET /api/kiosk/products`
  - Lists active products visible on the kiosk
  - Includes current price, current stock, availability, and image slug
  - Products remain orderable even when stock is `0`; only products without a current price are blocked

- `POST /api/kiosk/order`
  - Creates an order for a user
  - Validates user status, product price, and available prepaid balance
  - Rejects the order if the user balance would go below `0`
  - Insufficient balance message returned by API:
    - `Solde insuffisant, merci de faire un virement au compte suivant : BE70 7512 1182 7125`
  - The kiosk checkout displays that message directly in the cart and opens a blocking modal when a logged-in user submits an order without enough balance.
  - From that modal, the user can choose `Payer par QR Code` to generate an EPC v2 QR code locally.
  - Decrements stock, debits the user balance, and writes stock/account movement rows

- `POST /api/kiosk/qr-code/prepare`
  - Prepares a QR Code EPC v2 payload for insufficient-balance checkout
  - Uses configurable banking settings (recipient, IBAN, BIC, remittance prefix)
  - Generates:
    - a random `UNIQUE_ID`
    - EPC payload
    - PNG QR code as data URL
    - signed intent token to bind `UNIQUE_ID + user + amount`
  - Does not insert any payment row at this stage
  - EPC remittance is explicitly forced in unstructured/free mode:
    - structured field stays empty
    - free remittance field carries `Boisson...UNIQUE_ID` text
    - structured-like references (`+++...+++`, `RF...`) are rejected by validation

- `POST /api/kiosk/qr-code/confirm`
  - Called only when user clicks `J'ai payé par QR Code`
  - Validates signed intent token, records payment declaration row, and commits kiosk order
  - Decrements stock like a normal kiosk sale at confirmation time
  - Stores:
    - `unique_id`
    - `user_id`
    - `amount_cents`
    - `created_at`
    - `status` (`unverified` by default)

- `POST /api/kiosk/account-detail/request`
  - Sends account detail by email for the identified user
  - Email contains all top-ups and all consumptions
  - Kiosk asks for confirmation before sending and confirms success after the email is sent

- `POST /api/kiosk/badge-request`
  - Creates a pending badge/account request from the kiosk
  - Request body: `{ name: string, email: string, rfid_uid: string }`
  - The badge is not usable until an admin approves the request

### Admin API

All admin endpoints require the `x-admin-token` header, validated in `backend/src/routes/admin/_auth.ts`.

Products:

- `GET /api/admin/products`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`
- `POST /api/admin/products/:id/price`
- `POST /api/admin/products/:id/image-upload`
  - Uploads a product image as PNG only
  - Requires `image_base64` only
  - Upload is automatically bound to the selected product
  - Backend generates a unique product-based filename and updates product image slug (cache-busting friendly)
- `DELETE /api/admin/products/:id`
  - Soft-deletes a product from the admin/kiosk lists while preserving history
- `POST /api/admin/products/:id/delete`
  - Alias used by the admin UI for product soft-delete in environments where `DELETE` is inconvenient

Stock / restock:

- `POST /api/admin/restock`
- `GET /api/admin/stocks/export.csv`
  - Exports stock list as CSV (`product_id,product_name,qty,is_active`)
- `POST /api/admin/stocks/import`
  - Imports stock CSV payload `{ csv: string }`
  - Applies CSV quantities as target stock values per product

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
  - `comment` is mandatory
  - Sends each concerned user an email extract with consumption details for the closed period
  - Includes close-period comment in the email body
  - Email is sent even when the period debt is `0` (for example, prepaid consumptions)
  - Email sending does not filter out disabled users
  - Response includes mail delivery summary (`mail.sent`, `mail.skipped`, `mail.failed`)

- `POST /api/admin/close-month`
  - Older monthly closing logic based on `monthly_debts`

Users:

- `GET /api/admin/users`
- `POST /api/admin/users`
  - Email is required
- `PATCH /api/admin/users/:id`
  - Updates user name, email, active status, and `local_access`
- `POST /api/admin/users/:id/badge`
- `DELETE /api/admin/users/:id/badge`
- `POST /api/admin/users/:id/topup`
  - `comment` is mandatory
  - For positive top-ups, `payment_date` (`YYYY-MM-DD`) and `payment_method` (`bank_transfer` or `cash`) are mandatory
- `GET /api/admin/users/export.csv`
  - Exports current users list as CSV
  - Includes: `id,name,email,is_active,local_access,balance_cents,rfid_uid,badge_uids,created_at,deleted_at`
- `POST /api/admin/users/import`
  - Imports users from CSV payload `{ csv: string }`
  - Upserts by `id` when present, creates otherwise
  - Replaces badge bindings for updated users
- `DELETE /api/admin/users/:id`
  - Soft-deletes a user from the admin list while preserving history
- `POST /api/admin/users/:id/delete`
  - Alias used by the admin UI for user soft-delete in environments where `DELETE` is inconvenient

- `GET /api/admin/topups`
  - Returns top-up log entries (used by admin top-up log page)
  - Query filters: `name`, `from`, `to`, `method`

Badge requests:

- `GET /api/admin/badge-requests`
  - Lists pending kiosk badge/account requests by default
  - Optional query: `status=pending|approved|rejected|all`
- `POST /api/admin/badge-requests/:id/approve`
  - Creates a new active user from the request and activates the requested badge
- `POST /api/admin/badge-requests/:id/reject`
  - Rejects a pending badge request

Email setup:

- `GET /api/admin/email-settings`
  - Returns SMTP host, port, secure mode, user, sender, and whether a password is configured
  - Never returns the SMTP password
- `PUT /api/admin/email-settings`
  - Saves SMTP settings to `backend/.env`
  - Updates the running backend process immediately and resets the cached mail transporter
  - An empty password keeps the existing configured password
- `POST /api/admin/email-settings/test`
  - Sends a test email to validate the SMTP account

QR Code payments:

- `GET /api/admin/qr-code`
  - Lists QR payment declarations with `unique_id`, user, amount, date/time, and status
- `PATCH /api/admin/qr-code/:id`
  - Updates status: `verified` or `unverified`
- `GET /api/admin/qr-code/settings`
  - Returns editable banking settings for EPC generation
- `PUT /api/admin/qr-code/settings`
  - Updates banking settings:
    - `recipient_name`
    - `iban`
    - `bic`
    - `remittance_prefix` (text-before-UNIQUE_ID)

## Frontend Structure

### Kiosk frontend

Location: `kiosk/`

Purpose:

- Wait for a badge scan
- Identify the user from direct badge scans, including newly added badges
- Let unknown users request a new badge/account by entering their name and email
- Display available drinks
- Build a cart
- Submit orders
- Show current account summary, including prepaid balance

Main files:

- `kiosk/src/App.tsx`: main kiosk flow, badge-scan capture, and API calls
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
- Manage users, multiple RFID badges, and prepaid balances
- Approve or reject kiosk badge/account requests
- Close periods
- Review and mark debts as paid
- Review top-up logs
- Review and verify QR Code payment declarations
- Edit QR Code banking information used by kiosk

Main files:

- `admin/src/App.tsx`: main layout and page navigation
- `admin/src/lib/api.ts`: fetch wrapper adding `x-admin-token`
- `admin/src/lib/types.ts`: shared frontend types
- `admin/src/pages/ProductsPage.tsx`: product listing, creation, rename, price updates, activation, and PNG upload bound to selected product
- `admin/src/pages/RestockPage.tsx`: stock input form and correction/restock submission, with CSV import/export for stock list
- `admin/src/pages/DebtsPage.tsx`: close period and manage debt payment state
- `admin/src/pages/TopupsLogPage.tsx`: top-up log with date/method/user filters
- `admin/src/pages/UsersPage.tsx`: user creation, email editing, activation, local-access toggle/listing, rename, multi-badge management, balance top-up, CSV import/export, and user removal
- `admin/src/pages/EmailSettingsPage.tsx`: SMTP sender-account setup and test email

## Database Structure

SQLite is initialized in `backend/src/db/db.ts`.

Migrations are stored in `backend/src/db/migrations/`:

- `001_init.sql`
- `002_billing_periods.sql`
- `003_accounts_badges_soft_delete.sql`
- `004_prepaid_orders.sql`
- `005_topup_payment_metadata.sql`
- `006_badge_requests.sql`
- `007_users_local_access.sql`
- `008_qr_code_payments.sql`

Core tables:

- `users`: users and RFID mapping
  - includes `local_access` (binary flag for physical room access listing)
- `user_badges`: multiple badge IDs per user
- `badge_requests`: kiosk-created badge/account requests awaiting admin approval
- `account_transactions`: prepaid balance ledger
  - includes `payment_date` and `payment_method` metadata for top-ups
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
│   ├── package.json
│   └── tsconfig.json
├── kiosk/
│   ├── public/
│   │   └── products/
│   ├── src/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── ops/
│   ├── backup/
│   │   └── boissons-backup.sh
│   └── vm/
│       └── deploy-host.sh
├── docs/
│   ├── adr/
│   ├── api.md
│   └── data-model.md
├── ARCHITECTURE.md
├── CODEX_RULES.md
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
- `PRODUCT_IMAGES_DIR`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

The SMTP variables can be edited from the admin `Email` page. They are stored in `backend/.env`; the password is write-only from the UI and is not returned by the API.
When `PRODUCT_IMAGES_DIR` is not set, product PNG uploads are saved to `/var/www/boissons/kiosk/products` when that folder exists.

### Required migration step

If the project is already deployed, you must run backend migrations before starting the updated app, because the new code depends on:

- user soft-delete support
- multiple user badge IDs
- prepaid user balances
- prepaid order tracking
- top-up payment metadata (`payment_date`, `payment_method`)
- user local-access flag (`users.local_access`)

### Frontends

From `kiosk/` or `admin/`:

- `npm install`
- `npm run dev`

### Host deployment

From the repository root:

- `sudo ops/vm/deploy-host.sh`

## Notes

- CORS is currently configured in `backend/src/index.ts` for `http://localhost:5173`.
- Product images are resolved through an image slug mapping stored in `data/product_slugs.json`.
- There are two debt models in the database: older `monthly_debts` logic and current `billing_periods` / `period_debts` logic. The current admin UI uses the billing period flow.
- Kiosk orders are now prepaid from `users.balance_cents`; only unpaid orders are included in period/month debt closing.
- User and product removal are implemented as soft deletes to preserve historical data.
- If you change host nginx configuration, validate and reload it:
  - `sudo nginx -t`
  - `sudo systemctl reload nginx`
