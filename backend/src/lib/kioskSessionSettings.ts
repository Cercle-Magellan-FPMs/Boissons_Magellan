import { getDB } from "../db/db.js";

export const DEFAULT_IDLE_TIMEOUT_SECONDS = 60;
export const MIN_IDLE_TIMEOUT_SECONDS = 10;
export const MAX_IDLE_TIMEOUT_SECONDS = 3600;

export type KioskSessionSettings = {
    idle_timeout_seconds: number;
    updated_at: string;
};

export function loadKioskSessionSettings(): KioskSessionSettings {
    const db = getDB();
    const row = db
        .prepare(
            `
      SELECT idle_timeout_seconds, updated_at
      FROM kiosk_session_settings
      WHERE id = 1
    `,
        )
        .get() as KioskSessionSettings | undefined;

    if (row) return row;

    db.prepare(
        `
      INSERT OR IGNORE INTO kiosk_session_settings (id, idle_timeout_seconds)
      VALUES (1, ?)
    `,
    ).run(DEFAULT_IDLE_TIMEOUT_SECONDS);

    return {
        idle_timeout_seconds: DEFAULT_IDLE_TIMEOUT_SECONDS,
        updated_at: new Date().toISOString(),
    };
}

export function saveKioskSessionSettings(idleTimeoutSeconds: number) {
    const db = getDB();
    db.prepare(
        `
      INSERT INTO kiosk_session_settings (id, idle_timeout_seconds, updated_at)
      VALUES (1, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        idle_timeout_seconds = excluded.idle_timeout_seconds,
        updated_at = datetime('now')
    `,
    ).run(idleTimeoutSeconds);

    return loadKioskSessionSettings();
}
