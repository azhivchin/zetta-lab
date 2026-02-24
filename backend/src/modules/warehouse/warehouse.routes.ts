import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { broadcastNotification } from "../notifications/notifications.routes.js";

const createMaterialSchema = z.object({
  name: z.string().min(1, "Укажите название"),
  unit: z.string().default("шт"),
  minStock: z.number().default(0),
  avgPrice: z.number().default(0),
  category: z.string().optional(),
});

const updateMaterialSchema = createMaterialSchema.partial();

const movementSchema = z.object({
  materialId: z.string(),
  type: z.enum(["IN", "OUT", "WRITE_OFF", "INVENTORY"]),
  quantity: z.number().positive("Количество должно быть > 0"),
  price: z.number().optional(),
  orderId: z.string().optional(),
  notes: z.string().optional(),
});

export async function warehouseRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/materials", async (request, reply) => {
    const { search, category, lowStock } = request.query as Record<string, string>;
    const orgId = request.user.organizationId;

    const where: Prisma.MaterialWhereInput = {
      organizationId: orgId,
      isActive: true,
    };

    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }
    if (category) {
      where.category = category;
    }

    const materials = await prisma.material.findMany({
      where,
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { movements: true, norms: true } },
      },
    });

    // Filter low stock on application level (Prisma can't compare two Decimal columns easily)
    const result = lowStock === "true"
      ? materials.filter(m => m.currentStock.lessThan(m.minStock))
      : materials;

    // Get distinct categories
    const categories = [...new Set(materials.map(m => m.category).filter(Boolean))];

    reply.send({ success: true, data: { materials: result, categories } });
  });

  app.post("/materials", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const parsed = createMaterialSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const material = await prisma.material.create({
      data: {
        organizationId: request.user.organizationId,
        name: parsed.data.name,
        unit: parsed.data.unit,
        minStock: parsed.data.minStock,
        avgPrice: parsed.data.avgPrice,
        category: parsed.data.category,
      },
    });

    reply.status(201).send({ success: true, data: material });
  });

  app.patch("/materials/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateMaterialSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const existing = await prisma.material.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!existing) throw new NotFoundError("Материал");

    const material = await prisma.material.update({
      where: { id },
      data: parsed.data,
    });
    reply.send({ success: true, data: material });
  });

  app.post("/movements", async (request, reply) => {
    const parsed = movementSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const material = await prisma.material.findFirst({
      where: { id: parsed.data.materialId, organizationId: request.user.organizationId },
    });
    if (!material) throw new NotFoundError("Материал");

    const qty = new Prisma.Decimal(parsed.data.quantity);
    let newStock = material.currentStock;

    switch (parsed.data.type) {
      case "IN":
        newStock = material.currentStock.add(qty);
        break;
      case "OUT":
      case "WRITE_OFF":
        newStock = material.currentStock.sub(qty);
        if (newStock.lessThan(0)) {
          throw new ValidationError("Недостаточно на складе");
        }
        break;
      case "INVENTORY":
        newStock = qty; // Установить фактическое значение
        break;
    }

    const [movement] = await prisma.$transaction([
      prisma.materialMovement.create({
        data: {
          materialId: parsed.data.materialId,
          type: parsed.data.type,
          quantity: qty,
          price: parsed.data.price ? new Prisma.Decimal(parsed.data.price) : undefined,
          orderId: parsed.data.orderId,
          notes: parsed.data.notes,
        },
      }),
      prisma.material.update({
        where: { id: parsed.data.materialId },
        data: {
          currentStock: newStock,
          ...(parsed.data.type === "IN" && parsed.data.price ? { avgPrice: parsed.data.price } : {}),
        },
      }),
    ]);

    if (newStock.lessThan(material.minStock) && !material.currentStock.lessThan(material.minStock)) {
      try {
        await broadcastNotification({
          organizationId: request.user.organizationId,
          type: "low_stock",
          title: `Низкий остаток: ${material.name}`,
          message: `Остаток ${material.name}: ${newStock} ${material.unit} (мин. ${material.minStock} ${material.unit})`,
          data: { materialId: material.id, materialName: material.name, currentStock: newStock.toString(), minStock: material.minStock.toString() },
          roles: ["OWNER", "ADMIN", "SENIOR_TECH"],
        });
      } catch { /* non-critical */ }
    }

    reply.status(201).send({ success: true, data: movement });
  });

  app.get("/movements", async (request, reply) => {
    const { materialId, type, page = "1", limit = "50" } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Prisma.MaterialMovementWhereInput = {
      material: { organizationId: request.user.organizationId },
    };
    if (materialId) where.materialId = materialId;
    if (type) where.type = type as any;

    const [movements, total] = await Promise.all([
      prisma.materialMovement.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          material: { select: { name: true, unit: true } },
        },
      }),
      prisma.materialMovement.count({ where }),
    ]);

    reply.send({
      success: true,
      data: { movements, pagination: { page: parseInt(page), limit: parseInt(limit), total } },
    });
  });

  app.get("/norms", async (request, reply) => {
    const { workItemId, materialId } = request.query as Record<string, string>;

    const where: Record<string, unknown> = {
      material: { organizationId: request.user.organizationId },
    };
    if (workItemId) where.workItemId = workItemId;
    if (materialId) where.materialId = materialId;

    const norms = await prisma.materialNorm.findMany({
      where: where as any,
      include: {
        workItem: { select: { id: true, name: true, code: true } },
        material: { select: { id: true, name: true, unit: true } },
      },
      orderBy: { workItem: { name: "asc" } },
    });

    reply.send({ success: true, data: norms });
  });

  app.put("/norms", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const { workItemId, materialId, quantity } = request.body as {
      workItemId: string;
      materialId: string;
      quantity: number;
    };

    if (!workItemId || !materialId || !quantity) {
      throw new ValidationError("Укажите workItemId, materialId и quantity");
    }

    // Verify material belongs to org
    const material = await prisma.material.findFirst({
      where: { id: materialId, organizationId: request.user.organizationId },
    });
    if (!material) throw new NotFoundError("Материал");

    const norm = await prisma.materialNorm.upsert({
      where: { workItemId_materialId: { workItemId, materialId } },
      update: { quantity },
      create: { workItemId, materialId, quantity },
      include: {
        workItem: { select: { id: true, name: true, code: true } },
        material: { select: { id: true, name: true, unit: true } },
      },
    });

    reply.send({ success: true, data: norm });
  });

  app.delete("/norms/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const norm = await prisma.materialNorm.findUnique({
      where: { id },
      include: { material: { select: { organizationId: true } } },
    });
    if (!norm || norm.material.organizationId !== request.user.organizationId) {
      throw new NotFoundError("Норма расхода");
    }

    await prisma.materialNorm.delete({ where: { id } });
    reply.send({ success: true, data: { deleted: true } });
  });

  app.post("/write-off-order", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const { orderId } = request.body as { orderId: string };

    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: request.user.organizationId },
      include: {
        items: { select: { workItemId: true, quantity: true } },
      },
    });
    if (!order) throw new NotFoundError("Наряд");

    // Get all norms for the work items in this order
    const workItemIds = order.items.map(i => i.workItemId);
    const norms = await prisma.materialNorm.findMany({
      where: { workItemId: { in: workItemIds } },
      include: { material: true },
    });

    if (norms.length === 0) {
      return reply.send({ success: true, data: { movements: [], message: "Нет норм расхода для работ этого наряда" } });
    }

    // Calculate total write-off per material
    const writeOffs = new Map<string, { materialId: string; quantity: Prisma.Decimal; materialName: string; unit: string }>();

    for (const item of order.items) {
      const itemNorms = norms.filter(n => n.workItemId === item.workItemId);
      for (const norm of itemNorms) {
        const totalQty = norm.quantity.mul(item.quantity);
        const existing = writeOffs.get(norm.materialId);
        if (existing) {
          existing.quantity = existing.quantity.add(totalQty);
        } else {
          writeOffs.set(norm.materialId, {
            materialId: norm.materialId,
            quantity: totalQty,
            materialName: norm.material.name,
            unit: norm.material.unit,
          });
        }
      }
    }

    // Execute write-offs
    const movements = [];
    const alerts = [];

    for (const [materialId, wo] of writeOffs) {
      const material = await prisma.material.findUnique({ where: { id: materialId } });
      if (!material) continue;

      const newStock = material.currentStock.sub(wo.quantity);
      if (newStock.lessThan(0)) {
        alerts.push(`Недостаточно ${wo.materialName}: нужно ${wo.quantity}, есть ${material.currentStock} ${wo.unit}`);
        continue;
      }

      const [movement] = await prisma.$transaction([
        prisma.materialMovement.create({
          data: {
            materialId,
            type: "WRITE_OFF",
            quantity: wo.quantity,
            orderId,
            notes: `Автосписание по наряду ${order.orderNumber}`,
          },
        }),
        prisma.material.update({
          where: { id: materialId },
          data: { currentStock: newStock },
        }),
      ]);

      movements.push({ ...movement, materialName: wo.materialName, quantity: wo.quantity.toString() });

      // Check low stock
      if (newStock.lessThan(material.minStock)) {
        try {
          await broadcastNotification({
            organizationId: request.user.organizationId,
            type: "low_stock",
            title: `Низкий остаток: ${wo.materialName}`,
            message: `Остаток ${wo.materialName}: ${newStock} ${wo.unit} (мин. ${material.minStock} ${wo.unit})`,
            data: { materialId, materialName: wo.materialName },
            roles: ["OWNER", "ADMIN", "SENIOR_TECH"],
          });
        } catch { /* non-critical */ }
      }
    }

    reply.send({ success: true, data: { movements, alerts } });
  });

  app.get("/alerts", async (request, reply) => {
    const materials = await prisma.material.findMany({
      where: {
        organizationId: request.user.organizationId,
        isActive: true,
      },
    });

    const lowStock = materials.filter(m => m.currentStock.lessThan(m.minStock));

    reply.send({ success: true, data: lowStock });
  });
}
