import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDB } from "../../db/db.js";
import { requireAdmin } from "./_auth.js";

function normUid(uid: string) {
  return uid.trim().toUpperCase();
}

export async function adminUserRoutes(app: FastifyInstance) {
  // LIST USERS
  app.get("/api/admin/users", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const db = getDB();
    const users = db.prepare(`
      SELECT id, name, email, rfid_uid, is_active, created_at
      FROM users
      ORDER BY name ASC
    `).all();

    return { users };
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
      db.prepare(`
        INSERT INTO users (name, email, rfid_uid, is_active)
        VALUES (?, ?, ?, ?)
      `).run(name, email || null, rfid_uid, is_active);

      const created = db.prepare(`SELECT id FROM users WHERE name=? ORDER BY id DESC LIMIT 1`).get(name) as any;
      return reply.send({ ok: true, user_id: created?.id });
    } catch (e: any) {
      const msg = String(e?.message || e);

      // rfid_uid unique
      if (msg.includes("UNIQUE") && msg.includes("rfid_uid")) {
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

    const existing = db.prepare(`SELECT id FROM users WHERE id=?`).get(id);
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

  // LINK / REPLACE BADGE
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
    const user = db.prepare(`SELECT id FROM users WHERE id=?`).get(id);
    if (!user) return reply.code(404).send({ error: "User not found" });

    try {
      db.prepare(`UPDATE users SET rfid_uid=? WHERE id=?`).run(uid, id);
      return reply.send({ ok: true });
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes("UNIQUE") && msg.includes("rfid_uid")) {
        return reply.code(409).send({ error: "Badge déjà utilisé par un autre utilisateur" });
      }
      return reply.code(500).send({ error: "Internal error" });
    }
  });
}
