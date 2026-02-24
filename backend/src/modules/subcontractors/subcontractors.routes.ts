import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const createSubcontractorSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  specializations: z.string().optional(),
  inn: z.string().optional(),
  bankName: z.string().optional(),
  settlementAccount: z.string().optional(),
  correspondentAccount: z.string().optional(),
  bik: z.string().optional(),
  priceListId: z.string().optional(),
  notes: z.string().optional(),
});

const createOrderSchema = z.object({
  subcontractorId: z.string(),
  orderId: z.string(),
  description: z.string().min(1, "Описание обязательно"),
  price: z.number().min(0),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export async function subcontractorsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ======== CRUD СУБПОДРЯДЧИКОВ ========

  // GET /api/subcontractors
  app.get("/", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { isActive } = request.query as { isActive?: string };

    const where: Prisma.SubcontractorWhereInput = { organizationId: orgId };
    if (isActive !== undefined) where.isActive = isActive === "true";

    const subcontractors = await prisma.subcontractor.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { orders: true } },
      },
    });

    reply.send({ success: true, data: subcontractors });
  });

  // GET /api/subcontractors/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const sub = await prisma.subcontractor.findFirst({
      where: { id, organizationId: orgId },
      include: {
        orders: {
          orderBy: { sentAt: "desc" },
          take: 50,
          include: {
            order: {
              select: { orderNumber: true, client: { select: { name: true, shortName: true } } },
            },
          },
        },
        _count: { select: { orders: true } },
      },
    });

    if (!sub) throw new NotFoundError("Субподрядчик");
    reply.send({ success: true, data: sub });
  });

  // POST /api/subcontractors
  app.post("/", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = createSubcontractorSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const sub = await prisma.subcontractor.create({
      data: {
        organizationId: request.user.organizationId,
        ...parsed.data,
        email: parsed.data.email || undefined,
      },
    });

    reply.status(201).send({ success: true, data: sub });
  });

  // PATCH /api/subcontractors/:id
  app.patch("/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.subcontractor.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundError("Субподрядчик");

    const parsed = createSubcontractorSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const sub = await prisma.subcontractor.update({
      where: { id },
      data: { ...parsed.data, email: parsed.data.email || undefined },
    });

    reply.send({ success: true, data: sub });
  });

  // DELETE /api/subcontractors/:id
  app.delete("/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.subcontractor.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundError("Субподрядчик");

    // Мягкое удаление — деактивируем
    await prisma.subcontractor.update({
      where: { id },
      data: { isActive: false },
    });

    reply.send({ success: true, data: { deleted: true } });
  });

  // ======== ЗАКАЗЫ СУБПОДРЯДЧИКАМ ========

  // POST /api/subcontractors/orders — Отправить работу субподрядчику
  app.post("/orders", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;

    // Проверяем субподрядчика и наряд
    const [sub, order] = await Promise.all([
      prisma.subcontractor.findFirst({ where: { id: parsed.data.subcontractorId, organizationId: orgId } }),
      prisma.order.findFirst({ where: { id: parsed.data.orderId, organizationId: orgId } }),
    ]);
    if (!sub) throw new NotFoundError("Субподрядчик");
    if (!order) throw new NotFoundError("Наряд");

    const subOrder = await prisma.subcontractorOrder.create({
      data: {
        subcontractorId: parsed.data.subcontractorId,
        orderId: parsed.data.orderId,
        description: parsed.data.description,
        price: parsed.data.price,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        notes: parsed.data.notes,
      },
      include: {
        subcontractor: { select: { name: true } },
        order: { select: { orderNumber: true } },
      },
    });

    reply.status(201).send({ success: true, data: subOrder });
  });

  // PATCH /api/subcontractors/orders/:id — Обновить статус
  app.patch("/orders/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.subcontractorOrder.findFirst({
      where: { id, subcontractor: { organizationId: request.user.organizationId } },
    });
    if (!existing) throw new NotFoundError("Заказ субподрядчику");

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.isPaid !== undefined) {
      data.isPaid = body.isPaid;
      if (body.isPaid) data.paidAt = new Date();
    }
    if (body.paidAmount !== undefined) data.paidAmount = body.paidAmount;
    if (body.completedAt) data.completedAt = new Date(body.completedAt as string);
    if (body.status === "COMPLETED" && !existing.completedAt) data.completedAt = new Date();
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.description !== undefined) data.description = body.description;
    if (body.price !== undefined) data.price = body.price;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate as string) : null;

    const updated = await prisma.subcontractorOrder.update({
      where: { id },
      data,
    });

    reply.send({ success: true, data: updated });
  });

  // ======== РАСЧЁТЫ ЗА ПЕРИОД ========

  // GET /api/subcontractors/:id/settlements?dateFrom=...&dateTo=...
  app.get("/:id/settlements", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { dateFrom, dateTo } = request.query as { dateFrom?: string; dateTo?: string };
    const orgId = request.user.organizationId;

    const sub = await prisma.subcontractor.findFirst({ where: { id, organizationId: orgId } });
    if (!sub) throw new NotFoundError("Субподрядчик");

    const where: Prisma.SubcontractorOrderWhereInput = { subcontractorId: id };
    if (dateFrom || dateTo) {
      where.sentAt = {};
      if (dateFrom) where.sentAt.gte = new Date(dateFrom);
      if (dateTo) where.sentAt.lte = new Date(dateTo);
    }

    const orders = await prisma.subcontractorOrder.findMany({
      where,
      orderBy: { sentAt: "desc" },
      include: {
        order: { select: { orderNumber: true, client: { select: { name: true, shortName: true } } } },
      },
    });

    const totalAmount = orders.reduce((s, o) => s + Number(o.price), 0);
    const paidAmount = orders.filter(o => o.isPaid).reduce((s, o) => s + Number(o.paidAmount || o.price), 0);
    const unpaidAmount = totalAmount - paidAmount;
    const completedCount = orders.filter(o => o.status === "COMPLETED").length;

    reply.send({
      success: true,
      data: {
        subcontractor: sub,
        orders,
        summary: { totalAmount, paidAmount, unpaidAmount, totalOrders: orders.length, completedCount },
      },
    });
  });

  // ======== ЦЕНЫ СУБПОДРЯДЧИКА ========

  // GET /api/subcontractors/:id/prices — Индивидуальные цены
  app.get("/:id/prices", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const sub = await prisma.subcontractor.findFirst({ where: { id, organizationId: orgId } });
    if (!sub) throw new NotFoundError("Субподрядчик");

    const prices = await prisma.subcontractorPriceItem.findMany({
      where: { subcontractorId: id },
      include: {
        workItem: { select: { id: true, name: true, code: true, basePrice: true, unit: true, category: { select: { name: true } } } },
      },
      orderBy: { workItem: { code: "asc" } },
    });

    reply.send({ success: true, data: prices });
  });

  // PUT /api/subcontractors/:id/prices — Установить/обновить цену
  app.put("/:id/prices", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workItemId, price } = request.body as { workItemId: string; price: number };
    const orgId = request.user.organizationId;

    const sub = await prisma.subcontractor.findFirst({ where: { id, organizationId: orgId } });
    if (!sub) throw new NotFoundError("Субподрядчик");

    if (!workItemId || price === undefined) {
      throw new ValidationError("Укажите workItemId и price");
    }

    const priceItem = await prisma.subcontractorPriceItem.upsert({
      where: { subcontractorId_workItemId: { subcontractorId: id, workItemId } },
      update: { price },
      create: { subcontractorId: id, workItemId, price },
      include: {
        workItem: { select: { id: true, name: true, code: true, basePrice: true, unit: true } },
      },
    });

    reply.send({ success: true, data: priceItem });
  });

  // DELETE /api/subcontractors/:id/prices/:workItemId — Удалить цену
  app.delete("/:id/prices/:workItemId", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id, workItemId } = request.params as { id: string; workItemId: string };
    const orgId = request.user.organizationId;

    const sub = await prisma.subcontractor.findFirst({ where: { id, organizationId: orgId } });
    if (!sub) throw new NotFoundError("Субподрядчик");

    await prisma.subcontractorPriceItem.deleteMany({ where: { subcontractorId: id, workItemId } });
    reply.send({ success: true, data: { deleted: true } });
  });

  // ======== СВОДКА ========

  // GET /api/subcontractors/summary — Общая сводка по субподрядчикам
  app.get("/summary", async (request, reply) => {
    const orgId = request.user.organizationId;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUnpaid, monthTotal, activeOrders] = await Promise.all([
      prisma.subcontractorOrder.aggregate({
        where: { subcontractor: { organizationId: orgId }, isPaid: false, status: { not: "CANCELLED" } },
        _sum: { price: true },
        _count: true,
      }),
      prisma.subcontractorOrder.aggregate({
        where: { subcontractor: { organizationId: orgId }, sentAt: { gte: monthStart } },
        _sum: { price: true },
        _count: true,
      }),
      prisma.subcontractorOrder.count({
        where: {
          subcontractor: { organizationId: orgId },
          status: { in: ["SENT", "IN_PROGRESS"] },
        },
      }),
    ]);

    reply.send({
      success: true,
      data: {
        totalUnpaid: Number(totalUnpaid._sum.price || 0),
        unpaidCount: totalUnpaid._count,
        monthTotal: Number(monthTotal._sum.price || 0),
        monthCount: monthTotal._count,
        activeOrders,
      },
    });
  });
}
