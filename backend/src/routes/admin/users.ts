import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";
import { badgeMatchCandidates, normalizeBadgeUid } from "../../lib/badgeUid.js";

function normUid(uid: string) {
  return normalizeBadgeUid(uid);
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

export async function adminUserRoutes(app: FastifyInstance) {
  const paymentDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const paymentMethodSchema = z.enum(["bank_transfer", "cash"]);

  async function softDeleteUser(id: number) {
    const db = getDB();

    const existing = db.prepare(`
      SELECT id FROM users WHERE id=? AND deleted_at IS NULL
    `).get(id);
    if (!existing) return { error: "User not found", status: 404 as const };

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM user_badges WHERE user_id = ?`).run(id);
      db.prepare(`
        UPDATE users
        SET is_active = 0,
            rfid_uid = NULL,
            deleted_at = datetime('now')
        WHERE id = ?
      `).run(id);
    });

    tx();
    return { ok: true as const };
  }

  // LIST USERS
  app.get("/api/admin/users", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const db = getDB();
    const users = db.prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.rfid_uid,
        u.is_active,
        u.created_at,
        u.balance_cents,
        COALESCE((
          SELECT GROUP_CONCAT(uid, char(10))
          FROM (
            SELECT DISTINCT ub.uid AS uid
            FROM user_badges ub
            WHERE ub.user_id = u.id
            ORDER BY ub.created_at ASC, ub.id ASC
          )
        ), '') AS badge_uids
      FROM users u
      WHERE u.deleted_at IS NULL
      ORDER BY name ASC
    `).all();

    return {
      users: users.map((user: any) => ({
        ...user,
        balance_cents: Number(user.balance_cents ?? 0),
        badge_uids: String(user.badge_uids || "")
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      })),
    };
  });

  // CREATE USER
  app.post("/api/admin/users", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const schema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      is_active: z.boolean().optional().default(true),
      rfid_uid: z.string().optional().or(z.literal("")).optional(), // optionnel
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const name = parsed.data.name.trim();
    const email = parsed.data.email.trim();
    const is_active = parsed.data.is_active ? 1 : 0;
    const rfid_uid = parsed.data.rfid_uid ? normUid(parsed.data.rfid_uid) : null;

    const db = getDB();

    try {
      const tx = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO users (name, email, rfid_uid, is_active, balance_cents)
          VALUES (?, ?, ?, ?, 0)
        `).run(name, email, rfid_uid, is_active);

        const userId = Number(result.lastInsertRowid);

        if (rfid_uid) {
          db.prepare(`
            INSERT INTO user_badges (user_id, uid)
            VALUES (?, ?)
          `).run(userId, rfid_uid);
        }

        return userId;
      });

      return reply.send({ ok: true, user_id: tx() });
    } catch (e: any) {
      const msg = String(e?.message || e);

      if (msg.includes("UNIQUE") && (msg.includes("rfid_uid") || msg.includes("user_badges.uid"))) {
        return reply.code(409).send({ error: "Badge déjà utilisé par un autre utilisateur" });
      }

      return reply.code(500).send({ error: "Internal error" });
    }
  });

  // UPDATE USER (name/email/is_active)
  app.patch("/api/admin/users/:id", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      is_active: z.boolean().optional(),
    });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const db = getDB();
    const { id } = p.data;

    const existing = db.prepare(`SELECT id FROM users WHERE id=? AND deleted_at IS NULL`).get(id);
    if (!existing) return reply.code(404).send({ error: "User not found" });

    const updates: string[] = [];
    const args: any[] = [];

    if (b.data.name !== undefined) { updates.push("name=?"); args.push(b.data.name.trim()); }
    if (b.data.email !== undefined) { updates.push("email=?"); args.push(b.data.email.trim()); }
    if (b.data.is_active !== undefined) { updates.push("is_active=?"); args.push(b.data.is_active ? 1 : 0); }

    if (updates.length === 0) return reply.send({ ok: true });

    args.push(id);
    db.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id=?`).run(...args);
    return reply.send({ ok: true });
  });

  // ADD BADGE
  app.post("/api/admin/users/:id/badge", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const bodySchema = z.object({ rfid_uid: z.string().min(1) });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const { id } = p.data;
    const uid = normUid(b.data.rfid_uid);

    const db = getDB();
    const user = db.prepare(`SELECT id, rfid_uid FROM users WHERE id=? AND deleted_at IS NULL`).get(id) as any;
    if (!user) return reply.code(404).send({ error: "User not found" });

    try {
      const tx = db.transaction(() => {
        db.prepare(`
          INSERT INTO user_badges (user_id, uid)
          VALUES (?, ?)
        `).run(id, uid);

        if (!user.rfid_uid) {
          db.prepare(`UPDATE users SET rfid_uid=? WHERE id=?`).run(uid, id);
        }
      });

      tx();

      const badges = db.prepare(`
        SELECT uid
        FROM user_badges
        WHERE user_id = ?
        ORDER BY created_at ASC, id ASC
      `).all(id) as Array<{ uid: string }>;

      return reply.send({ ok: true, badge_uids: badges.map((badge) => badge.uid) });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("UNIQUE") && (msg.includes("rfid_uid") || msg.includes("user_badges.uid"))) {
        return reply.code(409).send({ error: "Badge déjà utilisé par un autre utilisateur" });
      }
      return reply.code(500).send({ error: "Internal error" });
    }
  });

  // REMOVE BADGE
  app.delete("/api/admin/users/:id/badge", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const bodySchema = z.object({ rfid_uid: z.string().min(1) });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const { id } = p.data;
    const uid = normUid(b.data.rfid_uid);
    const db = getDB();

    const user = db.prepare(`SELECT id, rfid_uid FROM users WHERE id=? AND deleted_at IS NULL`).get(id) as any;
    if (!user) return reply.code(404).send({ error: "User not found" });

    const existing = db.prepare(`
      SELECT id FROM user_badges WHERE user_id = ? AND uid = ?
    `).get(id, uid) as any;
    if (!existing) return reply.code(404).send({ error: "Badge not found" });

    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM user_badges WHERE user_id = ? AND uid = ?`).run(id, uid);

      if (user.rfid_uid === uid) {
        const next = db.prepare(`
          SELECT uid FROM user_badges WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1
        `).get(id) as any;
        db.prepare(`UPDATE users SET rfid_uid=? WHERE id=?`).run(next?.uid ?? null, id);
      }
    });

    tx();
    return reply.send({ ok: true });
  });

  // TOP UP / ADJUST BALANCE
  app.post("/api/admin/users/:id/topup", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const bodySchema = z.object({
      amount_cents: z.number().int().refine((value) => value !== 0, { message: "amount must be non-zero" }),
      comment: z.string().trim().min(1),
      payment_date: paymentDateSchema.optional(),
      payment_method: paymentMethodSchema.optional(),
    });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const { id } = p.data;
    const { amount_cents, comment, payment_date, payment_method } = b.data;
    const db = getDB();

    if (amount_cents > 0 && (!payment_date || !payment_method)) {
      return reply.code(400).send({ error: "payment_date and payment_method are required for topups" });
    }

    try {
      const tx = db.transaction(() => {
        const user = db.prepare(`
          SELECT id, balance_cents
          FROM users
          WHERE id=? AND deleted_at IS NULL
        `).get(id) as any;
        if (!user) throw new Error("USER_NOT_FOUND");

        const nextBalance = Number(user.balance_cents ?? 0) + amount_cents;
        if (nextBalance < 0) throw new Error("BALANCE_BELOW_ZERO");

        db.prepare(`
          UPDATE users
          SET balance_cents = ?
          WHERE id = ?
        `).run(nextBalance, id);

        const transactionId = randomUUID();
        db.prepare(`
          INSERT INTO account_transactions (
            id, user_id, delta_cents, reason, comment, payment_date, payment_method
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          transactionId,
          id,
          amount_cents,
          amount_cents > 0 ? "topup" : "adjustment",
          comment.trim(),
          amount_cents > 0 ? payment_date : null,
          amount_cents > 0 ? payment_method : null
        );

        return nextBalance;
      });

      return reply.send({ ok: true, balance_cents: tx() });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("USER_NOT_FOUND")) return reply.code(404).send({ error: "User not found" });
      if (msg.includes("BALANCE_BELOW_ZERO")) {
        return reply.code(409).send({ error: "Balance cannot go below 0" });
      }
      return reply.code(500).send({ error: "Internal error" });
    }
  });

  app.get("/api/admin/topups", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const querySchema = z.object({
      name: z.string().optional(),
      from: paymentDateSchema.optional(),
      to: paymentDateSchema.optional(),
      method: paymentMethodSchema.optional(),
    });

    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid query" });

    const where: string[] = ["at.reason = 'topup'", "at.delta_cents > 0", "u.deleted_at IS NULL"];
    const args: Array<string> = [];
    const name = parsed.data.name?.trim();

    if (name) {
      where.push("LOWER(u.name) LIKE ?");
      args.push(`%${name.toLowerCase()}%`);
    }
    if (parsed.data.from) {
      where.push("COALESCE(at.payment_date, date(at.created_at)) >= ?");
      args.push(parsed.data.from);
    }
    if (parsed.data.to) {
      where.push("COALESCE(at.payment_date, date(at.created_at)) <= ?");
      args.push(parsed.data.to);
    }
    if (parsed.data.method) {
      where.push("at.payment_method = ?");
      args.push(parsed.data.method);
    }

    const db = getDB();
    const rows = db.prepare(`
      SELECT
        at.id,
        at.user_id,
        u.name AS user_name,
        u.email AS user_email,
        at.delta_cents,
        at.comment,
        at.payment_date,
        at.payment_method,
        at.created_at
      FROM account_transactions at
      JOIN users u ON u.id = at.user_id
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(at.payment_date, date(at.created_at)) DESC, at.created_at DESC
    `).all(...args) as Array<{
      id: string;
      user_id: number;
      user_name: string;
      user_email: string | null;
      delta_cents: number;
      comment: string;
      payment_date: string | null;
      payment_method: "bank_transfer" | "cash" | null;
      created_at: string;
    }>;

    return reply.send({
      topups: rows.map((row) => ({
        ...row,
        delta_cents: Number(row.delta_cents ?? 0),
      })),
    });
  });

  app.get("/api/admin/badge-requests", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const querySchema = z.object({
      status: z.enum(["pending", "approved", "rejected", "all"]).optional().default("pending"),
    });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid query" });

    const db = getDB();
    const args: string[] = [];
    const where = parsed.data.status === "all" ? "" : "WHERE br.status = ?";
    if (parsed.data.status !== "all") args.push(parsed.data.status);

    const requests = db.prepare(`
      SELECT
        br.id,
        br.name,
        br.email,
        br.uid,
        br.normalized_uid,
        br.status,
        br.requested_at,
        br.reviewed_at,
        br.approved_user_id,
        u.name AS approved_user_name
      FROM badge_requests br
      LEFT JOIN users u ON u.id = br.approved_user_id
      ${where}
      ORDER BY br.requested_at DESC
    `).all(...args);

    return { requests };
  });

  app.post("/api/admin/badge-requests/:id/approve", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const paramsSchema = z.object({ id: z.string().min(1) });
    const p = paramsSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "Invalid request id" });

    const db = getDB();
    const request = db.prepare(`
      SELECT id, name, email, uid, normalized_uid, status
      FROM badge_requests
      WHERE id = ?
    `).get(p.data.id) as {
      id: string;
      name: string;
      email: string;
      uid: string;
      normalized_uid: string;
      status: "pending" | "approved" | "rejected";
    } | undefined;

    if (!request) return reply.code(404).send({ error: "Demande introuvable" });
    if (request.status !== "pending") {
      return reply.code(409).send({ error: "Cette demande a déjà été traitée" });
    }

    const uidCandidates = badgeMatchCandidates(request.uid);
    const existingUser = db
      .prepare(badgeExistsSql(uidCandidates.length))
      .get(...uidCandidates, ...uidCandidates);

    if (existingUser) {
      return reply.code(409).send({ error: "Ce badge est déjà lié à un compte." });
    }

    try {
      const tx = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO users (name, email, rfid_uid, is_active, balance_cents)
          VALUES (?, ?, ?, 1, 0)
        `).run(request.name.trim(), request.email.trim(), request.normalized_uid);

        const userId = Number(result.lastInsertRowid);

        db.prepare(`
          INSERT INTO user_badges (user_id, uid)
          VALUES (?, ?)
        `).run(userId, request.normalized_uid);

        db.prepare(`
          UPDATE badge_requests
          SET status = 'approved',
              reviewed_at = datetime('now'),
              approved_user_id = ?
          WHERE id = ?
        `).run(userId, request.id);

        return userId;
      });

      return reply.send({ ok: true, user_id: tx() });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("UNIQUE") && (msg.includes("rfid_uid") || msg.includes("user_badges.uid"))) {
        return reply.code(409).send({ error: "Badge déjà utilisé par un autre utilisateur" });
      }
      req.log.error({ error: e }, "badge request approval failed");
      return reply.code(500).send({ error: "Impossible d'approuver la demande." });
    }
  });

  app.post("/api/admin/badge-requests/:id/reject", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const paramsSchema = z.object({ id: z.string().min(1) });
    const p = paramsSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "Invalid request id" });

    const db = getDB();
    const result = db.prepare(`
      UPDATE badge_requests
      SET status = 'rejected',
          reviewed_at = datetime('now')
      WHERE id = ?
        AND status = 'pending'
    `).run(p.data.id);

    if (result.changes === 0) {
      return reply.code(404).send({ error: "Demande en attente introuvable" });
    }

    return reply.send({ ok: true });
  });

  async function handleDeleteUser(req: any, reply: any) {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const paramsSchema = z.object({ id: z.coerce.number().int().positive() });
    const p = paramsSchema.safeParse(req.params);
    if (!p.success) return reply.code(400).send({ error: "Invalid user id" });

    const result = await softDeleteUser(p.data.id);
    if ("error" in result) return reply.code(result.status).send({ error: result.error });
    return reply.send(result);
  }

  // SOFT DELETE USER
  app.delete("/api/admin/users/:id", handleDeleteUser);
  app.post("/api/admin/users/:id/delete", handleDeleteUser);
}
