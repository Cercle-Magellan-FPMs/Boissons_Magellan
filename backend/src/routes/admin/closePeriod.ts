import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";

export async function adminClosePeriodRoutes(app: FastifyInstance) {
  app.post("/api/admin/close-period", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const bodySchema = z.object({
      comment: z.string().optional(),
    });
    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const db = getDB();

    // dernière fin de période
    const last = db.prepare(`SELECT MAX(end_ts) AS last_end FROM billing_periods`).get() as any;
    const start_ts = last?.last_end ?? "1970-01-01 00:00:00";
    const end_ts = db.prepare(`SELECT datetime('now') AS now`).get() as any;
    const end = end_ts.now as string;

    if (end <= start_ts) {
      return reply.code(409).send({ error: "Nothing to close (end <= start)" });
    }

    // Agrégation des achats dans la période
    const sums = db.prepare(`
      SELECT user_id, SUM(total_cents) AS amount_cents
      FROM orders
      WHERE status='committed'
        AND ts >= ? AND ts < ?
      GROUP BY user_id
      HAVING SUM(total_cents) > 0
      ORDER BY user_id ASC
    `).all(start_ts, end) as Array<{ user_id: number; amount_cents: number }>;

    const period_id = randomUUID();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO billing_periods (id, start_ts, end_ts, comment)
        VALUES (?, ?, ?, ?)
      `).run(period_id, start_ts, end, parsed.data.comment ?? null);

      const ins = db.prepare(`
        INSERT INTO period_debts (period_id, user_id, amount_cents, status, generated_at)
        VALUES (?, ?, ?, 'invoiced', datetime('now'))
      `);

      for (const r of sums) {
        ins.run(period_id, r.user_id, Number(r.amount_cents));
      }

      return sums.length;
    });

    const created = tx();

    return reply.send({ ok: true, period_id, start_ts, end_ts: end, created });
  });
}
