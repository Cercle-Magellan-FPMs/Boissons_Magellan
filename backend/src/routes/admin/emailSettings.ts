import fs from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "./_auth.js";
import { resetMailTransporter, sendMail } from "../../lib/mailer.js";

const SMTP_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
] as const;

type SmtpKey = typeof SMTP_KEYS[number];

function envPath() {
  return path.resolve(process.cwd(), ".env");
}

function readEnvFile() {
  try {
    return fs.readFileSync(envPath(), "utf8");
  } catch (error: any) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function parseEnv(content: string) {
  const values = new Map<string, string>();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2] ?? "";
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const key = match[1];
    if (key) values.set(key, value);
  }
  return values;
}

function serializeEnvValue(value: string) {
  if (/^[A-Za-z0-9_@./:+-]*$/.test(value)) return value;
  return JSON.stringify(value);
}

function writeEnvValues(nextValues: Record<SmtpKey, string>) {
  const original = readEnvFile();
  const seen = new Set<string>();
  const lines = original.split(/\r?\n/).map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) return line;
    const key = match[2] as SmtpKey;
    if (!SMTP_KEYS.includes(key)) return line;
    seen.add(key);
    return `${match[1]}${key}${match[3]}${serializeEnvValue(nextValues[key])}`;
  });

  for (const key of SMTP_KEYS) {
    if (!seen.has(key)) lines.push(`${key}=${serializeEnvValue(nextValues[key])}`);
  }

  const file = envPath();
  const content = lines.join("\n").replace(/\n*$/, "\n");
  fs.writeFileSync(file, content, { mode: 0o600 });
  fs.chmodSync(file, 0o600);

  for (const key of SMTP_KEYS) process.env[key] = nextValues[key];
  resetMailTransporter();
}

function currentSmtpSettings() {
  const values = parseEnv(readEnvFile());
  const get = (key: SmtpKey) => values.get(key) ?? process.env[key] ?? "";
  return {
    host: get("SMTP_HOST"),
    port: Number(get("SMTP_PORT") || 587),
    secure: String(get("SMTP_SECURE") || "false").toLowerCase() === "true",
    user: get("SMTP_USER"),
    from: get("SMTP_FROM"),
    password_configured: Boolean(get("SMTP_PASS")),
  };
}

export async function adminEmailSettingsRoutes(app: FastifyInstance) {
  app.get("/api/admin/email-settings", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode || 500).send({ error: e.message });
    }

    return currentSmtpSettings();
  });

  app.put("/api/admin/email-settings", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode || 500).send({ error: e.message });
    }

    const schema = z.object({
      host: z.string().trim().min(1),
      port: z.number().int().min(1).max(65535),
      secure: z.boolean(),
      user: z.string().trim().min(1),
      password: z.string().optional(),
      from: z.string().trim().min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const existing = parseEnv(readEnvFile());
    const existingPassword = existing.get("SMTP_PASS") ?? process.env.SMTP_PASS ?? "";
    const password = parsed.data.password?.trim() || existingPassword;
    if (!password) {
      return reply.code(400).send({ error: "SMTP password is required" });
    }

    writeEnvValues({
      SMTP_HOST: parsed.data.host.trim(),
      SMTP_PORT: String(parsed.data.port),
      SMTP_SECURE: String(parsed.data.secure),
      SMTP_USER: parsed.data.user.trim(),
      SMTP_PASS: password,
      SMTP_FROM: parsed.data.from.trim(),
    });

    return { ok: true, settings: currentSmtpSettings() };
  });

  app.post("/api/admin/email-settings/test", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode || 500).send({ error: e.message });
    }

    const schema = z.object({
      to: z.string().trim().email(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid test email" });

    try {
      await sendMail({
        to: parsed.data.to,
        subject: "Test email Boissons Magellan",
        text: [
          "Ceci est un email de test envoye depuis l'admin Boissons Magellan.",
          "",
          "Si vous le recevez, la configuration SMTP est fonctionnelle.",
        ].join("\n"),
      });
      return { ok: true };
    } catch (error: any) {
      req.log.error({ error }, "smtp test failed");
      if (String(error?.message || "").startsWith("MAIL_NOT_CONFIGURED:")) {
        return reply.code(500).send({ error: "Configuration SMTP incomplete." });
      }
      return reply.code(500).send({ error: "Impossible d'envoyer l'email de test." });
    }
  });
}
