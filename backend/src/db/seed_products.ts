import { initDB, getDB } from "./db.js";

initDB();
const db = getDB();

function upsertProduct(name: string, priceCents: number, qty: number) {
  db.prepare(
    `INSERT OR IGNORE INTO products (name, is_active) VALUES (?, 1)`
  ).run(name);

  const product = db.prepare(`SELECT id FROM products WHERE name = ?`).get(name) as { id: number };

  // Prix: on ajoute un prix "actif maintenant" seulement s'il n'y en a pas déjà un
  const existingPrice = db.prepare(
    `SELECT 1 FROM product_prices WHERE product_id = ? LIMIT 1`
  ).get(product.id);

  if (!existingPrice) {
    db.prepare(
      `INSERT INTO product_prices (product_id, price_cents, starts_at)
       VALUES (?, ?, datetime('now'))`
    ).run(product.id, priceCents);
  }

  // Stock current
  db.prepare(
    `INSERT OR IGNORE INTO stock_current (product_id, qty) VALUES (?, ?)`
  ).run(product.id, qty);

  // Si déjà présent, on ne force pas (tu peux changer si tu veux)
}

upsertProduct("Coca", 100, 10);
upsertProduct("Ice Tea", 120, 8);
upsertProduct("Eau", 60, 20);

console.log("Seed products OK");
