import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";
import { sendMail } from "../../lib/mailer.js";

function eurosFromCents(cents: number) {
  return `${(cents / 100).toFixed(2)} EUR`;
}

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
        AND COALESCE(paid_from_balance, 0) = 0
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

    const mailStats = {
      sent: 0,
      skipped: 0,
      failed: 0,
      errors: [] as Array<{ user_id: number; error: string }>,
    };

    const debtByUser = new Map<number, number>();
    for (const summary of sums) {
      debtByUser.set(summary.user_id, Number(summary.amount_cents ?? 0));
    }

    const mailTargets = db.prepare(`
      SELECT DISTINCT
        u.id,
        u.name,
        u.email
      FROM users u
      JOIN orders o ON o.user_id = u.id
      WHERE o.status = 'committed'
        AND o.ts >= ?
        AND o.ts < ?
      ORDER BY u.name ASC
    `).all(start_ts, end) as Array<{ id: number; name: string; email: string | null }>;

    for (const user of mailTargets) {
      const userDebtCents = debtByUser.get(user.id) ?? 0;

      if (!user?.email) {
        mailStats.skipped += 1;
        continue;
      }

      const lines = db.prepare(`
        SELECT
          p.name AS product_name,
          SUM(oi.qty) AS qty,
          SUM(oi.qty * oi.unit_price_cents) AS amount_cents
        FROM orders o
        JOIN order_items oi ON oi.order_id = o.id
        JOIN products p ON p.id = oi.product_id
        WHERE o.user_id = ?
          AND o.status = 'committed'
          AND o.ts >= ?
          AND o.ts < ?
        GROUP BY p.name
        ORDER BY p.name ASC
      `).all(user.id, start_ts, end) as Array<{
        product_name: string;
        qty: number;
        amount_cents: number;
      }>;

      const detail = lines.length === 0
        ? ["- Aucune consommation trouvée sur la période."]
        : lines.map((line) =>
          `- ${line.product_name}: ${Number(line.qty)} ( ${eurosFromCents(Number(line.amount_cents ?? 0))} )`
        );

      const body = [
        `Bonjour ${user.name},`,
        "",
        "Votre extrait de compte sur la période clôturée est disponible ci-dessous.",
        "",
        parsed.data.comment?.trim() ? parsed.data.comment.trim() : "[Aucun commentaire de clôture]",
        "",
        `Période: ${start_ts} -> ${end}`,
        `Total consommations: ${eurosFromCents(Number(lines.reduce((acc, line) => acc + Number(line.amount_cents ?? 0), 0)))}`,
        `Montant à facturer période clôturée: ${eurosFromCents(userDebtCents)}`,
        "",
        "Détail:",
        ...detail,
        "",
        "Ceci est un email automatique Boissons Magellan.",
      ].join("\n");

      try {
        await sendMail({
          to: user.email,
          subject: "Boissons Magellan - Extrait de compte période clôturée",
          text: body,
        });
        mailStats.sent += 1;
      } catch (error: unknown) {
        const message = String((error as Error)?.message ?? error);
        mailStats.failed += 1;
        mailStats.errors.push({ user_id: user.id, error: message });
        req.log.error({ user_id: user.id, error }, "close period mail failed");
      }
    }

    return reply.send({ ok: true, period_id, start_ts, end_ts: end, created, mail: mailStats });
  });
}
