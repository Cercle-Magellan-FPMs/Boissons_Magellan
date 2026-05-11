import fs from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";
import { requireAdmin } from "./_auth.js";

const GUEST_MODE_KEYS = [
    "GUEST_MODE_ENABLED",
    "GUEST_MODE_DEFAULT_NAME",
] as const;

type GuestModeKey = typeof GUEST_MODE_KEYS[number];

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

function writeEnvValues(nextValues: Record<GuestModeKey, string>) {
    const original = readEnvFile();
    const seen = new Set<string>();
    const lines = original.split(/\r?\n/).map((line) => {
        const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
        if (!match) return line;
        const key = match[2] as GuestModeKey;
        if (!GUEST_MODE_KEYS.includes(key)) return line;
        seen.add(key);
        return `${match[1]}${key}${match[3]}${serializeEnvValue(nextValues[key])}`;
    });

    for (const key of GUEST_MODE_KEYS) {
        if (!seen.has(key)) lines.push(`${key}=${serializeEnvValue(nextValues[key])}`);
    }

    const file = envPath();
    const content = lines.join("\n").replace(/\n*$/, "\n");
    fs.writeFileSync(file, content, { mode: 0o600 });
    fs.chmodSync(file, 0o600);

    for (const key of GUEST_MODE_KEYS) process.env[key] = nextValues[key];
}

function currentGuestModeSettings() {
    const values = parseEnv(readEnvFile());
    const get = (key: GuestModeKey) => values.get(key) ?? process.env[key] ?? "";
    return {
        enabled: String(get("GUEST_MODE_ENABLED") || "false").toLowerCase() === "true",
        default_name: get("GUEST_MODE_DEFAULT_NAME") || "Invité",
    };
}

export async function adminGuestModeSettingsRoutes(app: FastifyInstance) {
    app.get("/api/admin/guest-mode/settings", async (req, reply) => {
        try { requireAdmin(req); } catch (e: any) {
            return reply.code(e.statusCode || 500).send({ error: e.message });
        }

        return currentGuestModeSettings();
    });

    app.put("/api/admin/guest-mode/settings", async (req, reply) => {
        try { requireAdmin(req); } catch (e: any) {
            return reply.code(e.statusCode || 500).send({ error: e.message });
        }

        type Body = { enabled: boolean; default_name?: string };
        const body = req.body as Body;

        if (typeof body?.enabled !== "boolean") {
            return reply.code(400).send({ error: "Invalid payload: 'enabled' must be a boolean" });
        }

        const defaultName = (body.default_name ?? "").trim() || "Invité";

        writeEnvValues({
            GUEST_MODE_ENABLED: String(body.enabled),
            GUEST_MODE_DEFAULT_NAME: defaultName,
        });

        return { ok: true, settings: currentGuestModeSettings() };
    });
}
