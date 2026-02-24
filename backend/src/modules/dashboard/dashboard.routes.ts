import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import redis from "../../lib/redis.js";
import { authenticate } from "../../middleware/auth.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /api/dashboard — Сводка для дашборда
  app.get("/", async (request, reply) => {
    const orgId = request.user.organizationId;
    const cacheKey = `dashboard:${orgId}`;

    const cached = await redis.get(cacheKey);
    if (cached) {
      return reply.send({ success: true, data: JSON.parse(cached) });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekLater = new Date(today);
    weekLater.setDate(weekLater.getDate() + 7);

    const [
      totalOrders,
      newOrders,
      inProgressOrders,
      overdueOrders,
      readyOrders,
      dueThisWeek,
      urgentOrders,
      totalClients,
      recentOrders,
      stageStats,
    ] = await Promise.all([
      prisma.order.count({ where: { organizationId: orgId } }),
      prisma.order.count({ where: { organizationId: orgId, status: "NEW" } }),
      prisma.order.count({ where: { organizationId: orgId, status: "IN_PROGRESS" } }),
      prisma.order.count({
        where: {
          organizationId: orgId,
          status: { in: ["NEW", "IN_PROGRESS", "REWORK", "ASSEMBLY"] },
          dueDate: { lt: today },
        },
      }),
      prisma.order.count({ where: { organizationId: orgId, status: "READY" } }),
      prisma.order.count({
        where: {
          organizationId: orgId,
          status: { in: ["NEW", "IN_PROGRESS", "REWORK", "ASSEMBLY"] },
          dueDate: { gte: today, lte: weekLater },
        },
      }),
      prisma.order.count({ where: { organizationId: orgId, isUrgent: true, status: { notIn: ["DELIVERED", "CANCELLED"] } } }),
      prisma.client.count({ where: { organizationId: orgId, isActive: true } }),
      prisma.order.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          client: { select: { name: true, shortName: true } },
          patient: { select: { lastName: true, firstName: true } },
        },
      }),
      prisma.orderStage.groupBy({
        by: ["status"],
        where: { order: { organizationId: orgId, status: { notIn: ["DELIVERED", "CANCELLED"] } } },
        _count: true,
      }),
    ]);

    const data = {
      counters: {
        totalOrders,
        newOrders,
        inProgressOrders,
        overdueOrders,
        readyOrders,
        dueThisWeek,
        urgentOrders,
        totalClients,
      },
      recentOrders,
      stageStats,
    };

    await redis.setex(cacheKey, 120, JSON.stringify(data)); // Кэш 2 минуты
    reply.send({ success: true, data });
  });
}
