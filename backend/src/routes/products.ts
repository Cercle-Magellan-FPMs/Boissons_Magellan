import type { FastifyInstance } from "fastify";
import { getDB } from "../db/db.js";
import { loadProductSlugs } from "../lib/productSlug.js";

export async function productRoutes(app: FastifyInstance) {
  app.get("/api/kiosk/products", async () => {
    const db = getDB();

    // Prix courant = dernier prix dont starts_at <= now
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
      WHERE p.is_active = 1
        AND p.deleted_at IS NULL
      ORDER BY p.name ASC
    `).all() as Array<any>;

    // Kiosk keeps products orderable even when stock is depleted.
    const slugs = loadProductSlugs();
    const products = rows.map(r => ({
      id: r.id,
      name: r.name,
      price_cents: r.price_cents ?? null,
      qty: Number(r.qty) || 0,
      available: r.price_cents != null,
      image_slug: slugs[String(r.id)] ?? null,
    }));

    return { products };
  });
}
