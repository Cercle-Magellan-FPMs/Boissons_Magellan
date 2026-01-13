import fs from "fs";
import path from "path";
import { initDB, getDB } from "./db.js";

function getMigrationId(filename: string) {
  return filename.replace(".sql", "");
}

function run() {
  initDB();
  const db = getDB();
  db.exec("PRAGMA foreign_keys = ON;");

  const migrationsDir = path.resolve("src/db/migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db.prepare("SELECT id FROM schema_migrations").all().map((r: any) => r.id)
  );

  const insertApplied = db.prepare(
    "INSERT INTO schema_migrations (id) VALUES (?)"
  );

  for (const file of files) {
    const id = getMigrationId(file);
    if (applied.has(id)) continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8");

    const tx = db.transaction(() => {
      db.exec(sql);
      insertApplied.run(id);
    });

    console.log(`Applying migration: ${id}`);
    tx();
  }

  console.log("Migrations OK");
}

run();
