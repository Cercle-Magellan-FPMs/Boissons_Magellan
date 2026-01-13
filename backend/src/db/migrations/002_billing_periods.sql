-- 002_billing_periods.sql

CREATE TABLE IF NOT EXISTS billing_periods (
  id TEXT PRIMARY KEY,
  start_ts TEXT NOT NULL,
  end_ts TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  comment TEXT
);

CREATE TABLE IF NOT EXISTS period_debts (
  period_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'invoiced' CHECK(status IN ('invoiced','paid')),
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at TEXT,
  PRIMARY KEY (period_id, user_id),
  FOREIGN KEY(period_id) REFERENCES billing_periods(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_billing_periods_end_ts ON billing_periods(end_ts);
CREATE INDEX IF NOT EXISTS idx_period_debts_status ON period_debts(status);
