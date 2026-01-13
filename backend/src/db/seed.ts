import { initDB, getDB } from "./db.js";

initDB();
const db = getDB();

db.prepare(`
  INSERT OR IGNORE INTO users (name, email, rfid_uid, is_active)
  VALUES (?, ?, ?, ?)
`).run("Raphael", "raphael@example.com", "TEST123", 1);

db.prepare(`
  INSERT OR IGNORE INTO users (name, email, rfid_uid, is_active)
  VALUES (?, ?, ?, ?)
`).run("User Bloqué", "blocked@example.com", "BLOCK999", 0);

console.log("Seed OK");
