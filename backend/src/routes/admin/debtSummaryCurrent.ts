import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Basé sur l'heure locale machine (RPi => TZ Europe/Paris)
function currentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export async function adminDebtSummaryCurrentRoutes(app: FastifyInstance) {
  app.get("/api/admin/debts/summary-current", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const qs = z.object({
      status: z.enum(["invoiced", "paid"]).optional().default("invoiced"),
    }).safeParse(req.query);

    if (!qs.success) return reply.code(400).send({ error: "Invalid query" });
    const { status } = qs.data;

    const db = getDB();
    const month_key = currentMonthKey();

    // Somme des dettes clôturées (filtrées par status)
    // + Somme des achats du mois courant (orders live) - SEULEMENT si status=invoiced
    // Attention: les orders du mois clôturé deviennent des period_debts, ne pas les compter deux fois
    const rows = db.prepare(`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        u.email AS user_email,
          
        COALESCE((
          SELECT SUM(pd.amount_cents)
          FROM period_debts pd
          WHERE pd.user_id = u.id AND pd.status = ?
        ), 0) AS unpaid_closed_cents,
          
        COALESCE((
          SELECT CASE WHEN ? = 'invoiced' THEN SUM(o.total_cents) ELSE 0 END
          FROM orders o
          WHERE o.user_id = u.id
            AND o.status='committed'
            AND CAST(strftime('%Y-%m', o.ts) AS TEXT) = ?
            AND NOT EXISTS (
              SELECT 1 FROM billing_periods bp 
              WHERE CAST(strftime('%Y-%m', bp.end_ts) AS TEXT) = ?
            )
        ), 0) AS open_month_cents
      FROM users u
      ORDER BY (unpaid_closed_cents + open_month_cents) DESC;

    `).all(status, status, month_key, month_key) as any[];

    const summary = rows.map(r => {
      const unpaid_closed_cents = Number(r.unpaid_closed_cents ?? 0);
      const open_month_cents = Number(r.open_month_cents ?? 0);
      return {
        user_id: r.user_id,
        user_name: r.user_name,
        user_email: r.user_email,
        unpaid_closed_cents,
        open_month_cents,
        total_cents: unpaid_closed_cents + open_month_cents,
      };
    });

    return { month_key, summary };
  });
}
