import { Buffer } from "node:buffer";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "./_auth.js";

const endpointValues = [
  "/api/status",
  "/api/info",
  "/api/health",
  "/api/battery",
  "/api/wifi",
  "/api/screen",
  "/api/storage",
  "/api/memory",
  "/api/brightness",
  "/api/volume",
  "/api/screenshot",
  "/api/reload",
  "/api/clearCache",
  "/api/url",
  "/api/mode",
  "/api/restart-ui",
  "/api/reboot",
  "/api/screen/on",
  "/api/screen/off",
  "/api/screensaver/on",
  "/api/screensaver/off",
  "/api/wake",
  "/api/lock",
  "/api/tts",
  "/api/toast",
] as const;

type FreeKioskEndpoint = typeof endpointValues[number];
type HttpMethod = "GET" | "POST";

const allowedMethods: Record<FreeKioskEndpoint, readonly HttpMethod[]> = {
  "/api/status": ["GET"],
  "/api/info": ["GET"],
  "/api/health": ["GET"],
  "/api/battery": ["GET"],
  "/api/wifi": ["GET"],
  "/api/screen": ["GET"],
  "/api/storage": ["GET"],
  "/api/memory": ["GET"],
  "/api/brightness": ["GET", "POST"],
  "/api/volume": ["GET", "POST"],
  "/api/screenshot": ["GET"],
  "/api/reload": ["GET", "POST"],
  "/api/clearCache": ["GET", "POST"],
  "/api/url": ["POST"],
  "/api/mode": ["POST"],
  "/api/restart-ui": ["GET", "POST"],
  "/api/reboot": ["GET", "POST"],
  "/api/screen/on": ["GET", "POST"],
  "/api/screen/off": ["GET", "POST"],
  "/api/screensaver/on": ["GET", "POST"],
  "/api/screensaver/off": ["GET", "POST"],
  "/api/wake": ["GET", "POST"],
  "/api/lock": ["GET", "POST"],
  "/api/tts": ["POST"],
  "/api/toast": ["POST"],
};

const proxySchema = z.object({
  base_url: z.string().trim().min(1),
  api_key: z.string().optional(),
  endpoint: z.enum(endpointValues),
  method: z.enum(["GET", "POST"]).default("GET"),
  body: z.unknown().optional(),
});

function normalizeBaseUrl(raw: string) {
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  const url = new URL(withProtocol);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("FreeKiosk URL must use http or https");
  }

  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";

  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname === "/") pathname = "";
  if (pathname.endsWith("/api")) pathname = pathname.slice(0, -4);

  return `${url.protocol}//${url.host}${pathname}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export async function adminKioskTabletRoutes(app: FastifyInstance) {
  app.post("/api/admin/kiosk-tablet/proxy", async (req, reply) => {
    try { requireAdmin(req); } catch (e: any) {
      return reply.code(e.statusCode || 500).send({ error: e.message });
    }

    const parsed = proxySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid payload" });

    const allowed = allowedMethods[parsed.data.endpoint];
    if (!allowed.includes(parsed.data.method)) {
      return reply.code(400).send({ error: `Method ${parsed.data.method} not allowed for ${parsed.data.endpoint}` });
    }

    let baseUrl: string;
    try {
      baseUrl = normalizeBaseUrl(parsed.data.base_url);
    } catch (error) {
      return reply.code(400).send({ error: errorMessage(error) });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const target = `${baseUrl}${parsed.data.endpoint}`;
      const headers: Record<string, string> = { "Accept": "*/*" };
      const apiKey = parsed.data.api_key?.trim();
      if (apiKey) headers["X-Api-Key"] = apiKey;

      let body: string | undefined;
      if (parsed.data.method === "POST" && parsed.data.body !== undefined) {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify(parsed.data.body);
      }

      const res = await fetch(target, {
        method: parsed.data.method,
        headers,
        body,
        signal: controller.signal,
      });

      const contentType = res.headers.get("content-type") || "";

      if (parsed.data.endpoint === "/api/screenshot" || contentType.startsWith("image/")) {
        const bytes = Buffer.from(await res.arrayBuffer());
        const mime = contentType || "image/png";
        return {
          ok: res.ok,
          status: res.status,
          content_type: mime,
          image_data_url: `data:${mime};base64,${bytes.toString("base64")}`,
          timestamp: Math.floor(Date.now() / 1000),
        };
      }

      const text = await res.text();
      let data: unknown = null;
      if (text) {
        try { data = JSON.parse(text); }
        catch { data = { text }; }
      }

      return {
        ok: res.ok,
        status: res.status,
        content_type: contentType,
        data,
        timestamp: Math.floor(Date.now() / 1000),
      };
    } catch (error: any) {
      req.log.error({ error }, "freekiosk proxy failed");
      const message = error?.name === "AbortError"
        ? "Timeout while contacting FreeKiosk API"
        : `FreeKiosk API unreachable: ${errorMessage(error)}`;
      return reply.code(502).send({ error: message });
    } finally {
      clearTimeout(timeout);
    }
  });
}
