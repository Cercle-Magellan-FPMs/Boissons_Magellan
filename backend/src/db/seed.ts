import { initDB, getDB } from "./db.js";

initDB();
const db = getDB();

function insertUser(name: string, email: string, rfidUid: string, isActive: number) {
  const existing = db.prepare(`SELECT id FROM users WHERE name = ?`).get(name) as any;
  if (existing) return;

  const result = db.prepare(`
    INSERT INTO users (name, email, rfid_uid, is_active, balance_cents)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, email, rfidUid, isActive, 1000);

  const userId = Number(result.lastInsertRowid);
  db.prepare(`
    INSERT OR IGNORE INTO user_badges (user_id, uid)
    VALUES (?, ?)
  `).run(userId, rfidUid);
}

insertUser("Raphael", "raphael@example.com", "TEST123", 1);
insertUser("User Bloqué", "blocked@example.com", "BLOCK999", 0);

console.log("Seed OK");
