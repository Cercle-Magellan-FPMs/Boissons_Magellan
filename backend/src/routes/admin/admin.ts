import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";

export async function adminRoutes(app: FastifyInstance) {
  // --- PRODUCTS ---

  // List products + stock + current price
  app.get("/api/admin/products", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const db = getDB();
    const rows = db.prepare(`
      SELECT
        p.id,
        p.name,
        p.is_active,
        COALESCE(sc.qty, 0) AS qty,
        (
          SELECT pp.price_cents
          FROM product_prices pp
          WHERE pp.product_id = p.id AND pp.starts_at <= datetime('now')
          ORDER BY pp.starts_at DESC
          LIMIT 1
        ) AS price_cents
      FROM products p
      LEFT JOIN stock_current sc ON sc.product_id = p.id
      ORDER BY p.name ASC
    `).all();

    return { products: rows };
  });

  // Create product
  app.post("/api/admin/products", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const schema = z.object({
      name: z.string().min(1),
      is_active: z.boolean().optional().default(true),
      // optionnel: tu peux créer direct un prix
      price_cents: z.number().int().min(0).optional(),
      // optionnel: stock initial
      initial_qty: z.number().int().min(0).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const { name, is_active, price_cents, initial_qty } = parsed.data;
    const db = getDB();

    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO products (name, is_active) VALUES (?, ?)`)
        .run(name.trim(), is_active ? 1 : 0);

      const p = db.prepare(`SELECT id FROM products WHERE name = ?`).get(name.trim()) as any;

      db.prepare(`INSERT OR IGNORE INTO stock_current (product_id, qty) VALUES (?, 0)`)
        .run(p.id);

      if (typeof initial_qty === "number" && initial_qty > 0) {
        const moveId = randomUUID();
        db.prepare(`UPDATE stock_current SET qty = qty + ? WHERE product_id = ?`)
          .run(initial_qty, p.id);

        db.prepare(`
          INSERT INTO stock_moves (move_id, product_id, delta_qty, reason, ref_id, comment)
          VALUES (?, ?, ?, 'restock', NULL, ?)
        `).run(moveId, p.id, initial_qty, "stock initial");
      }

      if (typeof price_cents === "number") {
        db.prepare(`
          INSERT INTO product_prices (product_id, price_cents, starts_at)
          VALUES (?, ?, datetime('now'))
        `).run(p.id, price_cents);
      }

      return p.id as number;
    });

    try {
      const productId = tx();
      return reply.send({ ok: true, product_id: productId });
    } catch (e: any) {
      // name unique => conflit
      if (String(e?.message || "").includes("UNIQUE")) {
        return reply.code(409).send({ error: "Product name already exists" });
      }
      return reply.code(500).send({ error: "Internal error" });
    }
  });

  // Toggle / rename product (désactiver = retirer du kiosk)
  app.patch("/api/admin/products/:id", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      is_active: z.boolean().optional(),
    });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const db = getDB();
    const { id } = p.data;
    const { name, is_active } = b.data;

    const existing = db.prepare(`SELECT id FROM products WHERE id=?`).get(id);
    if (!existing) return reply.code(404).send({ error: "Product not found" });

    if (name !== undefined) {
      try {
        db.prepare(`UPDATE products SET name=? WHERE id=?`).run(name.trim(), id);
      } catch (e: any) {
        if (String(e?.message || "").includes("UNIQUE")) {
          return reply.code(409).send({ error: "Product name already exists" });
        }
        throw e;
      }
    }

    if (is_active !== undefined) {
      db.prepare(`UPDATE products SET is_active=? WHERE id=?`).run(is_active ? 1 : 0, id);
    }

    return reply.send({ ok: true });
  });

  // Set price (historisé)
  app.post("/api/admin/products/:id/price", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const bodySchema = z.object({
      price_cents: z.number().int().min(0),
      starts_at: z.string().optional(), // optionnel (ISO), sinon now
    });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const { id } = p.data;
    const { price_cents, starts_at } = b.data;

    const db = getDB();
    const exists = db.prepare(`SELECT 1 FROM products WHERE id=?`).get(id);
    if (!exists) return reply.code(404).send({ error: "Product not found" });

    if (starts_at) {
      db.prepare(`
        INSERT INTO product_prices (product_id, price_cents, starts_at)
        VALUES (?, ?, ?)
      `).run(id, price_cents, starts_at);
    } else {
      db.prepare(`
        INSERT INTO product_prices (product_id, price_cents, starts_at)
        VALUES (?, ?, datetime('now'))
      `).run(id, price_cents);
    }

    return reply.send({ ok: true });
  });

  // --- RESTOCK ---

  app.post("/api/admin/restock", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const schema = z.object({
      items: z.array(z.object({
        product_id: z.number().int().positive(),
        qty: z.number().int().positive(),
      })).min(1),
      comment: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const { items, comment } = parsed.data;
    const db = getDB();

    const tx = db.transaction(() => {
      const moveId = randomUUID();

      const ensureStockRow = db.prepare(
        `INSERT OR IGNORE INTO stock_current (product_id, qty) VALUES (?, 0)`
      );
      const updateStock = db.prepare(
        `UPDATE stock_current SET qty = qty + ? WHERE product_id = ?`
      );
      const insertMove = db.prepare(`
        INSERT INTO stock_moves (move_id, product_id, delta_qty, reason, ref_id, comment)
        VALUES (?, ?, ?, 'restock', NULL, ?)
      `);

      for (const it of items) {
        const exists = db.prepare(`SELECT 1 FROM products WHERE id=?`).get(it.product_id);
        if (!exists) throw new Error("PRODUCT_NOT_FOUND");

        ensureStockRow.run(it.product_id);
        updateStock.run(it.qty, it.product_id);
        insertMove.run(moveId, it.product_id, it.qty, comment ?? null);
      }

      return moveId;
    });

    try {
      const move_id = tx();
      return reply.send({ ok: true, move_id });
    } catch (e: any) {
      if (String(e?.message || "").includes("PRODUCT_NOT_FOUND")) {
        return reply.code(404).send({ error: "Product not found" });
      }
      return reply.code(500).send({ error: "Internal error" });
    }
  });
}
