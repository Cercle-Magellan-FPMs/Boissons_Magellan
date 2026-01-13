import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";

export async function adminDebtRoutes(app: FastifyInstance) {
  // Liste des dettes (filtrables)
  // GET /api/admin/debts?status=invoiced&month_key=2025-12
  app.get("/api/admin/debts", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const querySchema = z.object({
      status: z.enum(["invoiced", "paid"]).optional(),
      month_key: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      user_id: z.coerce.number().int().positive().optional(),
    });

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid query" });

    const { status, month_key, user_id } = parsed.data;

    const db = getDB();
    const where: string[] = [];
    const params: any[] = [];

    if (status) { where.push("pd.status = ?"); params.push(status); }
    if (user_id) { where.push("pd.user_id = ?"); params.push(user_id); }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const sql = `
        SELECT
          pd.period_id,
          bp.start_ts,
          bp.end_ts,
          pd.user_id,
          u.name AS user_name,
          u.email AS user_email,
          pd.amount_cents,
          pd.status,
          pd.generated_at,
          pd.paid_at
        FROM period_debts pd
        JOIN billing_periods bp ON bp.id = pd.period_id
        JOIN users u ON u.id = pd.user_id
        ${whereClause}
        ORDER BY bp.end_ts DESC, u.name ASC
    `;

    const debts = db.prepare(sql).all(...params);
    return reply.send({ debts });
  });

  // Marquer payé
  // POST /api/admin/debts/pay  { period_id:"UUID", user_id:1 }
  app.post("/api/admin/debts/pay", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const bodySchema = z.object({
      period_id: z.string().uuid(),
      user_id: z.number().int().positive(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const { period_id, user_id } = parsed.data;

    const db = getDB();
    const row = db.prepare(
      `SELECT status FROM period_debts WHERE period_id = ? AND user_id = ?`
    ).get(period_id, user_id) as any;

    if (!row) return reply.code(404).send({ error: "Debt not found" });
    if (row.status === "paid") return reply.code(409).send({ error: "Already paid" });

    db.prepare(`
      UPDATE period_debts
      SET status='paid', paid_at=datetime('now')
      WHERE period_id=? AND user_id=? AND status='invoiced'
    `).run(period_id, user_id);

    return reply.send({ ok: true });
  });

  // Annuler un paiement (optionnel mais très utile)
  // POST /api/admin/debts/unpay { period_id:"UUID", user_id:1 }
  app.post("/api/admin/debts/unpay", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const bodySchema = z.object({
      period_id: z.string().uuid(),
      user_id: z.number().int().positive(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const { period_id, user_id } = parsed.data;

    const db = getDB();
    const row = db.prepare(
      `SELECT status FROM period_debts WHERE period_id = ? AND user_id = ?`
    ).get(period_id, user_id) as any;

    if (!row) return reply.code(404).send({ error: "Debt not found" });
    if (row.status === "invoiced") return reply.code(409).send({ error: "Already unpaid" });

    db.prepare(`
      UPDATE period_debts
      SET status='invoiced', paid_at=NULL
      WHERE period_id=? AND user_id=?
    `).run(period_id, user_id);

    return reply.send({ ok: true });
  });
}
