-- 001_init.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id        TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- USERS
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT,
  rfid_uid   TEXT UNIQUE,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ADMINS (liste fermée)
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- PRICE HISTORY
CREATE TABLE IF NOT EXISTS product_prices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  price_cents INTEGER NOT NULL CHECK(price_cents >= 0),
  starts_at  TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_product_prices_product_starts
ON product_prices(product_id, starts_at DESC);

-- STOCK CURRENT
CREATE TABLE IF NOT EXISTS stock_current (
  product_id INTEGER PRIMARY KEY,
  qty        INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

-- STOCK MOVES
CREATE TABLE IF NOT EXISTS stock_moves (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  move_id   TEXT NOT NULL,
  ts        TEXT NOT NULL DEFAULT (datetime('now')),
  product_id INTEGER NOT NULL,
  delta_qty INTEGER NOT NULL,
  reason    TEXT NOT NULL CHECK(reason IN ('sale','restock','correction')),
  ref_id    TEXT,
  comment   TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_stock_moves_move_id ON stock_moves(move_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_product_ts ON stock_moves(product_id, ts);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id          TEXT PRIMARY KEY,
  ts          TEXT NOT NULL DEFAULT (datetime('now')),
  user_id     INTEGER NOT NULL,
  month_key   TEXT NOT NULL,
  total_cents INTEGER NOT NULL CHECK(total_cents >= 0),
  status      TEXT NOT NULL DEFAULT 'committed' CHECK(status IN ('committed','cancelled')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_month_user ON orders(month_key, user_id);
CREATE INDEX IF NOT EXISTS idx_orders_ts ON orders(ts);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id        TEXT NOT NULL,
  product_id      INTEGER NOT NULL,
  qty             INTEGER NOT NULL CHECK(qty > 0),
  unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents >= 0),
  FOREIGN KEY(order_id) REFERENCES orders(id),
  FOREIGN KEY(product_id) REFERENCES products(id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- MONTHLY DEBTS
CREATE TABLE IF NOT EXISTS monthly_debts (
  month_key        TEXT NOT NULL,
  user_id          INTEGER NOT NULL,
  amount_cents     INTEGER NOT NULL CHECK(amount_cents >= 0),
  status           TEXT NOT NULL DEFAULT 'invoiced' CHECK(status IN ('invoiced','paid')),
  generated_at     TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at          TEXT,
  paid_by_admin_id INTEGER,
  PRIMARY KEY(month_key, user_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(paid_by_admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_debts_status ON monthly_debts(status);

-- MAIL LOG (optionnel mais utile)
CREATE TABLE IF NOT EXISTS debt_mail_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  month_key TEXT NOT NULL,
  user_id   INTEGER NOT NULL,
  ts        TEXT NOT NULL DEFAULT (datetime('now')),
  status    TEXT NOT NULL CHECK(status IN ('sent','skipped','failed')),
  error     TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

