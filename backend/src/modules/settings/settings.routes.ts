import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";

// SCHEMAS

const orgRequisitesSchema = z.object({
  name: z.string().min(2, "Название: минимум 2 символа"),
  shortName: z.string().optional(),
  inn: z.string().optional(),
  kpp: z.string().optional(),
  ogrn: z.string().optional(),
  legalAddress: z.string().optional(),
  physicalAddress: z.string().optional(),
  settlementAccount: z.string().optional(),
  correspondentAccount: z.string().optional(),
  bik: z.string().optional(),
  bankName: z.string().optional(),
  signatoryPosition: z.string().optional(),
  signatoryName: z.string().optional(),
  signatoryNameGenitive: z.string().optional(),
  basisDocument: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  isDefault: z.boolean().optional(),
});

const referenceListSchema = z.object({
  type: z.string().min(1, "Тип обязателен"),
  code: z.string().min(1, "Код обязателен"),
  name: z.string().min(1, "Название обязательно"),
  parentId: z.string().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function settingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ORG REQUISITES

  app.get("/requisites", async (request, reply) => {
    const requisites = await prisma.orgRequisites.findMany({
      where: { organizationId: request.user.organizationId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    reply.send({ success: true, data: requisites });
  });

  // GET /api/settings/requisites/:id
  app.get("/requisites/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await prisma.orgRequisites.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!item) throw new NotFoundError("Реквизиты");
    reply.send({ success: true, data: item });
  });

  app.post("/requisites", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = orgRequisitesSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const data = parsed.data;
    const orgId = request.user.organizationId;

    if (data.isDefault) {
      await prisma.orgRequisites.updateMany({
        where: { organizationId: orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const count = await prisma.orgRequisites.count({ where: { organizationId: orgId } });
    if (count === 0) data.isDefault = true;

    const item = await prisma.orgRequisites.create({
      data: {
        organizationId: orgId,
        ...data,
        email: data.email || undefined,
      },
    });

    reply.status(201).send({ success: true, data: item });
  });

  app.patch("/requisites/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.orgRequisites.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Реквизиты");

    const parsed = orgRequisitesSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const data = parsed.data;

    if (data.isDefault) {
      await prisma.orgRequisites.updateMany({
        where: { organizationId: orgId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const item = await prisma.orgRequisites.update({
      where: { id },
      data: {
        ...data,
        email: data.email || undefined,
      },
    });

    reply.send({ success: true, data: item });
  });

  // DELETE /api/settings/requisites/:id
  app.delete("/requisites/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.orgRequisites.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Реквизиты");

    const linkedClients = await prisma.client.count({
      where: { ourRequisitesId: id },
    });
    if (linkedClients > 0) {
      throw new ValidationError(
        `Нельзя удалить: привязано ${linkedClients} заказчиков. Сначала переназначьте их.`
      );
    }

    await prisma.orgRequisites.delete({ where: { id } });
    reply.send({ success: true, data: { deleted: true } });
  });

  // GET /api/settings/references?type=expense_category
  app.get("/references", async (request, reply) => {
    const { type } = request.query as { type?: string };
    const orgId = request.user.organizationId;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (type) where.type = type;

    const items = await prisma.referenceList.findMany({
      where,
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
      include: { children: { orderBy: { sortOrder: "asc" } } },
    });

    reply.send({ success: true, data: items });
  });

  app.get("/references/types", async (request, reply) => {
    const orgId = request.user.organizationId;

    const types = await prisma.referenceList.groupBy({
      by: ["type"],
      where: { organizationId: orgId },
      _count: true,
    });

    const TYPE_LABELS: Record<string, string> = {
      expense_category: "Категории расходов",
      department: "Отделы",
      courier_direction: "Направления курьера",
      contract_type: "Типы договоров",
      price_list_name: "Прайс-листы",
      material_category: "Категории материалов",
      rework_reason: "Причины переделок",
      payment_method: "Способы оплаты",
      account_type: "Типы счетов",
      pl_category: "Категории P&L",
      production_stage: "Этапы производства",
      material_unit: "Единицы измерения",
    };

    reply.send({
      success: true,
      data: types.map(t => ({
        type: t.type,
        label: TYPE_LABELS[t.type] || t.type,
        count: t._count,
      })),
    });
  });

  app.post("/references", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = referenceListSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const item = await prisma.referenceList.create({
      data: {
        organizationId: request.user.organizationId,
        ...parsed.data,
      },
    });

    reply.status(201).send({ success: true, data: item });
  });

  app.post("/references/bulk", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { items } = request.body as { items: Array<{ type: string; code: string; name: string; sortOrder?: number; metadata?: Record<string, unknown> }> };

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new ValidationError("items обязателен (массив)");
    }

    const orgId = request.user.organizationId;

    const created = await prisma.$transaction(
      items.map(item =>
        prisma.referenceList.upsert({
          where: {
            organizationId_type_code: {
              organizationId: orgId,
              type: item.type,
              code: item.code,
            },
          },
          update: { name: item.name, sortOrder: item.sortOrder ?? 0 },
          create: {
            organizationId: orgId,
            type: item.type,
            code: item.code,
            name: item.name,
            sortOrder: item.sortOrder ?? 0,
            metadata: item.metadata as undefined | Record<string, string | number | boolean>,
          },
        })
      )
    );

    reply.status(201).send({ success: true, data: { count: created.length } });
  });

  // PATCH /api/settings/references/:id
  app.patch("/references/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.referenceList.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Элемент справочника");

    const parsed = referenceListSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const { metadata, ...rest } = parsed.data;
    const item = await prisma.referenceList.update({
      where: { id },
      data: {
        ...rest,
        ...(metadata !== undefined ? { metadata: metadata as Record<string, string | number | boolean> } : {}),
      },
    });

    reply.send({ success: true, data: item });
  });

  // DELETE /api/settings/references/:id
  app.delete("/references/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.referenceList.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Элемент справочника");

    await prisma.referenceList.deleteMany({
      where: { OR: [{ id }, { parentId: id }] },
    });

    reply.send({ success: true, data: { deleted: true } });
  });

  app.post("/references/seed-missing", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const orgId = request.user.organizationId;

    const allDefaults = [
      { type: "expense_category", code: "salary", name: "Зарплата", sortOrder: 1 },
      { type: "expense_category", code: "materials", name: "Материалы", sortOrder: 2 },
      { type: "expense_category", code: "rent", name: "Аренда", sortOrder: 3 },
      { type: "expense_category", code: "equipment", name: "Оборудование", sortOrder: 4 },
      { type: "expense_category", code: "logistics", name: "Логистика", sortOrder: 5 },
      { type: "expense_category", code: "utilities", name: "Коммунальные услуги", sortOrder: 6 },
      { type: "expense_category", code: "other", name: "Прочее", sortOrder: 7 },
      { type: "department", code: "cad", name: "CAD/CAM", sortOrder: 1 },
      { type: "department", code: "ceramic", name: "Керамика", sortOrder: 2 },
      { type: "department", code: "gypsum", name: "Гипсовочная", sortOrder: 3 },
      { type: "department", code: "assembly", name: "Сборка", sortOrder: 4 },
      { type: "department", code: "removable", name: "Съёмное", sortOrder: 5 },
      { type: "contract_type", code: "service", name: "Сервисный", sortOrder: 1 },
      { type: "contract_type", code: "subcontract", name: "Подряд", sortOrder: 2 },
      { type: "contract_type", code: "individual", name: "С физлицом", sortOrder: 3 },
      { type: "courier_direction", code: "north", name: "Север", sortOrder: 1 },
      { type: "courier_direction", code: "south", name: "Юг", sortOrder: 2 },
      { type: "courier_direction", code: "east", name: "Восток", sortOrder: 3 },
      { type: "courier_direction", code: "west", name: "Запад", sortOrder: 4 },
      { type: "courier_direction", code: "center", name: "Центр", sortOrder: 5 },
      { type: "rework_reason", code: "ceramic_chip", name: "Скол керамики", sortOrder: 1 },
      { type: "rework_reason", code: "fit_issue", name: "Проблема посадки", sortOrder: 2 },
      { type: "rework_reason", code: "color_mismatch", name: "Несоответствие цвета", sortOrder: 3 },
      { type: "rework_reason", code: "framework_defect", name: "Дефект каркаса", sortOrder: 4 },
      { type: "rework_reason", code: "cad_error", name: "Ошибка CAD", sortOrder: 5 },
      { type: "rework_reason", code: "impression_issue", name: "Проблема слепка", sortOrder: 6 },
      { type: "rework_reason", code: "other", name: "Прочее", sortOrder: 7 },
      { type: "payment_method", code: "cash", name: "Наличные", sortOrder: 1 },
      { type: "payment_method", code: "bank", name: "Безнал", sortOrder: 2 },
      { type: "payment_method", code: "card", name: "Карта", sortOrder: 3 },
      { type: "account_type", code: "cash", name: "Касса", sortOrder: 1 },
      { type: "account_type", code: "bank", name: "Расчётный счёт", sortOrder: 2 },
      { type: "account_type", code: "card", name: "Карта", sortOrder: 3 },
      { type: "account_type", code: "credit_card", name: "Кредитная карта", sortOrder: 4 },
      { type: "pl_category", code: "revenue", name: "Выручка", sortOrder: 1 },
      { type: "pl_category", code: "salary", name: "Зарплата", sortOrder: 2 },
      { type: "pl_category", code: "materials", name: "Материалы", sortOrder: 3 },
      { type: "pl_category", code: "subcontract", name: "Субподряд", sortOrder: 4 },
      { type: "pl_category", code: "rent", name: "Аренда", sortOrder: 5 },
      { type: "pl_category", code: "equipment", name: "Оборудование", sortOrder: 6 },
      { type: "pl_category", code: "logistics", name: "Логистика", sortOrder: 7 },
      { type: "pl_category", code: "credit", name: "Кредиты", sortOrder: 8 },
      { type: "pl_category", code: "other", name: "Прочее", sortOrder: 9 },
      { type: "production_stage", code: "gypsum", name: "Гипсовка", sortOrder: 1 },
      { type: "production_stage", code: "cad", name: "CAD-моделирование", sortOrder: 2 },
      { type: "production_stage", code: "framework", name: "Каркас/фрезеровка", sortOrder: 3 },
      { type: "production_stage", code: "ceramics", name: "Керамика/нанесение", sortOrder: 4 },
      { type: "production_stage", code: "fitting", name: "Примерка", sortOrder: 5 },
      { type: "production_stage", code: "assembly", name: "Финальная сборка", sortOrder: 6 },
      { type: "material_unit", code: "pcs", name: "шт", sortOrder: 1 },
      { type: "material_unit", code: "ml", name: "мл", sortOrder: 2 },
      { type: "material_unit", code: "g", name: "г", sortOrder: 3 },
      { type: "material_unit", code: "m", name: "м", sortOrder: 4 },
      { type: "material_unit", code: "l", name: "л", sortOrder: 5 },
      { type: "material_unit", code: "kg", name: "кг", sortOrder: 6 },
    ];

    const results = await prisma.$transaction(
      allDefaults.map(item =>
        prisma.referenceList.upsert({
          where: {
            organizationId_type_code: {
              organizationId: orgId,
              type: item.type,
              code: item.code,
            },
          },
          update: {}, // Не перезаписываем существующие
          create: {
            organizationId: orgId,
            ...item,
          },
        })
      )
    );

    reply.send({ success: true, data: { seeded: results.length } });
  });
}
