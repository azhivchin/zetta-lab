import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";

const stopSchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  type: z.enum(["pickup", "delivery"]),
  orderIds: z.array(z.string()).default([]),
  address: z.string().optional(),
  completed: z.boolean().default(false),
  notes: z.string().optional(),
});

const createRouteSchema = z.object({
  courierId: z.string(),
  date: z.string(), // "2026-02-06"
  stops: z.array(stopSchema).min(1, "Добавьте хотя бы одну остановку"),
  notes: z.string().optional(),
});

const updateStopSchema = z.object({
  stopIndex: z.number().int().min(0),
  completed: z.boolean(),
});

export async function logisticsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/routes", async (request, reply) => {
    const { date, from, to, courierId } = request.query as Record<string, string>;
    const orgId = request.user.organizationId;

    const where: Record<string, unknown> = {
      courier: { organizationId: orgId },
    };

    if (date) {
      const d = new Date(date);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      where.date = { gte: d, lt: nextDay };
    } else if (from && to) {
      where.date = { gte: new Date(from), lte: new Date(to) };
    }

    if (courierId) {
      where.courierId = courierId;
    }

    const routes = await prisma.courierRoute.findMany({
      where: where as any,
      orderBy: { date: "desc" },
      include: {
        courier: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    reply.send({ success: true, data: routes });
  });

  app.get("/routes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const route = await prisma.courierRoute.findUnique({
      where: { id },
      include: {
        courier: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    if (!route) throw new NotFoundError("Маршрут");

    reply.send({ success: true, data: route });
  });

  app.post("/routes", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const parsed = createRouteSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    // Verify courier exists and is in the same org
    const courier = await prisma.user.findFirst({
      where: { id: parsed.data.courierId, organizationId: request.user.organizationId },
    });
    if (!courier) throw new NotFoundError("Курьер");

    const route = await prisma.courierRoute.create({
      data: {
        courierId: parsed.data.courierId,
        date: new Date(parsed.data.date),
        stops: parsed.data.stops as any,
        notes: parsed.data.notes,
      },
      include: {
        courier: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    reply.status(201).send({ success: true, data: route });
  });

  app.patch("/routes/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.courierRoute.findUnique({
      where: { id },
      include: { courier: true },
    });
    if (!existing) throw new NotFoundError("Маршрут");
    if (existing.courier.organizationId !== request.user.organizationId) {
      throw new NotFoundError("Маршрут");
    }

    const body = request.body as Record<string, unknown>;
    const route = await prisma.courierRoute.update({
      where: { id },
      data: {
        ...(body.stops ? { stops: body.stops as any } : {}),
        ...(body.notes !== undefined ? { notes: body.notes as string } : {}),
        ...(body.date ? { date: new Date(body.date as string) } : {}),
      },
      include: {
        courier: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    reply.send({ success: true, data: route });
  });

  app.patch("/routes/:id/stop", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateStopSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const route = await prisma.courierRoute.findUnique({
      where: { id },
      include: { courier: true },
    });
    if (!route) throw new NotFoundError("Маршрут");
    if (route.courier.organizationId !== request.user.organizationId) {
      throw new NotFoundError("Маршрут");
    }

    const stops = route.stops as any[];
    if (parsed.data.stopIndex >= stops.length) {
      throw new ValidationError("Неверный индекс остановки");
    }

    stops[parsed.data.stopIndex].completed = parsed.data.completed;

    const updated = await prisma.courierRoute.update({
      where: { id },
      data: { stops },
      include: {
        courier: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
    });

    reply.send({ success: true, data: updated });
  });

  app.delete("/routes/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const route = await prisma.courierRoute.findUnique({
      where: { id },
      include: { courier: true },
    });
    if (!route) throw new NotFoundError("Маршрут");
    if (route.courier.organizationId !== request.user.organizationId) {
      throw new NotFoundError("Маршрут");
    }

    await prisma.courierRoute.delete({ where: { id } });
    reply.send({ success: true, data: { deleted: true } });
  });

  app.get("/couriers", async (request, reply) => {
    const couriers = await prisma.user.findMany({
      where: {
        organizationId: request.user.organizationId,
        role: "COURIER",
        isActive: true,
      },
      select: { id: true, firstName: true, lastName: true, phone: true },
      orderBy: { lastName: "asc" },
    });

    reply.send({ success: true, data: couriers });
  });

  app.get("/pending-orders", async (request, reply) => {
    const { type } = request.query as { type?: string };
    const orgId = request.user.organizationId;

    const statusFilter = type === "delivery"
      ? { status: { in: ["READY" as const] } }
      : { status: { in: ["NEW" as const] } };

    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        ...statusFilter,
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        client: { select: { id: true, name: true, shortName: true, address: true } },
        patient: { select: { firstName: true, lastName: true } },
        dueDate: true,
        isUrgent: true,
      },
      orderBy: { dueDate: "asc" },
      take: 50,
    });

    reply.send({ success: true, data: orders });
  });
}
