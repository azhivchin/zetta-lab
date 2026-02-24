import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const FALLBACK_REWORK_CATEGORIES: Record<string, string> = {
  ceramic_chip: "Скол керамики",
  fit_issue: "Проблема посадки",
  color_mismatch: "Несоответствие цвета",
  framework_defect: "Дефект каркаса",
  cad_error: "Ошибка CAD",
  impression_issue: "Проблема слепка",
  other: "Прочее",
};

/** Загрузить причины переделок из справочника организации */
async function getReworkCategories(orgId: string): Promise<Record<string, string>> {
  const refs = await prisma.referenceList.findMany({
    where: { organizationId: orgId, type: "rework_reason", isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (refs.length === 0) return { ...FALLBACK_REWORK_CATEGORIES };
  return Object.fromEntries(refs.map(r => [r.code, r.name]));
}

const createReworkSchema = z.object({
  orderId: z.string(),
  reason: z.string().min(1, "Укажите причину"),
  category: z.string(),
  responsibleId: z.string().optional(),
  cost: z.number().min(0).default(0),
  clientId: z.string().optional(),
  notes: z.string().optional(),
});

export async function qualityRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/reworks", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { status, category, responsibleId, dateFrom, dateTo, page = "1", limit = "50" } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Prisma.ReworkWhereInput = { organizationId: orgId };
    if (status) where.status = status as Prisma.EnumReworkStatusFilter;
    if (category) where.category = category;
    if (responsibleId) where.responsibleId = responsibleId;
    if (dateFrom || dateTo) {
      where.detectedAt = {};
      if (dateFrom) where.detectedAt.gte = new Date(dateFrom);
      if (dateTo) where.detectedAt.lte = new Date(dateTo);
    }

    const [reworks, total] = await Promise.all([
      prisma.rework.findMany({
        where,
        orderBy: { detectedAt: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          order: { select: { orderNumber: true, client: { select: { name: true, shortName: true } } } },
          responsible: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.rework.count({ where }),
    ]);

    reply.send({
      success: true,
      data: { reworks, pagination: { page: parseInt(page), limit: parseInt(limit), total } },
    });
  });

  app.post("/reworks", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const parsed = createReworkSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;

    const order = await prisma.order.findFirst({
      where: { id: parsed.data.orderId, organizationId: orgId },
      select: { clientId: true },
    });
    if (!order) throw new NotFoundError("Наряд");

    const rework = await prisma.rework.create({
      data: {
        organizationId: orgId,
        orderId: parsed.data.orderId,
        reason: parsed.data.reason,
        category: parsed.data.category,
        responsibleId: parsed.data.responsibleId,
        cost: parsed.data.cost,
        clientId: parsed.data.clientId || order.clientId,
      },
      include: {
        order: { select: { orderNumber: true } },
        responsible: { select: { firstName: true, lastName: true } },
      },
    });

    reply.status(201).send({ success: true, data: rework });
  });

  app.patch("/reworks/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.rework.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundError("Переделка");

    const body = request.body as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (body.status) {
      data.status = body.status;
      if (body.status === "RESOLVED" && !existing.resolvedAt) data.resolvedAt = new Date();
    }
    if (body.resolution !== undefined) data.resolution = body.resolution;
    if (body.responsibleId !== undefined) data.responsibleId = body.responsibleId;
    if (body.cost !== undefined) data.cost = body.cost;
    if (body.reason !== undefined) data.reason = body.reason;
    if (body.category !== undefined) data.category = body.category;

    const rework = await prisma.rework.update({
      where: { id },
      data,
      include: {
        order: { select: { orderNumber: true } },
        responsible: { select: { firstName: true, lastName: true } },
      },
    });

    reply.send({ success: true, data: rework });
  });

  app.get("/stats", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { dateFrom, dateTo } = request.query as { dateFrom?: string; dateTo?: string };

    const dateFilter: Prisma.DateTimeFilter | undefined = (dateFrom || dateTo)
      ? {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        }
      : undefined;

    const where: Prisma.ReworkWhereInput = {
      organizationId: orgId,
      ...(dateFilter && { detectedAt: dateFilter }),
    };

    const [totalReworks, totalOrders, openReworks, totalCost] = await Promise.all([
      prisma.rework.count({ where }),
      prisma.order.count({
        where: {
          organizationId: orgId,
          ...(dateFilter && { receivedAt: dateFilter }),
        },
      }),
      prisma.rework.count({ where: { ...where, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
      prisma.rework.aggregate({ where, _sum: { cost: true } }),
    ]);

    const reworkRate = totalOrders > 0 ? Math.round((totalReworks / totalOrders) * 100 * 10) / 10 : 0;

    const byCategory = await prisma.rework.groupBy({
      by: ["category"],
      where,
      _count: true,
      _sum: { cost: true },
    });

    const reworkCategories = await getReworkCategories(orgId);

    const byCategoryLabeled = byCategory.map(c => ({
      category: c.category,
      label: reworkCategories[c.category] || c.category,
      count: c._count,
      cost: Number(c._sum.cost || 0),
    })).sort((a, b) => b.count - a.count);

    const byTechnician = await prisma.rework.groupBy({
      by: ["responsibleId"],
      where: { ...where, responsibleId: { not: null } },
      _count: true,
      _sum: { cost: true },
    });

    const techIds = byTechnician.map(t => t.responsibleId).filter(Boolean) as string[];
    const technicians = techIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: techIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];

    const techMap = new Map(technicians.map(t => [t.id, `${t.lastName} ${t.firstName}`]));

    const byTechnicianLabeled = byTechnician.map(t => ({
      technicianId: t.responsibleId,
      technicianName: techMap.get(t.responsibleId || "") || "Неизвестен",
      count: t._count,
      cost: Number(t._sum.cost || 0),
    })).sort((a, b) => b.count - a.count);

    const byClient = await prisma.rework.groupBy({
      by: ["clientId"],
      where: { ...where, clientId: { not: null } },
      _count: true,
    });

    const clientIds = byClient.map(c => c.clientId).filter(Boolean) as string[];
    const clientsData = clientIds.length > 0
      ? await prisma.client.findMany({
          where: { id: { in: clientIds } },
          select: { id: true, name: true, shortName: true },
        })
      : [];

    const clientMap = new Map(clientsData.map(c => [c.id, c.shortName || c.name]));

    const byClientLabeled = byClient.map(c => ({
      clientId: c.clientId,
      clientName: clientMap.get(c.clientId || "") || "Неизвестен",
      count: c._count,
    })).sort((a, b) => b.count - a.count).slice(0, 10);

    const reworksWithDoctors = await prisma.rework.findMany({
      where,
      select: {
        cost: true,
        order: {
          select: {
            doctorId: true,
            totalPrice: true,
            doctor: { select: { id: true, firstName: true, lastName: true } },
            client: { select: { name: true, shortName: true } },
          },
        },
      },
    });

    const doctorMap = new Map<string, { name: string; clientName: string; totalWorkSum: number; reworkSum: number; reworkCount: number }>();
    for (const rw of reworksWithDoctors) {
      if (!rw.order.doctorId || !rw.order.doctor) continue;
      const dId = rw.order.doctorId;
      if (!doctorMap.has(dId)) {
        doctorMap.set(dId, {
          name: `${rw.order.doctor.lastName} ${rw.order.doctor.firstName}`,
          clientName: rw.order.client.shortName || rw.order.client.name,
          totalWorkSum: 0,
          reworkSum: 0,
          reworkCount: 0,
        });
      }
      const doc = doctorMap.get(dId)!;
      doc.reworkSum += Number(rw.cost);
      doc.reworkCount++;
      doc.totalWorkSum += Number(rw.order.totalPrice);
    }

    const byDoctor = Array.from(doctorMap.entries()).map(([id, d]) => ({
      doctorId: id,
      doctorName: d.name,
      clientName: d.clientName,
      totalWorkSum: Math.round(d.totalWorkSum),
      reworkSum: Math.round(d.reworkSum),
      reworkCount: d.reworkCount,
      reworkPercent: d.totalWorkSum > 0 ? Math.round((d.reworkSum / d.totalWorkSum) * 100 * 10) / 10 : 0,
    })).sort((a, b) => b.reworkCount - a.reworkCount).slice(0, 15);

    reply.send({
      success: true,
      data: {
        summary: {
          totalReworks,
          totalOrders,
          reworkRate,
          openReworks,
          totalCost: Number(totalCost._sum.cost || 0),
        },
        byCategory: byCategoryLabeled,
        byTechnician: byTechnicianLabeled,
        byClient: byClientLabeled,
        byDoctor,
        categories: reworkCategories,
      },
    });
  });
}
