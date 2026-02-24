import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// ==========================================
// SCHEMAS
// ==========================================

const createPriceListSchema = z.object({
  name: z.string().min(2, "Название: минимум 2 символа"),
  code: z.string().min(1, "Код обязателен"),
  type: z.enum(["CLIENT", "SUBCONTRACTOR"]).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

const bulkUpsertSchema = z.object({
  items: z.array(z.object({
    workItemId: z.string(),
    price: z.number().min(0),
  })),
});

export async function pricingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ==========================================
  // CRUD ПРАЙС-ЛИСТОВ
  // ==========================================

  // GET /api/pricing — Все прайс-листы
  app.get("/", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { type } = request.query as { type?: string };

    const where: Prisma.PriceListWhereInput = { organizationId: orgId };
    if (type) where.type = type as "CLIENT" | "SUBCONTRACTOR";

    const priceLists = await prisma.priceList.findMany({
      where,
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: {
        _count: { select: { items: true, clientPriceLists: true } },
      },
    });

    reply.send({ success: true, data: priceLists });
  });

  // GET /api/pricing/:id — Один прайс с позициями
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const priceList = await prisma.priceList.findFirst({
      where: { id, organizationId: orgId },
      include: {
        items: {
          include: {
            workItem: {
              select: { id: true, code: true, name: true, basePrice: true, unit: true, categoryId: true },
            },
          },
          orderBy: { workItem: { code: "asc" } },
        },
        clientPriceLists: {
          include: {
            client: { select: { id: true, name: true, shortName: true } },
          },
        },
        _count: { select: { items: true, clientPriceLists: true } },
      },
    });

    if (!priceList) throw new NotFoundError("Прайс-лист");
    reply.send({ success: true, data: priceList });
  });

  // POST /api/pricing — Создать прайс-лист
  app.post("/", async (request, reply) => {
    const parsed = createPriceListSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;
    const data = parsed.data;

    // Если ставим isDefault — убираем у остальных
    if (data.isDefault) {
      await prisma.priceList.updateMany({
        where: { organizationId: orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const priceList = await prisma.priceList.create({
      data: {
        organizationId: orgId,
        name: data.name,
        code: data.code,
        type: data.type || "CLIENT",
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validTo: data.validTo ? new Date(data.validTo) : undefined,
        isActive: data.isActive ?? true,
        isDefault: data.isDefault ?? false,
      },
    });

    reply.status(201).send({ success: true, data: priceList });
  });

  // PATCH /api/pricing/:id — Обновить прайс-лист
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.priceList.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Прайс-лист");

    const parsed = createPriceListSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const data = parsed.data;

    if (data.isDefault) {
      await prisma.priceList.updateMany({
        where: { organizationId: orgId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const priceList = await prisma.priceList.update({
      where: { id },
      data: {
        ...data,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validTo: data.validTo ? new Date(data.validTo) : undefined,
      },
    });

    reply.send({ success: true, data: priceList });
  });

  // DELETE /api/pricing/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.priceList.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Прайс-лист");

    // Cascade delete items и clientPriceLists
    await prisma.$transaction([
      prisma.clientPriceList.deleteMany({ where: { priceListId: id } }),
      prisma.priceList.delete({ where: { id } }),
    ]);

    reply.send({ success: true, data: { deleted: true } });
  });

  // ==========================================
  // ПОЗИЦИИ ПРАЙС-ЛИСТА
  // ==========================================

  // PUT /api/pricing/:id/items — Bulk upsert позиций
  app.put("/:id/items", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.priceList.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Прайс-лист");

    const parsed = bulkUpsertSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const results = await prisma.$transaction(
      parsed.data.items.map(item =>
        prisma.priceListItem.upsert({
          where: {
            priceListId_workItemId: {
              priceListId: id,
              workItemId: item.workItemId,
            },
          },
          update: { price: item.price },
          create: {
            priceListId: id,
            workItemId: item.workItemId,
            price: item.price,
          },
        })
      )
    );

    reply.send({ success: true, data: { upserted: results.length } });
  });

  // DELETE /api/pricing/:id/items/:workItemId — Удалить позицию
  app.delete("/:id/items/:workItemId", async (request, reply) => {
    const { id, workItemId } = request.params as { id: string; workItemId: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.priceList.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Прайс-лист");

    await prisma.priceListItem.deleteMany({
      where: { priceListId: id, workItemId },
    });

    reply.send({ success: true, data: { deleted: true } });
  });

  // ==========================================
  // КЛОНИРОВАНИЕ
  // ==========================================

  // POST /api/pricing/:id/clone — Клонировать прайс-лист
  app.post("/:id/clone", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;
    const { name, code } = request.body as { name?: string; code?: string };

    const source = await prisma.priceList.findFirst({
      where: { id, organizationId: orgId },
      include: { items: true },
    });
    if (!source) throw new NotFoundError("Прайс-лист");

    const cloneName = name || `${source.name} (копия)`;
    const cloneCode = code || `${source.code}_copy`;

    const clone = await prisma.priceList.create({
      data: {
        organizationId: orgId,
        name: cloneName,
        code: cloneCode,
        type: source.type,
        isActive: false,
        items: {
          create: source.items.map(item => ({
            workItemId: item.workItemId,
            price: item.price,
          })),
        },
      },
      include: { _count: { select: { items: true } } },
    });

    reply.status(201).send({ success: true, data: clone });
  });

  // ==========================================
  // ПРИВЯЗКА К КЛИЕНТАМ
  // ==========================================

  // POST /api/pricing/:id/clients — Привязать прайс-лист к клиенту
  app.post("/:id/clients", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;
    const { clientId } = request.body as { clientId: string };

    if (!clientId) throw new ValidationError("clientId обязателен");

    const priceList = await prisma.priceList.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!priceList) throw new NotFoundError("Прайс-лист");

    const link = await prisma.clientPriceList.upsert({
      where: { clientId_priceListId: { clientId, priceListId: id } },
      update: {},
      create: { clientId, priceListId: id },
    });

    reply.status(201).send({ success: true, data: link });
  });

  // DELETE /api/pricing/:id/clients/:clientId — Отвязать прайс-лист от клиента
  app.delete("/:id/clients/:clientId", async (request, reply) => {
    const { id, clientId } = request.params as { id: string; clientId: string };

    await prisma.clientPriceList.deleteMany({
      where: { priceListId: id, clientId },
    });

    reply.send({ success: true, data: { deleted: true } });
  });

  // ==========================================
  // МАТРИЦА (РАБОТЫ × ПРАЙС-ЛИСТЫ)
  // ==========================================

  // GET /api/pricing/matrix — Матричный view всех работ и прайсов
  app.get("/matrix", async (request, reply) => {
    const orgId = request.user.organizationId;

    const [workItems, priceLists] = await Promise.all([
      prisma.workItem.findMany({
        where: { organizationId: orgId, isActive: true },
        orderBy: { code: "asc" },
        select: { id: true, code: true, name: true, basePrice: true, unit: true, categoryId: true },
      }),
      prisma.priceList.findMany({
        where: { organizationId: orgId, isActive: true },
        orderBy: { name: "asc" },
        include: {
          items: { select: { workItemId: true, price: true } },
        },
      }),
    ]);

    // Строим матрицу: workItem → { priceListId → price }
    const matrix = workItems.map(wi => {
      const prices: Record<string, number | null> = {};
      for (const pl of priceLists) {
        const item = pl.items.find(i => i.workItemId === wi.id);
        prices[pl.id] = item ? Number(item.price) : null;
      }
      return {
        workItem: wi,
        prices,
      };
    });

    const columns = priceLists.map(pl => ({
      id: pl.id,
      name: pl.name,
      code: pl.code,
      isDefault: pl.isDefault,
    }));

    reply.send({ success: true, data: { columns, rows: matrix } });
  });

  // ==========================================
  // СРАВНЕНИЕ ДВУХ ПРАЙСОВ
  // ==========================================

  // GET /api/pricing/compare?a=<id>&b=<id>
  app.get("/compare", async (request, reply) => {
    const { a, b } = request.query as { a: string; b: string };
    const orgId = request.user.organizationId;

    if (!a || !b) throw new ValidationError("Укажите параметры a и b (ID прайс-листов)");

    const [listA, listB] = await Promise.all([
      prisma.priceList.findFirst({
        where: { id: a, organizationId: orgId },
        include: {
          items: {
            include: { workItem: { select: { id: true, code: true, name: true, basePrice: true } } },
          },
        },
      }),
      prisma.priceList.findFirst({
        where: { id: b, organizationId: orgId },
        include: {
          items: {
            include: { workItem: { select: { id: true, code: true, name: true, basePrice: true } } },
          },
        },
      }),
    ]);

    if (!listA) throw new NotFoundError("Прайс-лист A");
    if (!listB) throw new NotFoundError("Прайс-лист B");

    // Собираем все уникальные workItemId
    const allWorkItemIds = new Set([
      ...listA.items.map(i => i.workItemId),
      ...listB.items.map(i => i.workItemId),
    ]);

    const mapA = new Map(listA.items.map(i => [i.workItemId, i]));
    const mapB = new Map(listB.items.map(i => [i.workItemId, i]));

    const comparison = Array.from(allWorkItemIds).map(wiId => {
      const itemA = mapA.get(wiId);
      const itemB = mapB.get(wiId);
      const workItem = (itemA || itemB)!.workItem;
      const priceA = itemA ? Number(itemA.price) : null;
      const priceB = itemB ? Number(itemB.price) : null;
      const diff = priceA !== null && priceB !== null ? priceB - priceA : null;

      return { workItem, priceA, priceB, diff };
    }).sort((x, y) => (x.workItem.code > y.workItem.code ? 1 : -1));

    reply.send({
      success: true,
      data: {
        listA: { id: listA.id, name: listA.name, code: listA.code },
        listB: { id: listB.id, name: listB.name, code: listB.code },
        comparison,
      },
    });
  });

  // ==========================================
  // КАСКАД РАЗРЕШЕНИЯ ЦЕНЫ
  // ==========================================

  // GET /api/pricing/resolve?clientId=X&workItemId=Y — Получить цену с каскадом
  app.get("/resolve", async (request, reply) => {
    const { clientId, workItemId } = request.query as { clientId: string; workItemId: string };

    if (!clientId || !workItemId) {
      throw new ValidationError("clientId и workItemId обязательны");
    }

    const result = await resolvePrice(clientId, workItemId);
    reply.send({ success: true, data: result });
  });
}

// ==========================================
// ЭКСПОРТ: Функция каскада цен (для orders)
// ==========================================

export async function resolvePrice(
  clientId: string,
  workItemId: string
): Promise<{ price: number; source: "client_override" | "price_list" | "base_price"; priceListName?: string }> {
  // 1. Индивидуальная цена клиента (ClientPriceItem)
  const clientPrice = await prisma.clientPriceItem.findUnique({
    where: { clientId_workItemId: { clientId, workItemId } },
  });
  if (clientPrice) {
    return { price: Number(clientPrice.price), source: "client_override" };
  }

  // 2. Цена из привязанного прайс-листа (ClientPriceList → PriceListItem)
  const clientPriceLists = await prisma.clientPriceList.findMany({
    where: { clientId },
    include: {
      priceList: {
        include: {
          items: {
            where: { workItemId },
            select: { price: true },
          },
        },
      },
    },
  });

  for (const cpl of clientPriceLists) {
    if (cpl.priceList.isActive && cpl.priceList.items.length > 0) {
      return {
        price: Number(cpl.priceList.items[0].price),
        source: "price_list",
        priceListName: cpl.priceList.name,
      };
    }
  }

  // 3. Базовая цена из каталога (WorkItem.basePrice)
  const workItem = await prisma.workItem.findUnique({
    where: { id: workItemId },
    select: { basePrice: true },
  });

  return {
    price: workItem ? Number(workItem.basePrice) : 0,
    source: "base_price",
  };
}
