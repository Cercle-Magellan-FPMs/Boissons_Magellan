# API Reference (Concise)

Base path is served by backend (`/api/*`).
Admin endpoints require `x-admin-token`.

## Health
- `GET /health`

## Kiosk
### Auth / user
- `POST /api/kiosk/identify`
  - body: `{ uid }`
- `POST /api/kiosk/badge-request`
  - body: `{ name, email, rfid_uid }`
- `GET /api/kiosk/debt/:userId`
- `POST /api/kiosk/account-detail/request`
  - body: `{ user_id }`

### Catalog and checkout
- `GET /api/kiosk/products`
- `POST /api/kiosk/order`
  - body: `{ user_id, items: [{ product_id, qty }] }`
  - prepaid path (`paid_from_balance=1`), decrements stock

### QR insufficient-balance flow
- `POST /api/kiosk/qr-code/prepare`
  - body: `{ user_id, amount_cents }`
  - returns: `{ unique_id, remittance, epc_payload, qr_code_data_url, intent_token, ... }`
  - no write side effect
- `POST /api/kiosk/qr-code/confirm`
  - body: `{ user_id, amount_cents, unique_id, intent_token, items[] }`
  - creates `qr_code_payments` row + commits order (`paid_from_balance=0`) + decrements stock

## Admin
### Products
- `GET /api/admin/products`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`
- `POST /api/admin/products/:id/price`
- `POST /api/admin/products/:id/image-upload`
- `DELETE /api/admin/products/:id`
- `POST /api/admin/products/:id/delete`

### Stock
- `POST /api/admin/restock`
- `GET /api/admin/stocks/export.csv`
- `POST /api/admin/stocks/import`

### Users
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`
- `POST /api/admin/users/:id/badge`
- `DELETE /api/admin/users/:id/badge`
- `POST /api/admin/users/:id/topup`
- `DELETE /api/admin/users/:id`
- `POST /api/admin/users/:id/delete`
- `GET /api/admin/users/export.csv`
- `POST /api/admin/users/import`

### Debts / periods
- `GET /api/admin/debts`
- `POST /api/admin/debts/pay`
- `POST /api/admin/debts/unpay`
- `GET /api/admin/debts/summary`
- `GET /api/admin/debts/summary-current`
- `GET /api/admin/debts/user/:userId`
- `POST /api/admin/close-period`
- `POST /api/admin/close-month` (legacy)

### Topups log
- `GET /api/admin/topups`

### Badge requests
- `GET /api/admin/badge-requests`
- `POST /api/admin/badge-requests/:id/approve`
- `POST /api/admin/badge-requests/:id/reject`

### Email settings
- `GET /api/admin/email-settings`
- `PUT /api/admin/email-settings`
- `POST /api/admin/email-settings/test`

### QR admin
- `GET /api/admin/qr-code`
- `PATCH /api/admin/qr-code/:id`
- `GET /api/admin/qr-code/settings`
- `PUT /api/admin/qr-code/settings`

## Error Semantics (common)
- `400`: invalid payload/query
- `403`: disabled/forbidden
- `404`: entity not found
- `409`: business conflict (insufficient balance, duplicate, mismatch)
- `500`: internal/config/runtime error
