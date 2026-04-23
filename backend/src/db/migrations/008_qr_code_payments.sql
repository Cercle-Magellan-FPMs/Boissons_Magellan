CREATE TABLE IF NOT EXISTS qr_payment_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  recipient_name TEXT NOT NULL,
  iban TEXT NOT NULL,
  bic TEXT NOT NULL,
  remittance_prefix TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO qr_payment_settings (id, recipient_name, iban, bic, remittance_prefix)
VALUES (1, 'Cercle Magellan', 'BE70751211827125', 'NICABEBBXXX', 'Boisson');

CREATE TABLE IF NOT EXISTS qr_code_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unique_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'unverified' CHECK (status IN ('verified', 'unverified')),
  verified_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_qr_code_payments_created_at
ON qr_code_payments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_code_payments_user_id
ON qr_code_payments(user_id, created_at DESC);
