import type { FastifyInstance } from "fastify";
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

    const db = getDB();
    const month_key = currentMonthKey();

    // Somme des dettes clôturées impayées (tous mois)
    // + Somme des achats du mois courant (orders live)
    const rows = db.prepare(`
      SELECT
        u.id AS user_id,
        u.name AS user_name,
        u.email AS user_email,

        COALESCE((
          SELECT SUM(md.amount_cents)
          FROM monthly_debts md
          WHERE md.user_id = u.id
            AND md.status = 'invoiced'
        ), 0) AS unpaid_closed_cents,

        COALESCE((
          SELECT SUM(o.total_cents)
          FROM orders o
          WHERE o.user_id = u.id
            AND o.status = 'committed'
            AND o.month_key = ?
        ), 0) AS open_month_cents

      FROM users u
      WHERE u.is_active IN (0,1)
      ORDER BY (unpaid_closed_cents + open_month_cents) DESC, u.name ASC
    `).all(month_key) as any[];

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
