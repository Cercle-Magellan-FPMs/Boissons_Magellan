import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDB } from "../db/db.js";

function getMonthKeyParisLike(date = new Date()) {
  // simple: basé sur la date locale machine (tu mettras TZ Europe/Paris sur RPi)
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function orderRoutes(app: FastifyInstance) {
  app.post("/api/kiosk/order", async (request, reply) => {
    const schema = z.object({
      user_id: z.number().int().positive(),
      items: z.array(z.object({
        product_id: z.number().int().positive(),
        qty: z.number().int().positive(),
      })).min(1),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const { user_id, items } = parsed.data;

    const db = getDB();

    const tx = db.transaction(() => {
      const user = db.prepare(`
        SELECT id, is_active, balance_cents
        FROM users
        WHERE id = ?
          AND deleted_at IS NULL
      `).get(user_id) as any;
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.is_active !== 1) throw new Error("USER_DISABLED");

      // Validate product existence and price. Stock can go negative on checkout.
      let total = 0;
      const resolved = items.map((it) => {
        const product = db.prepare(
          `SELECT id
           FROM products
           WHERE id = ?
             AND deleted_at IS NULL
             AND is_active = 1`
        ).get(it.product_id) as any;
        if (!product) throw new Error("PRODUCT_NOT_FOUND");

        const priceRow = db.prepare(
          `SELECT pp.price_cents
           FROM product_prices pp
           JOIN products p ON p.id = pp.product_id
           WHERE pp.product_id = ?
             AND p.deleted_at IS NULL
             AND pp.starts_at <= datetime('now')
           ORDER BY pp.starts_at DESC
           LIMIT 1`
        ).get(it.product_id) as any;

        if (!priceRow) throw new Error("PRICE_MISSING");

        const unit = Number(priceRow.price_cents);
        total += unit * it.qty;

        return { ...it, unit_price_cents: unit };
      });

      const currentBalance = Number(user.balance_cents ?? 0);
      if (currentBalance < total) throw new Error("INSUFFICIENT_BALANCE");

      const orderId = randomUUID();
      const monthKey = getMonthKeyParisLike();

      db.prepare(
        `INSERT INTO orders (id, user_id, month_key, total_cents, status, paid_from_balance)
         VALUES (?, ?, ?, ?, 'committed', 1)`
      ).run(orderId, user_id, monthKey, total);

      const insertItem = db.prepare(
        `INSERT INTO order_items (order_id, product_id, qty, unit_price_cents)
         VALUES (?, ?, ?, ?)`
      );

      const moveId = randomUUID();
      const insertMove = db.prepare(
        `INSERT INTO stock_moves (move_id, product_id, delta_qty, reason, ref_id, comment)
         VALUES (?, ?, ?, 'sale', ?, ?)`
      );

      const ensureStockRow = db.prepare(
        `INSERT OR IGNORE INTO stock_current (product_id, qty) VALUES (?, 0)`
      );
      const updateStock = db.prepare(
        `UPDATE stock_current SET qty = qty - ? WHERE product_id = ?`
      );

      db.prepare(`
        UPDATE users
        SET balance_cents = balance_cents - ?
        WHERE id = ?
      `).run(total, user_id);

      db.prepare(`
        INSERT INTO account_transactions (id, user_id, delta_cents, reason, comment)
        VALUES (?, ?, ?, 'purchase', ?)
      `).run(randomUUID(), user_id, -total, "achat kiosk");

      for (const r of resolved) {
        insertItem.run(orderId, r.product_id, r.qty, r.unit_price_cents);
        insertMove.run(moveId, r.product_id, -r.qty, orderId, "vente kiosk");
        ensureStockRow.run(r.product_id);
        updateStock.run(r.qty, r.product_id);
      }

      return {
        order_id: orderId,
        total_cents: total,
        balance_cents: currentBalance - total,
      };
    });

    try {
      const result = tx();
      return reply.send(result);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("USER_DISABLED")) return reply.code(403).send({ error: "User disabled" });
      if (msg.includes("USER_NOT_FOUND")) return reply.code(404).send({ error: "User not found" });
      if (msg.includes("PRODUCT_NOT_FOUND")) return reply.code(404).send({ error: "Product not found" });
      if (msg.includes("INSUFFICIENT_BALANCE")) return reply.code(409).send({ error: "Insufficient balance" });
      if (msg.includes("PRICE_MISSING")) return reply.code(500).send({ error: "Price missing" });
      return reply.code(500).send({ error: "Internal error" });
    }
  });
}
