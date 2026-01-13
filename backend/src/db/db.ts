import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.DB_PATH || "./data/app.db";

let db: Database.Database;

export function initDB() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);

  db.pragma("journal_mode = WAL");
  console.log("SQLite DB ready");
}

export function getDB() {
  if (!db) throw new Error("DB not initialized");
  return db;
}
