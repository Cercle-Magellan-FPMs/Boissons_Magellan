# Data Model

This project uses SQLite. Migrations are in `backend/src/db/migrations/`.

## Core Tables
### users
Main account table.
- `id` PK
- `name`, `email`
- `rfid_uid` (legacy single badge), `is_active`
- `balance_cents` prepaid balance
- `local_access` binary flag for local access listing
- `deleted_at` soft delete marker

### user_badges
Additional badge IDs per user.
- `id` PK
- `user_id` FK -> `users.id`
- `uid` unique badge value

### badge_requests
Pending account/badge requests from kiosk.
- `id` UUID-like text PK
- `name`, `email`, `uid`, `normalized_uid`
- `status` (`pending`, `approved`, `rejected`)

### products
Catalog entries.
- `id` PK
- `name` unique
- `is_active`
- `deleted_at` soft delete marker

### product_prices
Price history by product.
- `id` PK
- `product_id` FK -> `products.id`
- `price_cents`
- `starts_at` effective timestamp

### stock_current
Current stock snapshot.
- `product_id` PK/FK -> `products.id`
- `qty`

### stock_moves
Immutable stock ledger.
- `id` PK
- `move_id` grouping id
- `product_id`, `delta_qty`
- `reason` (`sale`, `restock`, `correction`)
- `ref_id`, `comment`, `ts`

### orders
Committed kiosk sales.
- `id` text PK
- `user_id` FK -> `users.id`
- `month_key`, `total_cents`, `status`
- `paid_from_balance` (`1` prepaid immediate, `0` debt/QR flow)

### order_items
Order lines.
- `id` PK
- `order_id` FK -> `orders.id`
- `product_id` FK -> `products.id`
- `qty`, `unit_price_cents`

### account_transactions
User account ledger.
- `id` text PK
- `user_id` FK -> `users.id`
- `delta_cents` (+ topup / - purchase / adjustment)
- `reason` (`topup`, `adjustment`, `purchase`)
- `payment_date`, `payment_method` for topups

### billing_periods
Closed periods.
- `id` text PK
- `start_ts`, `end_ts`, `comment`

### period_debts
Per-user debt generated at close.
- `(period_id, user_id)` composite PK
- `amount_cents`, `status` (`invoiced`, `paid`), `paid_at`

### qr_payment_settings
Single-row table (`id = 1`) for EPC QR config.
- `recipient_name`, `iban`, `bic`, `remittance_prefix`

### qr_code_payments
Declared QR payments (verification happens later).
- `id` PK
- `unique_id` unique external reference
- `user_id` FK -> `users.id`
- `amount_cents`, `created_at`
- `status` (`verified`, `unverified`), `verified_at`

## Legacy Tables Still Present
- `admins`
- `monthly_debts`
- `debt_mail_log`
- `schema_migrations`

## Key Integrity Rules
- Product/user deletions are soft to preserve historical joins.
- Order totals are immutable snapshots (`total_cents` + `order_items.unit_price_cents`).
- Stock is both snapshot (`stock_current`) and audit trail (`stock_moves`).
- QR `unique_id` is unique at DB level.
