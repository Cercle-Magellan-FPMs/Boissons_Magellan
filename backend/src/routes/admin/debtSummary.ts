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
        md.user_id,
        u.name AS user_name,
        u.email AS user_email,
        COUNT(*) AS months_count,
        SUM(md.amount_cents) AS total_cents
      FROM monthly_debts md
      JOIN users u ON u.id = md.user_id
      WHERE md.status = ?
      GROUP BY md.user_id
      ORDER BY total_cents DESC, u.name ASC
    `).all(status) as any[];

    return {
      status,
      summary: rows.map(r => ({
        user_id: r.user_id,
        user_name: r.user_name,
        user_email: r.user_email,
        months_count: Number(r.months_count),
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

    const where = ["md.user_id = ?"];
    const args: any[] = [userId];
    if (status) { where.push("md.status = ?"); args.push(status); }

    const debts = db.prepare(`
      SELECT
        md.month_key,
        md.amount_cents,
        md.status,
        md.generated_at,
        md.paid_at
      FROM monthly_debts md
      WHERE ${where.join(" AND ")}
      ORDER BY md.month_key DESC
    `).all(...args);

    return { user, debts };
  });
}
