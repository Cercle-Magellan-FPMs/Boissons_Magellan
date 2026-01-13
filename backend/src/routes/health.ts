import type { FastifyInstance } from "fastify";


export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return {
      status: "ok",
      ts: new Date().toISOString()
    };
  });
}
