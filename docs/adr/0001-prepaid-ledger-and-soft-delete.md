# ADR 0001 - Prepaid Ledger + Soft Delete

## Context
The system needs traceable purchases, stock history, and user/product lifecycle without breaking historical reports.

## Decision
- Use ledger-style tables:
  - `account_transactions` for balance changes
  - `stock_moves` for inventory changes
- Keep `orders` + immutable `order_items.unit_price_cents` snapshots.
- Use soft delete (`deleted_at`) on `users` and `products`.

## Consequences
- Historical joins remain valid after deactivation/removal.
- Auditing is easier (append-only movement logs).
- Queries are slightly more complex (`deleted_at IS NULL` filters).
