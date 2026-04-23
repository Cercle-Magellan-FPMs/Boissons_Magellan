CREATE TABLE IF NOT EXISTS badge_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  uid TEXT NOT NULL,
  normalized_uid TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  approved_user_id INTEGER,
  FOREIGN KEY(approved_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_badge_requests_status_requested
ON badge_requests(status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_requests_pending_uid
ON badge_requests(normalized_uid)
WHERE status = 'pending';
