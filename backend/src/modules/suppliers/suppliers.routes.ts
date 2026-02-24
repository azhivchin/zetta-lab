import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";

const createSupplierSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  notes: z.string().optional(),
});

export async function suppliersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /api/suppliers
  app.get("/", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { isActive } = request.query as { isActive?: string };

    const where: { organizationId: string; isActive?: boolean } = { organizationId: orgId };
    if (isActive !== undefined) where.isActive = isActive === "true";

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      include: {
        _count: { select: { movements: true } },
      },
    });

    reply.send({ success: true, data: suppliers });
  });

  // POST /api/suppliers
  app.post("/", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const parsed = createSupplierSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const supplier = await prisma.supplier.create({
      data: {
        organizationId: request.user.organizationId,
        ...parsed.data,
        email: parsed.data.email || undefined,
      },
    });

    reply.status(201).send({ success: true, data: supplier });
  });

  // PATCH /api/suppliers/:id
  app.patch("/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.supplier.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundError("Поставщик");

    const parsed = createSupplierSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: { ...parsed.data, email: parsed.data.email || undefined },
    });

    reply.send({ success: true, data: supplier });
  });

  // DELETE /api/suppliers/:id
  app.delete("/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.supplier.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundError("Поставщик");

    await prisma.supplier.update({ where: { id }, data: { isActive: false } });
    reply.send({ success: true, data: { deleted: true } });
  });

  // GET /api/suppliers/:id/purchases — история закупок
  app.get("/:id/purchases", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const supplier = await prisma.supplier.findFirst({ where: { id, organizationId: orgId } });
    if (!supplier) throw new NotFoundError("Поставщик");

    const movements = await prisma.materialMovement.findMany({
      where: { supplierId: id, type: "IN" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        material: { select: { name: true, unit: true } },
      },
    });

    reply.send({ success: true, data: movements });
  });
}
