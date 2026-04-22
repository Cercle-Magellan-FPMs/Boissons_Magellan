import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";

function normUid(uid: string) {
  return uid.trim().toUpperCase();
}

export async function adminUserRoutes(app: FastifyInstance) {
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
      email: z.string().email().optional().or(z.literal("")).optional(),
      is_active: z.boolean().optional().default(true),
      rfid_uid: z.string().optional().or(z.literal("")).optional(), // optionnel
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const name = parsed.data.name.trim();
    const email = parsed.data.email ? parsed.data.email.trim() : null;
    const is_active = parsed.data.is_active ? 1 : 0;
    const rfid_uid = parsed.data.rfid_uid ? normUid(parsed.data.rfid_uid) : null;

    const db = getDB();

    try {
      const tx = db.transaction(() => {
        const result = db.prepare(`
          INSERT INTO users (name, email, rfid_uid, is_active, balance_cents)
          VALUES (?, ?, ?, ?, 0)
        `).run(name, email || null, rfid_uid, is_active);

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
      email: z.string().email().nullable().optional(),
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
    if (b.data.email !== undefined) { updates.push("email=?"); args.push(b.data.email); }
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
      comment: z.string().optional(),
    });

    const p = paramsSchema.safeParse(req.params);
    const b = bodySchema.safeParse(req.body);
    if (!p.success || !b.success) return reply.code(400).send({ error: "Invalid payload" });

    const { id } = p.data;
    const { amount_cents, comment } = b.data;
    const db = getDB();

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

        db.prepare(`
          INSERT INTO account_transactions (id, user_id, delta_cents, reason, comment)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          id,
          amount_cents,
          amount_cents > 0 ? "topup" : "adjustment",
          comment?.trim() || null
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
