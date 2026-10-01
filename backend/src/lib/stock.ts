import type { Database } from "better-sqlite3";

type Location = "200" | "500";

export function readStock(db: Database, productId: number) {
  db.prepare("INSERT OR IGNORE INTO stock_current (product_id, qty) VALUES (?, 0)").run(productId);
  return db.prepare("SELECT qty, qty_200, qty_500 FROM stock_current WHERE product_id = ?")
    .get(productId) as { qty: number; qty_200: number; qty_500: number };
}

export function changeStock(db: Database, productId: number, delta200: number, delta500: number) {
  readStock(db, productId);
  db.prepare(`UPDATE stock_current
    SET qty = qty + ?, qty_200 = qty_200 + ?, qty_500 = qty_500 + ?
    WHERE product_id = ?`).run(delta200 + delta500, delta200, delta500, productId);
}

export function sellStock(db: Database, productId: number, qty: number) {
  const stock = readStock(db, productId);
  const from500 = Math.min(qty, Math.max(stock.qty_500, 0));
  const delta200 = -(qty - from500);
  const delta500 = -from500;
  changeStock(db, productId, delta200, delta500);
  return { delta200, delta500 };
}

export function transferStock(db: Database, productId: number, from: Location, qty: number) {
  const stock = readStock(db, productId);
  if (stock[from === "200" ? "qty_200" : "qty_500"] < qty) return false;
  changeStock(db, productId, from === "200" ? -qty : qty, from === "500" ? -qty : qty);
  return true;
}
