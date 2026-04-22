import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDB } from "../db/db.js";

export async function kioskRoutes(app: FastifyInstance) {
  app.post("/api/kiosk/identify", async (req, reply) => {
    const bodySchema = z.object({
      uid: z.string().min(1),
    });
    req.log.info({ body: req.body }, "identify payload");
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    const uid = parsed.data.uid.trim().toUpperCase();

    const db = getDB();
    type DbUser = {
      id: number;
      name: string;
      email: string | null;
      rfid_uid: string | null;
      is_active: number; // 0/1 en SQLite
      balance_cents: number;
    };
    const user = db
      .prepare(
        `SELECT
           u.id,
           u.name,
           u.email,
           u.rfid_uid,
           u.is_active,
           u.balance_cents
         FROM users u
         WHERE u.deleted_at IS NULL
           AND (
             u.rfid_uid = ?
             OR EXISTS (
               SELECT 1
               FROM user_badges ub
               WHERE ub.user_id = u.id
                 AND ub.uid = ?
             )
           )
         LIMIT 1`
      )
      .get(uid, uid) as DbUser | undefined;

    if (!user) {
      return reply.code(404).send({ error: "Badge not recognized" });
    }

    if (user.is_active !== 1) {
      return reply.code(403).send({ error: "User disabled", user });
    }

    return reply.send({ user });
  });

  app.get("/api/kiosk/debt/:userId", async (req, reply) => {
    const params = z.object({
      userId: z.coerce.number().int().positive(),
    }).safeParse(req.params);

    if (!params.success) {
      return reply.code(400).send({ error: "Invalid userId" });
    }

    const { userId } = params.data;
    const db = getDB();

    const user = db
      .prepare(`
        SELECT id, name, is_active, balance_cents
        FROM users
        WHERE id = ?
          AND deleted_at IS NULL
      `)
      .get(userId) as any;

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }

    if (user.is_active !== 1) {
      return reply.code(403).send({ error: "User disabled" });
    }

    const unpaidRow = db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total_cents
      FROM period_debts
      WHERE user_id = ?
        AND status = 'invoiced'
    `).get(userId) as any;

    const last = db.prepare(`
      SELECT COALESCE(MAX(end_ts), '1970-01-01 00:00:00') AS last_end_ts
      FROM billing_periods
    `).get() as any;

    const last_end_ts = String(last?.last_end_ts ?? "1970-01-01 00:00:00");

    const openRow = db.prepare(`
      SELECT COALESCE(SUM(total_cents), 0) AS total_cents
      FROM orders
      WHERE user_id = ?
        AND status = 'committed'
        AND COALESCE(paid_from_balance, 0) = 0
        AND ts >= ?
    `).get(userId, last_end_ts) as any;

    const closedItems = db.prepare(`
      SELECT
        oi.product_id,
        p.name AS product_name,
        SUM(oi.qty) AS qty
      FROM period_debts pd
      JOIN billing_periods bp ON bp.id = pd.period_id
      JOIN orders o
        ON o.user_id = pd.user_id
       AND o.status = 'committed'
       AND o.ts >= bp.start_ts
       AND o.ts < bp.end_ts
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE pd.user_id = ?
        AND pd.status = 'invoiced'
      GROUP BY oi.product_id, p.name
    `).all(userId) as Array<{ product_id: number; product_name: string; qty: number }>;

    const openItems = db.prepare(`
      SELECT
        oi.product_id,
        p.name AS product_name,
        SUM(oi.qty) AS qty
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = ?
        AND o.status = 'committed'
        AND COALESCE(o.paid_from_balance, 0) = 0
        AND o.ts >= ?
      GROUP BY oi.product_id, p.name
    `).all(userId, last_end_ts) as Array<{ product_id: number; product_name: string; qty: number }>;

    const merged = new Map<number, { product_id: number; product_name: string; qty: number }>();
    for (const item of closedItems) {
      merged.set(item.product_id, { ...item, qty: Number(item.qty) });
    }
    for (const item of openItems) {
      const existing = merged.get(item.product_id);
      if (existing) existing.qty += Number(item.qty);
      else merged.set(item.product_id, { ...item, qty: Number(item.qty) });
    }

    const items = Array.from(merged.values()).sort((a, b) => b.qty - a.qty);

    const unpaid_closed_cents = Number(unpaidRow?.total_cents ?? 0);
    const open_cents = Number(openRow?.total_cents ?? 0);
    const total_cents = unpaid_closed_cents + open_cents;

    return reply.send({
      user_id: userId,
      balance_cents: Number(user.balance_cents ?? 0),
      unpaid_closed_cents,
      open_cents,
      total_cents,
      items,
    });
  });
}
