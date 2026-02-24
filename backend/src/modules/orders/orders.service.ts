import prisma from "../../lib/prisma.js";
import redis from "../../lib/redis.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import type { CreateOrderInput, UpdateOrderInput } from "./orders.schema.js";
import { OrderStatus, StageStatus, Prisma } from "@prisma/client";
import { createNotification, broadcastNotification } from "../notifications/notifications.routes.js";
import { resolvePrice } from "../pricing/pricing.routes.js";

// Стандартные этапы (fallback если справочник пуст)
const FALLBACK_STAGES = [
  { name: "Гипсовка", sortOrder: 1 },
  { name: "CAD-моделирование", sortOrder: 2 },
  { name: "Каркас/фрезеровка", sortOrder: 3 },
  { name: "Керамика/нанесение", sortOrder: 4 },
  { name: "Примерка", sortOrder: 5 },
  { name: "Финальная сборка", sortOrder: 6 },
];

/** Загрузить этапы из справочника организации или использовать fallback */
async function getProductionStages(orgId: string): Promise<Array<{ name: string; sortOrder: number }>> {
  const refs = await prisma.referenceList.findMany({
    where: { organizationId: orgId, type: "production_stage", isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (refs.length === 0) return FALLBACK_STAGES;
  return refs.map(r => ({ name: r.name, sortOrder: r.sortOrder }));
}

export class OrdersService {
  // Генерация номера наряда (формат: 0.XXXX)
  private async generateOrderNumber(orgId: string): Promise<string> {
    const lastOrder = await prisma.order.findFirst({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      select: { orderNumber: true },
    });

    if (!lastOrder) return "0.0001";

    const lastNum = parseFloat(lastOrder.orderNumber);
    const nextNum = lastNum + 0.0001;
    return nextNum.toFixed(4);
  }

  async create(orgId: string, userId: string, input: CreateOrderInput) {
    const orderNumber = await this.generateOrderNumber(orgId);

    // Если передано имя пациента — создаём нового
    let patientId = input.patientId;
    if (!patientId && input.patientName) {
      const parts = input.patientName.trim().split(/\s+/);
      const patient = await prisma.patient.create({
        data: {
          lastName: parts[0] || "",
          firstName: parts[1] || "",
          patronymic: parts[2],
        },
      });
      patientId = patient.id;
    }

    // Получаем цены для позиций через каскад: ручная → ClientPriceItem → PriceListItem → basePrice
    let totalPrice = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);

    const orderItems = await Promise.all(
      input.items.map(async (item) => {
        let price: Prisma.Decimal;
        let priceListCode: string | undefined;
        if (item.price) {
          // Ручная цена (приоритет)
          price = new Prisma.Decimal(item.price);
          priceListCode = "manual";
        } else {
          // Каскад через pricing модуль
          const resolved = await resolvePrice(input.clientId, item.workItemId);
          price = new Prisma.Decimal(resolved.price);
          priceListCode = resolved.source || undefined;
        }

        // Скидка
        const discountPct = new Prisma.Decimal(item.discount || 0);
        const lineTotal = price.mul(item.quantity);
        const discountAmount = lineTotal.mul(discountPct).div(100);
        const total = lineTotal.sub(discountAmount);
        totalPrice = totalPrice.add(total);
        discountTotal = discountTotal.add(discountAmount);

        return {
          workItemId: item.workItemId,
          quantity: item.quantity,
          price,
          total,
          discount: discountPct,
          discountAmount,
          priceListCode,
          notes: item.notes,
        };
      })
    );

    const order = await prisma.order.create({
      data: {
        organizationId: orgId,
        orderNumber,
        clientId: input.clientId,
        doctorId: input.doctorId,
        patientId,
        toothFormula: input.toothFormula,
        color: input.color,
        implantSystem: input.implantSystem,
        hasStl: input.hasStl,
        notes: input.notes,
        isUrgent: input.isUrgent,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        totalPrice,
        discountTotal,
        items: { create: orderItems },
        stages: { create: await getProductionStages(orgId) },
        history: {
          create: {
            action: "order_created",
            details: { userId, orderNumber },
          },
        },
      },
      include: {
        items: { include: { workItem: true } },
        stages: { include: { assignee: true }, orderBy: { sortOrder: "asc" } },
        client: true,
        doctor: true,
        patient: true,
      },
    });

    // Инвалидируем кэш
    await redis.del(`orders:${orgId}:list`);
    await redis.del(`dashboard:${orgId}`);

    // Уведомление: новый наряд
    try {
      await broadcastNotification({
        organizationId: orgId,
        type: "order_created",
        title: `Новый наряд ${orderNumber}`,
        message: `Заказчик: ${order.client?.shortName || order.client?.name || "—"}. ${order.isUrgent ? "⚡ СРОЧНЫЙ" : ""}`.trim(),
        data: { orderId: order.id, orderNumber },
        roles: ["OWNER", "ADMIN", "SENIOR_TECH"],
      });
    } catch { /* notification failure should not break order creation */ }

    return order;
  }

  async findAll(orgId: string, filters: Record<string, string>) {
    const page = parseInt(filters.page || "1");
    const limit = parseInt(filters.limit || "50");
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      organizationId: orgId,
    };

    if (filters.status) {
      where.status = filters.status as OrderStatus;
    }
    if (filters.clientId) {
      where.clientId = filters.clientId;
    }
    if (filters.isUrgent === "true") {
      where.isUrgent = true;
    }
    if (filters.isPaid === "true") {
      where.isPaid = true;
    } else if (filters.isPaid === "false") {
      where.isPaid = false;
    }
    if (filters.dateFrom || filters.dateTo) {
      where.receivedAt = {};
      if (filters.dateFrom) where.receivedAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.receivedAt.lte = new Date(filters.dateTo);
    }
    if (filters.search) {
      where.OR = [
        { orderNumber: { contains: filters.search } },
        { patient: { lastName: { contains: filters.search, mode: "insensitive" } } },
        { client: { name: { contains: filters.search, mode: "insensitive" } } },
        { notes: { contains: filters.search, mode: "insensitive" } },
      ];
    }
    if (filters.assigneeId) {
      where.stages = { some: { assigneeId: filters.assigneeId, status: { not: "COMPLETED" } } };
    }

    const orderBy: Prisma.OrderOrderByWithRelationInput = {
      [filters.sortBy || "receivedAt"]: filters.sortOrder || "desc",
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          client: { select: { id: true, name: true, shortName: true } },
          doctor: { select: { id: true, firstName: true, lastName: true } },
          patient: { select: { id: true, firstName: true, lastName: true, patronymic: true } },
          items: { include: { workItem: { select: { id: true, code: true, name: true } } } },
          stages: {
            orderBy: { sortOrder: "asc" },
            include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
          },
          _count: { select: { photos: true, comments: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async findById(orgId: string, orderId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: orgId },
      include: {
        client: true,
        doctor: true,
        patient: true,
        items: { include: { workItem: true } },
        stages: {
          orderBy: { sortOrder: "asc" },
          include: { assignee: { select: { id: true, firstName: true, lastName: true, role: true } } },
        },
        photos: { orderBy: { createdAt: "desc" } },
        comments: {
          orderBy: { createdAt: "desc" },
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        history: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });

    if (!order) throw new NotFoundError("Заказ-наряд");
    return order;
  }

  async update(orgId: string, orderId: string, userId: string, input: UpdateOrderInput) {
    const existing = await prisma.order.findFirst({
      where: { id: orderId, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Заказ-наряд");

    const data: Prisma.OrderUpdateInput = {};
    const historyDetails: Record<string, unknown> = { userId };

    if (input.status && input.status !== existing.status) {
      data.status = input.status;
      historyDetails.statusFrom = existing.status;
      historyDetails.statusTo = input.status;
    }
    if (input.doctorId !== undefined) data.doctor = { connect: { id: input.doctorId } };
    if (input.toothFormula !== undefined) data.toothFormula = input.toothFormula;
    if (input.color !== undefined) data.color = input.color;
    if (input.implantSystem !== undefined) data.implantSystem = input.implantSystem;
    if (input.hasStl !== undefined) data.hasStl = input.hasStl;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.isUrgent !== undefined) data.isUrgent = input.isUrgent;
    if (input.isPaid !== undefined) data.isPaid = input.isPaid;
    if (input.paymentStatus !== undefined) data.paymentStatus = input.paymentStatus;
    if (input.billingPeriod !== undefined) data.billingPeriod = input.billingPeriod;
    if (input.dueDate) data.dueDate = new Date(input.dueDate);
    if (input.frameworkDate) data.frameworkDate = new Date(input.frameworkDate);
    if (input.settingDate) data.settingDate = new Date(input.settingDate);
    if (input.fittingSentAt) data.fittingSentAt = new Date(input.fittingSentAt);
    if (input.fittingBackAt) data.fittingBackAt = new Date(input.fittingBackAt);
    if (input.deliveredAt) data.deliveredAt = new Date(input.deliveredAt);

    const order = await prisma.order.update({
      where: { id: orderId },
      data: {
        ...data,
        history: {
          create: {
            action: input.status ? "status_changed" : "order_updated",
            details: historyDetails,
          },
        },
      },
      include: {
        client: true,
        doctor: true,
        patient: true,
        items: { include: { workItem: true } },
        stages: { orderBy: { sortOrder: "asc" }, include: { assignee: true } },
      },
    });

    await redis.del(`orders:${orgId}:list`);
    await redis.del(`dashboard:${orgId}`);

    // Уведомление: смена статуса
    if (input.status && input.status !== existing.status) {
      const STATUS_LABELS: Record<string, string> = {
        NEW: "Новый", IN_PROGRESS: "В работе", ON_FITTING: "На примерке",
        REWORK: "Переделка", ASSEMBLY: "Сборка", READY: "Готов",
        DELIVERED: "Доставлен", CANCELLED: "Отменён",
      };
      try {
        await broadcastNotification({
          organizationId: orgId,
          type: "status_changed",
          title: `Наряд ${existing.orderNumber}: ${STATUS_LABELS[input.status] || input.status}`,
          message: `Статус изменён: ${STATUS_LABELS[existing.status] || existing.status} → ${STATUS_LABELS[input.status] || input.status}`,
          data: { orderId, orderNumber: existing.orderNumber, from: existing.status, to: input.status },
          roles: ["OWNER", "ADMIN", "SENIOR_TECH"],
        });
      } catch { /* non-critical */ }
    }

    return order;
  }

  async assignStage(orgId: string, stageId: string, assigneeId: string, dueDate?: string) {
    const stage = await prisma.orderStage.findFirst({
      where: { id: stageId },
      include: { order: true },
    });
    if (!stage || stage.order.organizationId !== orgId) {
      throw new NotFoundError("Этап");
    }

    const updated = await prisma.orderStage.update({
      where: { id: stageId },
      data: {
        assigneeId,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      },
      include: { assignee: true },
    });

    // Уведомление назначенному технику
    try {
      await createNotification({
        organizationId: orgId,
        userId: assigneeId,
        type: "stage_assigned",
        title: `Назначен этап: ${stage.name}`,
        message: `Вам назначен этап "${stage.name}" наряда ${stage.order.orderNumber}${dueDate ? `. Срок: ${new Date(dueDate).toLocaleDateString("ru-RU")}` : ""}`,
        data: { orderId: stage.orderId, stageId, stageName: stage.name },
      });
    } catch { /* non-critical */ }

    return updated;
  }

  async updateStage(orgId: string, stageId: string, userId: string, status: StageStatus, notes?: string) {
    const stage = await prisma.orderStage.findFirst({
      where: { id: stageId },
      include: { order: true },
    });
    if (!stage || stage.order.organizationId !== orgId) {
      throw new NotFoundError("Этап");
    }

    const data: Prisma.OrderStageUpdateInput = { status, notes };
    if (status === "IN_PROGRESS" && !stage.startedAt) {
      data.startedAt = new Date();
    }
    if (status === "COMPLETED") {
      data.completedAt = new Date();
    }

    const updated = await prisma.orderStage.update({
      where: { id: stageId },
      data,
    });

    // Если этап завершён — проверяем, не пора ли перевести наряд в следующий статус
    if (status === "COMPLETED") {
      const allStages = await prisma.orderStage.findMany({
        where: { orderId: stage.orderId },
      });
      const allCompleted = allStages.every(s => s.status === "COMPLETED" || s.status === "SKIPPED");
      if (allCompleted) {
        await prisma.order.update({
          where: { id: stage.orderId },
          data: { status: "READY" },
        });

        // Уведомление: наряд готов
        try {
          await broadcastNotification({
            organizationId: orgId,
            type: "order_ready",
            title: `Наряд ${stage.order.orderNumber} готов!`,
            message: `Все этапы завершены. Наряд готов к выдаче.`,
            data: { orderId: stage.orderId, orderNumber: stage.order.orderNumber },
            roles: ["OWNER", "ADMIN", "SENIOR_TECH"],
          });
        } catch { /* non-critical */ }

        // Автосписание материалов по нормам
        try {
          const orderWithItems = await prisma.order.findUnique({
            where: { id: stage.orderId },
            include: { items: { select: { workItemId: true, quantity: true } } },
          });
          if (orderWithItems) {
            const workItemIds = orderWithItems.items.map(i => i.workItemId);
            const norms = await prisma.materialNorm.findMany({
              where: { workItemId: { in: workItemIds } },
              include: { material: true },
            });

            for (const item of orderWithItems.items) {
              const itemNorms = norms.filter(n => n.workItemId === item.workItemId);
              for (const norm of itemNorms) {
                const totalQty = norm.quantity.mul(item.quantity);
                const mat = norm.material;
                const newStock = mat.currentStock.sub(totalQty);

                if (!newStock.lessThan(0)) {
                  await prisma.$transaction([
                    prisma.materialMovement.create({
                      data: {
                        materialId: mat.id,
                        type: "WRITE_OFF",
                        quantity: totalQty,
                        orderId: stage.orderId,
                        notes: `Автосписание: наряд ${stage.order.orderNumber}`,
                      },
                    }),
                    prisma.material.update({
                      where: { id: mat.id },
                      data: { currentStock: newStock },
                    }),
                  ]);
                }
              }
            }
          }
        } catch { /* auto write-off failure should not break stage update */ }
      }

      // Автоматически запускаем следующий этап
      const nextStage = allStages.find(s => s.sortOrder > stage.sortOrder && s.status === "PENDING");
      if (nextStage && nextStage.assigneeId) {
        await prisma.orderStage.update({
          where: { id: nextStage.id },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });
      }
    }

    await redis.del(`dashboard:${orgId}`);

    return updated;
  }

  async addComment(orgId: string, orderId: string, userId: string, text: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: orgId },
    });
    if (!order) throw new NotFoundError("Заказ-наряд");

    return prisma.orderComment.create({
      data: { orderId, userId, text },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  // Канбан-доска: наряды, сгруппированные по статусам
  async getKanban(orgId: string) {
    const cacheKey = `kanban:${orgId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const statuses: OrderStatus[] = [
      "NEW", "IN_PROGRESS", "ON_FITTING", "REWORK", "ASSEMBLY", "READY",
    ];

    const columns = await Promise.all(
      statuses.map(async (status) => {
        const orders = await prisma.order.findMany({
          where: { organizationId: orgId, status },
          orderBy: [{ isUrgent: "desc" }, { dueDate: "asc" }],
          take: 100,
          include: {
            client: { select: { name: true, shortName: true } },
            patient: { select: { lastName: true, firstName: true } },
            stages: {
              where: { status: "IN_PROGRESS" },
              include: { assignee: { select: { firstName: true, lastName: true } } },
            },
          },
        });

        return { status, count: orders.length, orders };
      })
    );

    const result = { columns };
    await redis.setex(cacheKey, 60, JSON.stringify(result)); // Кэш 1 минута
    return result;
  }
  // Мягкое удаление (статус CANCELLED)
  async softDelete(orgId: string, orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: orgId },
    });
    if (!order) throw new NotFoundError("Заказ-наряд");

    if (order.status === "CANCELLED") {
      throw new ValidationError("Наряд уже отменён");
    }

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        history: {
          create: {
            action: "order_cancelled",
            details: { userId, previousStatus: order.status } as Prisma.InputJsonValue,
          },
        },
      },
    });

    await redis.del(`orders:${orgId}:list`);
    await redis.del(`dashboard:${orgId}`);
    await redis.del(`kanban:${orgId}`);

    return updated;
  }

  // Обновить позиции наряда (полная замена)
  async updateItems(orgId: string, orderId: string, items: Array<{ workItemId: string; quantity: number; priceOverride?: number }>) {
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: orgId },
      include: { client: true },
    });
    if (!order) throw new NotFoundError("Заказ-наряд");

    if (order.status === "CANCELLED" || order.status === "DELIVERED") {
      throw new ValidationError("Нельзя редактировать позиции завершённого или отменённого наряда");
    }

    // Resolve prices for new items
    const itemsWithPrices = await Promise.all(
      items.map(async (item) => {
        let price = item.priceOverride;
        if (price === undefined) {
          const resolved = await resolvePrice(order.clientId, item.workItemId);
          price = resolved.price;
        }
        return {
          workItemId: item.workItemId,
          quantity: item.quantity,
          price,
          total: price * item.quantity,
        };
      })
    );

    const totalPrice = itemsWithPrices.reduce((sum, i) => sum + i.total, 0);

    const updated = await prisma.$transaction(async (tx) => {
      // Delete existing items
      await tx.orderItem.deleteMany({ where: { orderId } });

      // Create new items
      await tx.orderItem.createMany({
        data: itemsWithPrices.map(i => ({
          orderId,
          workItemId: i.workItemId,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
        })),
      });

      // Update total price
      return tx.order.update({
        where: { id: orderId },
        data: {
          totalPrice,
          history: {
            create: {
              action: "items_updated",
              details: { itemCount: items.length, totalPrice } as Prisma.InputJsonValue,
            },
          },
        },
        include: {
          items: { include: { workItem: true } },
          client: true,
          stages: { orderBy: { sortOrder: "asc" } },
        },
      });
    });

    await redis.del(`orders:${orgId}:list`);
    await redis.del(`dashboard:${orgId}`);

    return updated;
  }
}

export const ordersService = new OrdersService();
