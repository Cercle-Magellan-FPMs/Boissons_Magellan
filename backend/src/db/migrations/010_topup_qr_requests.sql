CREATE TABLE IF NOT EXISTS topup_qr_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unique_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','verified','rejected')),
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    verified_at TEXT,
    verified_by_admin_id INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(verified_by_admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_topup_qr_requests_user_id
ON topup_qr_requests(user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_topup_qr_requests_status
ON topup_qr_requests(status, requested_at DESC);
