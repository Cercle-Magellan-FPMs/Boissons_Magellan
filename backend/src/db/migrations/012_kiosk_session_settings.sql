CREATE TABLE IF NOT EXISTS kiosk_session_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  idle_timeout_seconds INTEGER NOT NULL DEFAULT 60 CHECK (idle_timeout_seconds BETWEEN 10 AND 3600),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO kiosk_session_settings (id, idle_timeout_seconds)
VALUES (1, 60);
