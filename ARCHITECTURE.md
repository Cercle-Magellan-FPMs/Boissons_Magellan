# Architecture

## System Overview
Boissons Magellan is a 3-tier system for RFID-based drink sales:
- `kiosk` (React): badge scan, cart, checkout.
- `admin` (React): products, stock, users, debts, email setup, QR payments.
- `backend` (Fastify + SQLite): business rules, persistence, email, EPC QR generation.

Production runtime is host-native:
- `nginx` serves static `kiosk` / `admin` and proxies `/api/*` to backend.
- `boissons-backend.service` runs Fastify on port `3000`.
- SQLite database path: `/var/lib/boissons/app.db`.

## Main Components
- `backend/src/index.ts`: API bootstrap and route registration.
- `backend/src/routes/`: domain routes (`kiosk`, `order`, `qrCode`, `admin/*`).
- `backend/src/db/migrations/*.sql`: schema evolution.
- `backend/src/lib/mailer.ts`: SMTP integration.
- `admin/src/App.tsx`: admin navigation by URL path.
- `kiosk/src/App.tsx`: kiosk state machine (`badge`, `products`, `thanks`).

## Data Flow
### 1) Standard prepaid checkout
1. Badge scan in kiosk.
2. `POST /api/kiosk/identify` returns user.
3. `GET /api/kiosk/products` returns catalog + price + stock + image.
4. `POST /api/kiosk/order` validates balance, creates order, decrements stock, debits account balance.

### 2) Insufficient balance with QR
1. Kiosk gets 409 on `/api/kiosk/order`.
2. `POST /api/kiosk/qr-code/prepare` creates EPC payload + QR image + signed intent token (no DB write).
3. User clicks `J'ai payé par QR Code`.
4. `POST /api/kiosk/qr-code/confirm` validates token, records QR declaration, commits order, decrements stock.
5. Admin verifies later via `/api/admin/qr-code`.

### 3) Period close
1. Admin runs `POST /api/admin/close-period` with mandatory comment.
2. Backend creates `billing_periods` + `period_debts` from unpaid orders.
3. Backend sends account extract emails for the closed period.

## Technical Choices
- **SQLite**: simple local durability, easy backup/restore.
- **Migration-first schema**: all persistent changes go through SQL migrations.
- **Server-side pricing**: order totals are recalculated in backend.
- **Soft delete on core entities** (`users`, `products`): preserve history integrity.
- **Host deployment (systemd + nginx)**: simpler operations than container orchestration for this scope.
- **Signed QR intent token**: binds user/amount/unique_id and prevents client-side tampering.

## Related Docs
- API: `docs/api.md`
- Data model: `docs/data-model.md`
- Architecture decisions: `docs/adr/`
