import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDB } from "../../db/db.js";
import { loadProductSlugs, normalizeSlug, setProductSlug } from "../../lib/productSlug.js";
import { requireAdmin } from "./_auth.js";

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === "\"") {
        if (text[i + 1] === "\"") {
          field += "\"";
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }

    if (char === "\r") {
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export async function adminRoutes(app: FastifyInstance) {
  async function softDeleteProduct(id: number) {
    const db = getDB();

    const existing = db.prepare(`
      SELECT id FROM products WHERE id=? AND deleted_at IS NULL
    `).get(id);
    if (!existing) return { error: "Product not found", status: 404 as const };

    db.prepare(`
      UPDATE products
      SET is_active = 0,
          deleted_at = datetime('now')
      WHERE id = ?
    `).run(id);
    setProductSlug(id, null);

    return { ok: true as const };
  }

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
      WHERE p.deleted_at IS NULL
      ORDER BY p.name ASC
    `).all();

    const slugs = loadProductSlugs();
    const products = rows.map((row: any) => ({
      ...row,
      image_slug: slugs[String(row.id)] ?? null,
    }));

    return { products };
  });

  // Create product
  app.post("/api/admin/products", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const schema = z.object({
      name: z.string().min(1),
      is_active: z.boolean().optional().default(true),
      price_cents: z.number().int().min(0).optional(),
      initial_qty: z.number().int().min(0).optional(),
      image_slug: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const { name, is_active, price_cents, initial_qty, image_slug } = parsed.data;
    const db = getDB();

    const tx = db.transaction(() => {
      db.prepare(`INSERT INTO products (name, is_active) VALUES (?, ?)`)
        .run(name.trim(), is_active ? 1 : 0);

      const p = db.prepare(`
        SELECT id FROM products
        WHERE name = ? AND deleted_at IS NULL
      `).get(name.trim()) as any;

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

      const productId = p.id as number;
      if (image_slug) {
        const slug = normalizeSlug(image_slug);
        if (slug) setProductSlug(productId, slug);
      }

      return productId;
    });

    try {
      const productId = tx();
      return reply.send({ ok: true, product_id: productId });
    } catch (e: any) {
      if (String(e?.message || "").includes("UNIQUE")) {
        return reply.code(409).send({ error: "Product name already exists" });
      }
      return reply.code(500).send({ error: "Internal error" });
    }
  });

  // Toggle / rename product (disable = hide from kiosk)
  app.patch("/api/admin/products/:id", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      is_active: z.boolean().optional(),
      image_slug: z.string().optional().nullable(),
    });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const db = getDB();
    const { id } = p.data;
    const { name, is_active, image_slug } = b.data;

    const existing = db.prepare(`SELECT id FROM products WHERE id=? AND deleted_at IS NULL`).get(id);
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

    if (image_slug !== undefined) {
      const slug = image_slug ? normalizeSlug(image_slug) : "";
      setProductSlug(id, slug || null);
    }

    return reply.send({ ok: true });
  });

  // Set price (historized)
  app.post("/api/admin/products/:id/price", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const bodySchema = z.object({
      price_cents: z.number().int().min(0),
      starts_at: z.string().optional(),
    });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const { id } = p.data;
    const { price_cents, starts_at } = b.data;

    const db = getDB();
    const exists = db.prepare(`SELECT 1 FROM products WHERE id=? AND deleted_at IS NULL`).get(id);
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

  app.get("/api/admin/stocks/export.csv", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const db = getDB();
    const rows = db.prepare(`
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        COALESCE(sc.qty, 0) AS qty,
        p.is_active
      FROM products p
      LEFT JOIN stock_current sc ON sc.product_id = p.id
      WHERE p.deleted_at IS NULL
      ORDER BY p.name ASC
    `).all() as Array<{
      product_id: number;
      product_name: string;
      qty: number;
      is_active: number;
    }>;

    const lines = [
      "product_id,product_name,qty,is_active",
      ...rows.map((row) => [
        String(row.product_id),
        csvEscape(row.product_name),
        String(Number(row.qty ?? 0)),
        String(Number(row.is_active ?? 0)),
      ].join(",")),
    ];

    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename=\"stocks-${stamp}.csv\"`);
    return reply.send(lines.join("\n"));
  });

  app.post("/api/admin/stocks/import", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const bodySchema = z.object({
      csv: z.string().min(1),
      comment: z.string().optional(),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const rows = parseCsv(parsed.data.csv);
    if (rows.length < 2) return reply.code(400).send({ error: "CSV vide ou incomplet" });

    const header = (rows[0] ?? []).map((value) => value.trim().toLowerCase());
    if (!header.includes("qty")) return reply.code(400).send({ error: "Colonne obligatoire manquante: qty" });
    if (!header.includes("product_id") && !header.includes("product_name")) {
      return reply.code(400).send({ error: "Colonne obligatoire manquante: product_id ou product_name" });
    }

    const db = getDB();
    const counters = { updated: 0, unchanged: 0, failed: 0 };
    const errors: Array<{ line: number; error: string }> = [];

    const tx = db.transaction(() => {
      const moveId = randomUUID();
      const ensureStockRow = db.prepare(`INSERT OR IGNORE INTO stock_current (product_id, qty) VALUES (?, 0)`);
      const readQty = db.prepare(`SELECT COALESCE(qty, 0) AS qty FROM stock_current WHERE product_id = ?`);
      const updateStock = db.prepare(`UPDATE stock_current SET qty = ? WHERE product_id = ?`);
      const insertMove = db.prepare(`
        INSERT INTO stock_moves (move_id, product_id, delta_qty, reason, ref_id, comment)
        VALUES (?, ?, ?, ?, NULL, ?)
      `);

      for (let index = 1; index < rows.length; index += 1) {
        const lineNumber = index + 1;
        const row = rows[index] ?? [];
        const record: Record<string, string> = {};
        header.forEach((key, colIdx) => {
          record[key] = String(row[colIdx] ?? "").trim();
        });

        if (Object.values(record).every((value) => value === "")) {
          counters.unchanged += 1;
          continue;
        }

        try {
          const targetQty = Number(record.qty);
          if (!Number.isFinite(targetQty) || !Number.isInteger(targetQty)) {
            throw new Error("qty invalide");
          }

          let product: { id: number; name: string } | undefined;
          if (record.product_id) {
            const productId = Number(record.product_id);
            if (!Number.isFinite(productId) || !Number.isInteger(productId) || productId <= 0) {
              throw new Error("product_id invalide");
            }
            product = db.prepare(`
              SELECT id, name
              FROM products
              WHERE id = ?
                AND deleted_at IS NULL
            `).get(productId) as { id: number; name: string } | undefined;
          }

          if (!product && record.product_name) {
            product = db.prepare(`
              SELECT id, name
              FROM products
              WHERE name = ?
                AND deleted_at IS NULL
            `).get(record.product_name) as { id: number; name: string } | undefined;
          }

          if (!product) throw new Error("Produit introuvable");

          ensureStockRow.run(product.id);
          const currentQtyRow = readQty.get(product.id) as { qty: number } | undefined;
          const currentQty = Number(currentQtyRow?.qty ?? 0);
          const delta = targetQty - currentQty;

          if (delta === 0) {
            counters.unchanged += 1;
            continue;
          }

          updateStock.run(targetQty, product.id);
          insertMove.run(
            moveId,
            product.id,
            delta,
            delta > 0 ? "restock" : "correction",
            parsed.data.comment?.trim() || "import csv stocks"
          );
          counters.updated += 1;
        } catch (error: unknown) {
          counters.failed += 1;
          errors.push({
            line: lineNumber,
            error: String((error as Error)?.message ?? error),
          });
        }
      }
    });

    tx();
    return reply.send({
      ok: true,
      ...counters,
      errors,
    });
  });

  app.post("/api/admin/restock", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const schema = z.object({
      items: z.array(z.object({
        product_id: z.number().int().positive(),
        qty: z.number().int().refine((value) => value !== 0, { message: "qty must be non-zero" }),
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
        VALUES (?, ?, ?, ?, NULL, ?)
      `);

      for (const it of items) {
        const exists = db.prepare(`
          SELECT 1 FROM products WHERE id=? AND deleted_at IS NULL
        `).get(it.product_id);
        if (!exists) throw new Error("PRODUCT_NOT_FOUND");

        ensureStockRow.run(it.product_id);
        updateStock.run(it.qty, it.product_id);
        const reason = it.qty > 0 ? "restock" : "correction";
        insertMove.run(moveId, it.product_id, it.qty, reason, comment ?? null);
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

  async function handleDeleteProduct(req: any, reply: any) {
    try { requireAdmin(req); } catch (e: any) { return reply.code(e.statusCode ?? 500).send({ error: e.message }); }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const p = paramsSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "Invalid product id" });

    const result = await softDeleteProduct(p.data.id);
    if ("error" in result) return reply.code(result.status).send({ error: result.error });
    return reply.send(result);
  }

  app.delete("/api/admin/products/:id", handleDeleteProduct);
  app.post("/api/admin/products/:id/delete", handleDeleteProduct);
}
