import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";

import { authRoutes } from "./modules/auth/auth.routes.js";
import { ordersRoutes } from "./modules/orders/orders.routes.js";
import { clientsRoutes } from "./modules/clients/clients.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";
import { workCatalogRoutes } from "./modules/work-catalog/work-catalog.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { warehouseRoutes } from "./modules/warehouse/warehouse.routes.js";
import { financeRoutes } from "./modules/finance/finance.routes.js";
import { salaryRoutes } from "./modules/salary/salary.routes.js";
import { logisticsRoutes } from "./modules/logistics/logistics.routes.js";
import { photosRoutes } from "./modules/photos/photos.routes.js";
import { reportsRoutes } from "./modules/reports/reports.routes.js";
import { notificationsRoutes } from "./modules/notifications/notifications.routes.js";
import { settingsRoutes } from "./modules/settings/settings.routes.js";
import { pricingRoutes } from "./modules/pricing/pricing.routes.js";
import { accountsRoutes } from "./modules/accounts/accounts.routes.js";
import { creditsRoutes } from "./modules/credits/credits.routes.js";
import { budgetRoutes } from "./modules/budget/budget.routes.js";
import { subcontractorsRoutes } from "./modules/subcontractors/subcontractors.routes.js";
import { qualityRoutes } from "./modules/quality/quality.routes.js";
import { analyticsRoutes } from "./modules/analytics/analytics.routes.js";
import { suppliersRoutes } from "./modules/suppliers/suppliers.routes.js";
import { AppError } from "./lib/errors.js";
import prisma from "./lib/prisma.js";
import redis from "./lib/redis.js";

const PORT = parseInt(process.env.PORT || "4500");
const HOST = "0.0.0.0";

async function main() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "development" ? "info" : "warn",
      transport: process.env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
    },
  });

  app.register(cors, { origin: true, credentials: true });
  app.register(helmet, { contentSecurityPolicy: false });
  app.register(jwt, {
    secret: process.env.JWT_SECRET || "zetta-dev-secret-change-in-production",
  });
  app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        error: { code: error.code, message: error.message },
      });
    }
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: { code: "VALIDATION_ERROR", message: error.message },
      });
    }
    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: { code: "RATE_LIMIT", message: "Слишком много запросов" },
      });
    }
    app.log.error(error);
    reply.status(500).send({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" },
    });
  });

  app.get("/api/health", async () => ({
    status: "ok",
    service: "zetta-lab-api",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
  }));

  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(ordersRoutes, { prefix: "/api/orders" });
  app.register(clientsRoutes, { prefix: "/api/clients" });
  app.register(usersRoutes, { prefix: "/api/users" });
  app.register(workCatalogRoutes, { prefix: "/api/work-catalog" });
  app.register(dashboardRoutes, { prefix: "/api/dashboard" });
  app.register(warehouseRoutes, { prefix: "/api/warehouse" });
  app.register(financeRoutes, { prefix: "/api/finance" });
  app.register(salaryRoutes, { prefix: "/api/salary" });
  app.register(logisticsRoutes, { prefix: "/api/logistics" });
  app.register(photosRoutes, { prefix: "/api/photos" });
  app.register(reportsRoutes, { prefix: "/api/reports" });
  app.register(notificationsRoutes, { prefix: "/api/notifications" });
  app.register(settingsRoutes, { prefix: "/api/settings" });
  app.register(pricingRoutes, { prefix: "/api/pricing" });
  app.register(accountsRoutes, { prefix: "/api/accounts" });
  app.register(creditsRoutes, { prefix: "/api/credits" });
  app.register(budgetRoutes, { prefix: "/api/budget" });
  app.register(subcontractorsRoutes, { prefix: "/api/subcontractors" });
  app.register(qualityRoutes, { prefix: "/api/quality" });
  app.register(analyticsRoutes, { prefix: "/api/analytics" });
  app.register(suppliersRoutes, { prefix: "/api/suppliers" });

  try {
    await prisma.$connect();
    app.log.info("PostgreSQL connected");

    await redis.ping();
    app.log.info("Redis connected");

    await app.listen({ port: PORT, host: HOST });
    app.log.info(`Zetta Lab API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`${signal} received, shutting down...`);
      await app.close();
      await prisma.$disconnect();
      redis.disconnect();
      process.exit(0);
    });
  }
}

main();
