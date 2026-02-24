import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";

const createCategorySchema = z.object({
  code: z.string().min(1, "Укажите код"),
  name: z.string().min(2, "Название: минимум 2 символа"),
  sortOrder: z.number().int().optional(),
});

const updateCategorySchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(2).optional(),
  sortOrder: z.number().int().optional(),
});

const createWorkItemSchema = z.object({
  categoryId: z.string(),
  code: z.string().min(1, "Укажите код работы"),
  name: z.string().min(2, "Название: минимум 2 символа"),
  description: z.string().optional(),
  basePrice: z.number().min(0),
  unit: z.string().default("шт"),
  techPayRate: z.number().optional(),
  techPayPercent: z.number().optional(),
  estimatedDays: z.number().int().optional(),
});

const updateWorkItemSchema = createWorkItemSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export async function workCatalogRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /api/work-catalog/categories — Категории работ
  app.get("/categories", async (request, reply) => {
    const categories = await prisma.workCategory.findMany({
      where: { organizationId: request.user.organizationId },
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { workItems: true } } },
    });
    reply.send({ success: true, data: categories });
  });

  // GET /api/work-catalog — Все работы (с поиском)
  app.get("/", async (request, reply) => {
    const { search, categoryId } = request.query as Record<string, string>;

    const where = {
      organizationId: request.user.organizationId,
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { code: { contains: search } },
        ],
      } : {}),
    };

    const items = await prisma.workItem.findMany({
      where,
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { code: "asc" }],
      include: { category: { select: { id: true, code: true, name: true } } },
    });

    reply.send({ success: true, data: items });
  });

  // POST /api/work-catalog — Создать работу
  app.post("/", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = createWorkItemSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const item = await prisma.workItem.create({
      data: {
        organizationId: request.user.organizationId,
        ...parsed.data,
      },
      include: { category: true },
    });
    reply.status(201).send({ success: true, data: item });
  });

  // PATCH /api/work-catalog/:id — Обновить работу
  app.patch("/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateWorkItemSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const existing = await prisma.workItem.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!existing) throw new NotFoundError("Работа");

    const item = await prisma.workItem.update({
      where: { id },
      data: parsed.data,
      include: { category: true },
    });
    reply.send({ success: true, data: item });
  });

  // ======== CRUD КАТЕГОРИЙ ========

  // POST /api/work-catalog/categories — Создать категорию
  app.post("/categories", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = createCategorySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;

    // Определяем sortOrder если не указан
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const last = await prisma.workCategory.findFirst({
        where: { organizationId: orgId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder || 0) + 1;
    }

    const category = await prisma.workCategory.create({
      data: {
        organizationId: orgId,
        code: parsed.data.code,
        name: parsed.data.name,
        sortOrder,
      },
      include: { _count: { select: { workItems: true } } },
    });

    reply.status(201).send({ success: true, data: category });
  });

  // PATCH /api/work-catalog/categories/:id — Обновить категорию
  app.patch("/categories/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.workCategory.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Категория");

    const parsed = updateCategorySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const category = await prisma.workCategory.update({
      where: { id },
      data: parsed.data,
      include: { _count: { select: { workItems: true } } },
    });

    reply.send({ success: true, data: category });
  });

  // DELETE /api/work-catalog/categories/:id — Удалить категорию
  app.delete("/categories/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.workCategory.findFirst({
      where: { id, organizationId: orgId },
      include: { _count: { select: { workItems: true } } },
    });
    if (!existing) throw new NotFoundError("Категория");

    if (existing._count.workItems > 0) {
      throw new ValidationError(`Нельзя удалить категорию с ${existing._count.workItems} работами. Сначала перенесите или удалите работы.`);
    }

    await prisma.workCategory.delete({ where: { id } });
    reply.send({ success: true, data: { deleted: true } });
  });
}
