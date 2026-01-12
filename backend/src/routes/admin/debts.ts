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

    if (status) { where.push("md.status = ?"); params.push(status); }
    if (month_key) { where.push("md.month_key = ?"); params.push(month_key); }
    if (user_id) { where.push("md.user_id = ?"); params.push(user_id); }

    const sql = `
      SELECT
        md.month_key,
        md.user_id,
        u.name AS user_name,
        u.email AS user_email,
        md.amount_cents,
        md.status,
        md.generated_at,
        md.paid_at
      FROM monthly_debts md
      JOIN users u ON u.id = md.user_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY md.month_key DESC, u.name ASC
    `;

    const debts = db.prepare(sql).all(...params);
    return { debts };
  });

  // Marquer payé
  // POST /api/admin/debts/pay  { month_key:"YYYY-MM", user_id:1 }
  app.post("/api/admin/debts/pay", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const bodySchema = z.object({
      month_key: z.string().regex(/^\d{4}-\d{2}$/),
      user_id: z.number().int().positive(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const { month_key, user_id } = parsed.data;

    const db = getDB();
    const row = db.prepare(
      `SELECT status FROM monthly_debts WHERE month_key = ? AND user_id = ?`
    ).get(month_key, user_id) as any;

    if (!row) return reply.code(404).send({ error: "Debt not found" });
    if (row.status === "paid") return reply.code(409).send({ error: "Already paid" });

    db.prepare(`
      UPDATE monthly_debts
      SET status='paid', paid_at=datetime('now')
      WHERE month_key=? AND user_id=?
    `).run(month_key, user_id);

    return reply.send({ ok: true });
  });

  // Annuler un paiement (optionnel mais très utile)
  // POST /api/admin/debts/unpay { month_key:"YYYY-MM", user_id:1 }
  app.post("/api/admin/debts/unpay", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const bodySchema = z.object({
      month_key: z.string().regex(/^\d{4}-\d{2}$/),
      user_id: z.number().int().positive(),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const { month_key, user_id } = parsed.data;

    const db = getDB();
    const row = db.prepare(
      `SELECT status FROM monthly_debts WHERE month_key = ? AND user_id = ?`
    ).get(month_key, user_id) as any;

    if (!row) return reply.code(404).send({ error: "Debt not found" });
    if (row.status === "invoiced") return reply.code(409).send({ error: "Already unpaid" });

    db.prepare(`
      UPDATE monthly_debts
      SET status='invoiced', paid_at=NULL
      WHERE month_key=? AND user_id=?
    `).run(month_key, user_id);

    return reply.send({ ok: true });
  });
}
