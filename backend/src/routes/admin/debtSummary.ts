import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";

export async function adminDebtSummaryRoutes(app: FastifyInstance) {
  // GET /api/admin/debts/summary?status=invoiced
  app.get("/api/admin/debts/summary", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const qs = z.object({
      status: z.enum(["invoiced", "paid"]).optional().default("invoiced"),
    }).safeParse(req.query);

    if (!qs.success) return reply.code(400).send({ error: "Invalid query" });
    const { status } = qs.data;

    const db = getDB();
    const rows = db.prepare(`
      SELECT
        pd.user_id,
        u.name AS user_name,
        u.email AS user_email,
        COUNT(DISTINCT pd.period_id) AS periods_count,
        SUM(pd.amount_cents) AS total_cents
      FROM period_debts pd
      JOIN users u ON u.id = pd.user_id
      WHERE pd.status = ?
      GROUP BY pd.user_id
      ORDER BY total_cents DESC, u.name ASC
    `).all(status) as any[];

    return {
      status,
      summary: rows.map(r => ({
        user_id: r.user_id,
        user_name: r.user_name,
        user_email: r.user_email,
        periods_count: Number(r.periods_count),
        total_cents: Number(r.total_cents ?? 0),
      })),
    };
  });

  // GET /api/admin/debts/user/:userId?status=invoiced
  app.get("/api/admin/debts/user/:userId", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const params = z.object({ userId: z.coerce.number().int().positive() }).safeParse(req.params);
    if (!params.success) return reply.code(400).send({ error: "Invalid userId" });

    const qs = z.object({
      status: z.enum(["invoiced", "paid"]).optional(),
    }).safeParse(req.query);

    if (!qs.success) return reply.code(400).send({ error: "Invalid query" });

    const { userId } = params.data;
    const status = qs.data.status;

    const db = getDB();
    const user = db.prepare(`SELECT id, name, email FROM users WHERE id=?`).get(userId);
    if (!user) return reply.code(404).send({ error: "User not found" });

    const where = ["pd.user_id = ?"];
    const args: any[] = [userId];
    if (status) { where.push("pd.status = ?"); args.push(status); }

    const debts = db.prepare(`
      SELECT
        pd.period_id,
        bp.start_ts,
        bp.end_ts,
        pd.amount_cents,
        pd.status,
        pd.generated_at,
        pd.paid_at
      FROM period_debts pd
      JOIN billing_periods bp ON bp.id = pd.period_id
      WHERE ${where.join(" AND ")}
      ORDER BY bp.end_ts DESC
    `).all(...args);

    return { user, debts };
  });
}
