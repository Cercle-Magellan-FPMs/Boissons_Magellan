import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { changeStock, readStock, sellStock, transferStock } from "./stock.js";

test("stock 200/500, transfert et ventes conservent le total", () => {
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE stock_current (
    product_id INTEGER PRIMARY KEY,
    qty INTEGER NOT NULL DEFAULT 0,
    qty_200 INTEGER NOT NULL DEFAULT 0,
    qty_500 INTEGER NOT NULL DEFAULT 0
  )`);
  changeStock(db, 1, 10, 0);
  assert.equal(transferStock(db, 1, "200", 6), true);
  assert.deepEqual(readStock(db, 1), { qty: 10, qty_200: 4, qty_500: 6 });
  assert.equal(transferStock(db, 1, "500", 7), false);

  const sale = sellStock(db, 1, 8);
  assert.deepEqual(sale, { delta200: -2, delta500: -6 });
  assert.deepEqual(readStock(db, 1), { qty: 2, qty_200: 2, qty_500: 0 });

  changeStock(db, 1, -sale.delta200, -sale.delta500);
  assert.deepEqual(readStock(db, 1), { qty: 10, qty_200: 4, qty_500: 6 });
  db.close();
});
