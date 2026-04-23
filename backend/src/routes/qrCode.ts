import type { FastifyInstance } from "fastify";
import { createHmac, randomBytes } from "crypto";
import { z } from "zod";
import QRCode from "qrcode";
import { getDB } from "../db/db.js";
import { requireAdmin } from "./admin/_auth.js";

type QrSettings = {
  recipient_name: string;
  iban: string;
  bic: string;
  remittance_prefix: string;
};

function eurosAmountFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function normalizeIban(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function normalizeBic(raw: string) {
  return raw.replace(/\s+/g, "").toUpperCase();
}

function validateIban(iban: string) {
  return /^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban);
}

function validateBic(bic: string) {
  return /^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic);
}

function loadQrSettings(): QrSettings {
  const db = getDB();
  const row = db.prepare(`
    SELECT recipient_name, iban, bic, remittance_prefix
    FROM qr_payment_settings
    WHERE id = 1
  `).get() as QrSettings | undefined;

  if (row) return row;

  db.prepare(`
    INSERT OR IGNORE INTO qr_payment_settings (id, recipient_name, iban, bic, remittance_prefix)
    VALUES (1, 'Cercle Magellan', 'BE70751211827125', 'NICABEBBXXX', 'Boisson')
  `).run();

  return {
    recipient_name: "Cercle Magellan",
    iban: "BE70751211827125",
    bic: "NICABEBBXXX",
    remittance_prefix: "Boisson",
  };
}

function buildEpcPayload(settings: QrSettings, amountCents: number, uniqueId: string) {
  const amount = `EUR${eurosAmountFromCents(amountCents)}`;
  const prefix = settings.remittance_prefix;
  const remittance = prefix.endsWith(" ")
    ? `${prefix}${uniqueId}`
    : `${prefix} ${uniqueId}`;

  return [
    "BCD",
    "002",
    "1",
    "SCT",
    settings.bic,
    settings.recipient_name,
    settings.iban,
    amount,
    "",
    remittance,
    "",
  ].join("\n");
}

function buildRemittance(prefix: string, uniqueId: string) {
  return prefix.endsWith(" ")
    ? `${prefix}${uniqueId}`
    : `${prefix} ${uniqueId}`;
}

function generateUniqueId() {
  return randomBytes(6).toString("hex").toUpperCase();
}

function signingSecret() {
  return process.env.QR_CODE_TOKEN_SECRET || process.env.ADMIN_TOKEN || "boissons-qr-secret";
}

function signIntent(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("hex");
}

function createIntentToken(data: {
  user_id: number;
  amount_cents: number;
  unique_id: string;
  expires_at: number;
}) {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const signature = signIntent(payload);
  return `${payload}.${signature}`;
}

function decodeIntentToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("TOKEN_INVALID");

  const payload = parts[0];
  const signature = parts[1];
  if (!payload || !signature) throw new Error("TOKEN_INVALID");
  const expected = signIntent(payload);
  if (signature !== expected) throw new Error("TOKEN_INVALID");

  const json = Buffer.from(payload, "base64url").toString("utf8");
  const data = JSON.parse(json);

  const parsed = z.object({
    user_id: z.number().int().positive(),
    amount_cents: z.number().int().positive(),
    unique_id: z.string().min(6).max(32),
    expires_at: z.number().int().positive(),
  }).safeParse(data);

  if (!parsed.success) throw new Error("TOKEN_INVALID");
  if (Date.now() > parsed.data.expires_at) throw new Error("TOKEN_EXPIRED");

  return parsed.data;
}

export async function qrCodeRoutes(app: FastifyInstance) {
  app.post("/api/kiosk/qr-code/prepare", async (req, reply) => {
    const body = z.object({
      user_id: z.number().int().positive(),
      amount_cents: z.number().int().positive(),
    }).safeParse(req.body);

    if (!body.success) return reply.code(400).send({ error: "Invalid payload" });

    const db = getDB();
    const user = db.prepare(`
      SELECT id, is_active, balance_cents
      FROM users
      WHERE id = ?
        AND deleted_at IS NULL
    `).get(body.data.user_id) as { id: number; is_active: number; balance_cents: number } | undefined;

    if (!user) return reply.code(404).send({ error: "User not found" });
    if (Number(user.is_active) !== 1) return reply.code(403).send({ error: "User disabled" });

    const amountCents = Number(body.data.amount_cents);
    const balanceCents = Number(user.balance_cents ?? 0);
    if (balanceCents >= amountCents) {
      return reply.code(409).send({ error: "Le solde est deja suffisant pour cette commande." });
    }

    const settings = loadQrSettings();
    const uniqueId = generateUniqueId();
    const epcPayload = buildEpcPayload(settings, amountCents, uniqueId);
    const remittance = buildRemittance(settings.remittance_prefix, uniqueId);

    let qrCodeDataUrl: string;
    try {
      qrCodeDataUrl = await QRCode.toDataURL(epcPayload, {
        type: "image/png",
        margin: 1,
        width: 420,
        errorCorrectionLevel: "M",
      });
    } catch (error) {
      req.log.error({ error }, "qr code generation failed");
      return reply.code(500).send({ error: "Impossible de generer le QR Code" });
    }

    const expiresAt = Date.now() + 1000 * 60 * 20;
    const intentToken = createIntentToken({
      user_id: user.id,
      amount_cents: amountCents,
      unique_id: uniqueId,
      expires_at: expiresAt,
    });

    return reply.send({
      unique_id: uniqueId,
      amount_cents: amountCents,
      recipient_name: settings.recipient_name,
      iban: settings.iban,
      bic: settings.bic,
      remittance,
      epc_payload: epcPayload,
      qr_code_data_url: qrCodeDataUrl,
      intent_token: intentToken,
      expires_at: new Date(expiresAt).toISOString(),
    });
  });

  app.post("/api/kiosk/qr-code/confirm", async (req, reply) => {
    const body = z.object({
      user_id: z.number().int().positive(),
      amount_cents: z.number().int().positive(),
      unique_id: z.string().trim().min(6).max(32),
      intent_token: z.string().min(20),
    }).safeParse(req.body);

    if (!body.success) return reply.code(400).send({ error: "Invalid payload" });

    let tokenData: {
      user_id: number;
      amount_cents: number;
      unique_id: string;
      expires_at: number;
    };

    try {
      tokenData = decodeIntentToken(body.data.intent_token);
    } catch (error: unknown) {
      const msg = String((error as Error)?.message ?? error);
      if (msg.includes("TOKEN_EXPIRED")) {
        return reply.code(409).send({ error: "Le QR Code a expire. Regenerer un nouveau QR Code." });
      }
      return reply.code(400).send({ error: "Token QR Code invalide" });
    }

    const uniqueId = body.data.unique_id.trim().toUpperCase();
    if (
      tokenData.user_id !== body.data.user_id ||
      tokenData.amount_cents !== body.data.amount_cents ||
      tokenData.unique_id !== uniqueId
    ) {
      return reply.code(400).send({ error: "Le QR Code ne correspond pas a la demande actuelle." });
    }

    const db = getDB();
    const user = db.prepare(`
      SELECT id
      FROM users
      WHERE id = ?
        AND deleted_at IS NULL
    `).get(body.data.user_id);
    if (!user) return reply.code(404).send({ error: "User not found" });

    try {
      db.prepare(`
        INSERT INTO qr_code_payments (unique_id, user_id, amount_cents, status)
        VALUES (?, ?, ?, 'unverified')
      `).run(uniqueId, body.data.user_id, body.data.amount_cents);

      return reply.send({
        ok: true,
        unique_id: uniqueId,
        status: "pas verifie",
      });
    } catch (error: unknown) {
      const message = String((error as Error)?.message ?? error);
      if (message.includes("UNIQUE")) {
        return reply.code(409).send({ error: "Ce paiement QR Code a deja ete declare." });
      }
      req.log.error({ error }, "qr code confirm failed");
      return reply.code(500).send({ error: "Erreur interne" });
    }
  });

  app.get("/api/admin/qr-code", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const query = z.object({
      status: z.enum(["verified", "unverified"]).optional(),
      name: z.string().trim().optional(),
    }).safeParse(req.query ?? {});

    if (!query.success) return reply.code(400).send({ error: "Invalid query" });

    const db = getDB();
    const where: string[] = [];
    const values: Array<string> = [];

    if (query.data.status) {
      where.push("q.status = ?");
      values.push(query.data.status);
    }

    if (query.data.name) {
      where.push("LOWER(COALESCE(u.name, '')) LIKE ?");
      values.push(`%${query.data.name.toLowerCase()}%`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const rows = db.prepare(`
      SELECT
        q.id,
        q.unique_id,
        q.user_id,
        COALESCE(u.name, '(utilisateur supprimé)') AS user_name,
        u.email AS user_email,
        q.amount_cents,
        q.created_at,
        q.status,
        q.verified_at
      FROM qr_code_payments q
      LEFT JOIN users u ON u.id = q.user_id
      ${whereSql}
      ORDER BY q.created_at DESC, q.id DESC
    `).all(...values) as Array<{
      id: number;
      unique_id: string;
      user_id: number;
      user_name: string;
      user_email: string | null;
      amount_cents: number;
      created_at: string;
      status: "verified" | "unverified";
      verified_at: string | null;
    }>;

    return reply.send({ rows });
  });

  app.patch("/api/admin/qr-code/:id", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.params);
    const body = z.object({ status: z.enum(["verified", "unverified"]) }).safeParse(req.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: "Invalid payload" });

    const db = getDB();
    const exists = db.prepare(`SELECT id FROM qr_code_payments WHERE id = ?`).get(params.data.id);
    if (!exists) return reply.code(404).send({ error: "Paiement introuvable" });

    db.prepare(`
      UPDATE qr_code_payments
      SET status = ?,
          verified_at = CASE WHEN ? = 'verified' THEN datetime('now') ELSE NULL END
      WHERE id = ?
    `).run(body.data.status, body.data.status, params.data.id);

    return reply.send({ ok: true });
  });

  app.get("/api/admin/qr-code/settings", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const settings = loadQrSettings();
    return reply.send(settings);
  });

  app.put("/api/admin/qr-code/settings", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode ?? 500).send({ error: e.message });
    }

    const body = z.object({
      recipient_name: z.string().trim().min(2).max(70),
      iban: z.string().trim().min(8).max(34),
      bic: z.string().trim().min(8).max(11),
      remittance_prefix: z.string().min(1).max(24),
    }).safeParse(req.body);

    if (!body.success) return reply.code(400).send({ error: "Invalid payload" });

    const iban = normalizeIban(body.data.iban);
    const bic = normalizeBic(body.data.bic);
    if (!validateIban(iban)) return reply.code(400).send({ error: "IBAN invalide" });
    if (!validateBic(bic)) return reply.code(400).send({ error: "BIC invalide" });

    const recipientName = body.data.recipient_name.trim();
    const remittancePrefix = body.data.remittance_prefix;
    if (!remittancePrefix.trim()) {
      return reply.code(400).send({ error: "Texte avant UNIQUE_ID obligatoire" });
    }

    const db = getDB();
    db.prepare(`
      INSERT INTO qr_payment_settings (id, recipient_name, iban, bic, remittance_prefix, updated_at)
      VALUES (1, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        recipient_name = excluded.recipient_name,
        iban = excluded.iban,
        bic = excluded.bic,
        remittance_prefix = excluded.remittance_prefix,
        updated_at = datetime('now')
    `).run(recipientName, iban, bic, remittancePrefix);

    return reply.send({
      ok: true,
      recipient_name: recipientName,
      iban,
      bic,
      remittance_prefix: remittancePrefix,
    });
  });
}
