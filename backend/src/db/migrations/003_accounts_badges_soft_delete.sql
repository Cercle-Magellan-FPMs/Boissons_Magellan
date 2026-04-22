ALTER TABLE users ADD COLUMN balance_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN deleted_at TEXT;

ALTER TABLE products ADD COLUMN deleted_at TEXT;

CREATE TABLE IF NOT EXISTS user_badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  uid TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);

INSERT OR IGNORE INTO user_badges (user_id, uid)
SELECT id, rfid_uid
FROM users
WHERE rfid_uid IS NOT NULL
  AND TRIM(rfid_uid) <> '';

CREATE TABLE IF NOT EXISTS account_transactions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  delta_cents INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('topup','adjustment','purchase')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_account_transactions_user_created
ON account_transactions(user_id, created_at DESC);
