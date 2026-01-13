import type { FastifyRequest } from "fastify";

export function requireAdmin(req: FastifyRequest) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) throw new Error("ADMIN_TOKEN missing");

  const token = req.headers["x-admin-token"];
  if (!token || token !== expected) {
    const err: any = new Error("Unauthorized");
    err.statusCode = 401;
    throw err;
  }
}