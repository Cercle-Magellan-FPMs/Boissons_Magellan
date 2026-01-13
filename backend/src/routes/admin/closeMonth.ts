import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// par défaut : mois précédent, basé sur l'heure locale machine (RPi => TZ Europe/Paris)
function previousMonthKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export async function adminCloseMonthRoutes(app: FastifyInstance) {
  // POST /api/admin/close-month { month_key?: "YYYY-MM" }
  app.post("/api/admin/close-month", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const bodySchema = z.object({
      month_key: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const month_key = parsed.data.month_key ?? previousMonthKey();

    const db = getDB();

    // 1) Bloquer si déjà clôturé
    const already = db
      .prepare(`SELECT 1 FROM monthly_debts WHERE month_key = ? LIMIT 1`)
      .get(month_key);

    if (already) {
      return reply.code(409).send({ error: `Month ${month_key} already closed` });
    }

    // 2) Agréger les ventes du mois
    // On utilise orders.total_cents (plus simple + déjà calculé à la vente)
    const sums = db.prepare(`
      SELECT user_id, SUM(total_cents) AS amount_cents
      FROM orders
      WHERE month_key = ?
        AND status = 'committed'
      GROUP BY user_id
      HAVING SUM(total_cents) > 0
      ORDER BY user_id ASC
    `).all(month_key) as Array<{ user_id: number; amount_cents: number }>;

    // 3) Insérer monthly_debts dans une transaction
    const tx = db.transaction(() => {
      const ins = db.prepare(`
        INSERT INTO monthly_debts (month_key, user_id, amount_cents, status, generated_at)
        VALUES (?, ?, ?, 'invoiced', datetime('now'))
      `);

      for (const r of sums) {
        ins.run(month_key, r.user_id, Number(r.amount_cents));
      }
      return sums.length;
    });

    const createdCount = tx();

    return reply.send({
      ok: true,
      month_key,
      created: createdCount,
    });
  });
}
