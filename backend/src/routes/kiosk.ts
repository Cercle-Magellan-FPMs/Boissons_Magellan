import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDB } from "../db/db.js";
import { badgeMatchCandidates, normalizeBadgeUid } from "../lib/badgeUid.js";
import { sendMail } from "../lib/mailer.js";

function eurosFromCents(cents: number) {
  return `${(cents / 100).toFixed(2)} EUR`;
}

function badgeExistsSql(candidateCount: number) {
  const placeholders = Array.from({ length: candidateCount }, () => "?").join(", ");
  return `
    SELECT u.id
    FROM users u
    WHERE u.deleted_at IS NULL
      AND (
        u.rfid_uid IN (${placeholders})
        OR EXISTS (
          SELECT 1
          FROM user_badges ub
          WHERE ub.user_id = u.id
            AND ub.uid IN (${placeholders})
        )
      )
    LIMIT 1
  `;
}

export async function kioskRoutes(app: FastifyInstance) {
  app.post("/api/kiosk/identify", async (req, reply) => {
    const bodySchema = z.object({
      uid: z.string().min(1),
    });
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    const rawUid = parsed.data.uid;
    const normalizedUid = normalizeBadgeUid(rawUid);
    const uidCandidates = badgeMatchCandidates(rawUid);
    req.log.info({ rawUid, normalizedUid, uidCandidates }, "badge identify");
    if (!normalizedUid) {
      return reply.code(400).send({ error: "Invalid badge UID" });
    }

    const db = getDB();
    type DbUser = {
      id: number;
      name: string;
      email: string | null;
      rfid_uid: string | null;
      is_active: number; // 0/1 en SQLite
      balance_cents: number;
    };
    const candidatePlaceholders = uidCandidates.map(() => "?").join(", ");
    const directUser = db
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
             u.rfid_uid IN (${candidatePlaceholders})
             OR EXISTS (
               SELECT 1
               FROM user_badges ub
               WHERE ub.user_id = u.id
                 AND ub.uid IN (${candidatePlaceholders})
             )
           )
         LIMIT 1`
      )
      .get(...uidCandidates, ...uidCandidates) as DbUser | undefined;

    if (directUser) {
      if (directUser.is_active !== 1) {
        return reply.code(403).send({ error: "User disabled", user: directUser });
      }
      return reply.send({ user: directUser });
    }

    const rows = db.prepare(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.rfid_uid,
         u.is_active,
         u.balance_cents,
         ub.uid AS badge_uid
       FROM users u
       LEFT JOIN user_badges ub ON ub.user_id = u.id
       WHERE u.deleted_at IS NULL`
    ).all() as Array<DbUser & { badge_uid: string | null }>;

    const userMap = new Map<number, DbUser>();
    for (const row of rows) {
      const rowCandidates = new Set<string>();
      if (row.rfid_uid) {
        for (const candidate of badgeMatchCandidates(row.rfid_uid)) {
          rowCandidates.add(candidate);
        }
      }
      if (row.badge_uid) {
        for (const candidate of badgeMatchCandidates(row.badge_uid)) {
          rowCandidates.add(candidate);
        }
      }

      if (uidCandidates.some((candidate) => rowCandidates.has(candidate))) {
        userMap.set(row.id, {
          id: row.id,
          name: row.name,
          email: row.email,
          rfid_uid: row.rfid_uid,
          is_active: row.is_active,
          balance_cents: row.balance_cents,
        });
      }
    }

    const user = Array.from(userMap.values())[0];

    if (!user) {
      return reply.code(404).send({ error: "Badge not recognized" });
    }

    if (user.is_active !== 1) {
      return reply.code(403).send({ error: "User disabled", user });
    }

    return reply.send({ user });
  });

  app.post("/api/kiosk/badge-request", async (req, reply) => {
    const body = z.object({
      name: z.string().trim().min(1),
      email: z.string().trim().email(),
      rfid_uid: z.string().min(1),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    const normalizedUid = normalizeBadgeUid(body.data.rfid_uid);
    const uidCandidates = badgeMatchCandidates(body.data.rfid_uid);
    if (!normalizedUid || uidCandidates.length === 0) {
      return reply.code(400).send({ error: "Badge invalide" });
    }

    const db = getDB();
    const existingUser = db
      .prepare(badgeExistsSql(uidCandidates.length))
      .get(...uidCandidates, ...uidCandidates);

    if (existingUser) {
      return reply.code(409).send({ error: "Ce badge est déjà lié à un compte." });
    }

    const pending = db.prepare(`
      SELECT id
      FROM badge_requests
      WHERE status = 'pending'
        AND normalized_uid IN (${uidCandidates.map(() => "?").join(", ")})
      LIMIT 1
    `).get(...uidCandidates);

    if (pending) {
      return reply.code(409).send({ error: "Une demande est déjà en attente pour ce badge." });
    }

    try {
      const id = randomUUID();
      db.prepare(`
        INSERT INTO badge_requests (id, name, email, uid, normalized_uid)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        id,
        body.data.name.trim(),
        body.data.email.trim(),
        normalizedUid,
        normalizedUid
      );

      return reply.send({ ok: true, request_id: id });
    } catch (error: any) {
      const message = String(error?.message || error);
      if (message.includes("UNIQUE")) {
        return reply.code(409).send({ error: "Une demande est déjà en attente pour ce badge." });
      }
      req.log.error({ error }, "badge request failed");
      return reply.code(500).send({ error: "Impossible d'enregistrer la demande." });
    }
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

  app.post("/api/kiosk/account-detail/request", async (req, reply) => {
    const body = z.object({
      user_id: z.number().int().positive(),
    }).safeParse(req.body);

    if (!body.success) {
      return reply.code(400).send({ error: "Invalid payload" });
    }

    const db = getDB();
    const user = db.prepare(`
      SELECT id, name, email, is_active, balance_cents
      FROM users
      WHERE id = ?
        AND deleted_at IS NULL
    `).get(body.data.user_id) as {
      id: number;
      name: string;
      email: string | null;
      is_active: number;
      balance_cents: number;
    } | undefined;

    if (!user) {
      return reply.code(404).send({ error: "User not found" });
    }
    if (user.is_active !== 1) {
      return reply.code(403).send({ error: "User disabled" });
    }
    if (!user.email) {
      return reply.code(409).send({ error: "Aucun email n'est enregistré pour ce compte." });
    }

    const topups = db.prepare(`
      SELECT
        delta_cents,
        comment,
        COALESCE(payment_date, date(created_at)) AS payment_date,
        payment_method,
        created_at
      FROM account_transactions
      WHERE user_id = ?
        AND reason = 'topup'
        AND delta_cents > 0
      ORDER BY COALESCE(payment_date, date(created_at)) DESC, created_at DESC
    `).all(user.id) as Array<{
      delta_cents: number;
      comment: string | null;
      payment_date: string;
      payment_method: "bank_transfer" | "cash" | null;
      created_at: string;
    }>;

    const consumptions = db.prepare(`
      SELECT
        o.id AS order_id,
        o.ts,
        o.total_cents,
        GROUP_CONCAT(p.name || ' x' || oi.qty, ', ') AS lines
      FROM orders o
      JOIN order_items oi ON oi.order_id = o.id
      JOIN products p ON p.id = oi.product_id
      WHERE o.user_id = ?
        AND o.status = 'committed'
      GROUP BY o.id, o.ts, o.total_cents
      ORDER BY o.ts DESC
    `).all(user.id) as Array<{
      order_id: string;
      ts: string;
      total_cents: number;
      lines: string | null;
    }>;

    const topupLines = topups.length === 0
      ? ["- Aucun top-up enregistré"]
      : topups.map((topup) => {
        const methodLabel = topup.payment_method === "cash" ? "liquide" : "virement";
        return `- ${topup.payment_date} | ${eurosFromCents(Number(topup.delta_cents ?? 0))} | ${methodLabel} | ${topup.comment ?? ""}`.trim();
      });

    const consumptionLines = consumptions.length === 0
      ? ["- Aucune consommation enregistrée"]
      : consumptions.map((order) =>
        `- ${order.ts} | ${eurosFromCents(Number(order.total_cents ?? 0))} | ${order.lines ?? ""}`
      );

    const text = [
      `Bonjour ${user.name},`,
      "",
      "Voici le détail de votre compte Boissons Magellan.",
      "",
      `Solde actuel: ${eurosFromCents(Number(user.balance_cents ?? 0))}`,
      "",
      "Top-ups:",
      ...topupLines,
      "",
      "Consommations:",
      ...consumptionLines,
      "",
      "Cet email a été généré automatiquement.",
    ].join("\n");

    try {
      await sendMail({
        to: user.email,
        subject: "Boissons Magellan - Détail de votre compte",
        text,
      });
      return reply.send({ ok: true });
    } catch (error: unknown) {
      const message = String((error as Error)?.message ?? error);
      if (message.includes("MAIL_NOT_CONFIGURED")) {
        return reply.code(500).send({ error: "Envoi email indisponible: configuration SMTP manquante." });
      }
      req.log.error({ error }, "account detail email failed");
      return reply.code(500).send({ error: "Impossible d'envoyer l'email pour le moment." });
    }
  });
}
