import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { initDB } from "./db/db.js";
import { healthRoutes } from "./routes/health.js";
import { kioskRoutes } from "./routes/kiosk.js";
import { productRoutes } from "./routes/products.js";
import { orderRoutes } from "./routes/order.js";
import { adminRoutes } from "./routes/admin/admin.js";
import { adminDebtRoutes } from "./routes/admin/debts.js";
import { adminCloseMonthRoutes } from "./routes/admin/closeMonth.js";
import { adminDebtSummaryRoutes } from "./routes/admin/debtSummary.js";
import { adminDebtSummaryCurrentRoutes } from "./routes/admin/debtSummaryCurrent.js";
import { adminClosePeriodRoutes } from "./routes/admin/closePeriod.js";
import { adminUserRoutes } from "./routes/admin/users.js";


const app = Fastify({ logger: true });




await app.register(cors, {
  origin: ["http://localhost:5173"],
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
});


initDB();

app.register(healthRoutes);
app.register(kioskRoutes);
app.register(productRoutes);
app.register(orderRoutes);
app.register(adminRoutes);
app.register(adminDebtRoutes);
app.register(adminCloseMonthRoutes);
app.register(adminDebtSummaryRoutes);
app.register(adminDebtSummaryCurrentRoutes);
app.register(adminClosePeriodRoutes);
app.register(adminUserRoutes);



const PORT = Number(process.env.PORT) || 3000;

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
