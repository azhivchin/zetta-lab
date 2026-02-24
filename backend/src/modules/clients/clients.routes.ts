import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";

const createClientSchema = z.object({
  name: z.string().min(2, "Название: минимум 2 символа"),
  shortName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  contactPerson: z.string().optional(),
  inn: z.string().optional(),
  kpp: z.string().optional(),
  notes: z.string().optional(),
  // Расширенные поля (Фаза 1)
  individualCode: z.string().optional(),
  contractNumber: z.string().optional(),
  contractDate: z.string().datetime().optional().or(z.literal("")),
  contractType: z.string().optional(),
  legalEntityName: z.string().optional(),
  signatoryPosition: z.string().optional(),
  signatoryName: z.string().optional(),
  signatoryNameGenitive: z.string().optional(),
  basisDocument: z.string().optional(),
  legalAddress: z.string().optional(),
  physicalAddress: z.string().optional(),
  ogrn: z.string().optional(),
  settlementAccount: z.string().optional(),
  correspondentAccount: z.string().optional(),
  bik: z.string().optional(),
  bankName: z.string().optional(),
  courierDirection: z.string().optional(),
  courierSchedule: z.string().optional(),
  ourRequisitesId: z.string().optional(),
  reportDisplayName: z.string().optional(),
  isActive: z.boolean().optional(),
});

const updateClientSchema = createClientSchema.partial();

const createDoctorSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  patronymic: z.string().optional(),
  phone: z.string().optional(),
  specialty: z.string().optional(),
});

export async function clientsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /api/clients
  app.get("/", async (request, reply) => {
    const { search, page = "1", limit = "50" } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      organizationId: request.user.organizationId,
      isActive: true,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { shortName: { contains: search, mode: "insensitive" as const } },
          { contactPerson: { contains: search, mode: "insensitive" as const } },
        ],
      } : {}),
    };

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { name: "asc" },
        include: {
          _count: { select: { orders: true, doctors: true } },
        },
      }),
      prisma.client.count({ where }),
    ]);

    reply.send({
      success: true,
      data: { clients, pagination: { page: parseInt(page), limit: parseInt(limit), total } },
    });
  });

  // GET /api/clients/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
      include: {
        doctors: { where: { isActive: true }, orderBy: { lastName: "asc" } },
        orders: { take: 20, orderBy: { createdAt: "desc" }, include: { patient: true } },
        payments: { take: 20, orderBy: { date: "desc" } },
        ourRequisites: true,
        _count: { select: { orders: true } },
      },
    });
    if (!client) throw new NotFoundError("Заказчик");
    reply.send({ success: true, data: client });
  });

  // POST /api/clients
  app.post("/", async (request, reply) => {
    const parsed = createClientSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const { contractDate, ...rest } = parsed.data;
    const client = await prisma.client.create({
      data: {
        organizationId: request.user.organizationId,
        ...rest,
        email: rest.email || undefined,
        contractDate: contractDate ? new Date(contractDate) : undefined,
      },
    });
    reply.status(201).send({ success: true, data: client });
  });

  // PATCH /api/clients/:id
  app.patch("/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateClientSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const existing = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!existing) throw new NotFoundError("Заказчик");

    const { contractDate, email, ...rest } = parsed.data;
    const client = await prisma.client.update({
      where: { id },
      data: {
        ...rest,
        ...(email !== undefined ? { email: email || null } : {}),
        ...(contractDate !== undefined ? { contractDate: contractDate ? new Date(contractDate) : null } : {}),
      },
    });
    reply.send({ success: true, data: client });
  });

  // POST /api/clients/:id/doctors — Добавить врача к клинике
  app.post("/:id/doctors", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = createDoctorSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    const doctor = await prisma.doctor.create({
      data: { clientId: id, ...parsed.data },
    });
    reply.status(201).send({ success: true, data: doctor });
  });

  // GET /api/clients/:id/doctors
  app.get("/:id/doctors", async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    const doctors = await prisma.doctor.findMany({
      where: { clientId: id, isActive: true },
      orderBy: { lastName: "asc" },
    });
    reply.send({ success: true, data: doctors });
  });

  // PATCH /api/clients/:id/doctors/:doctorId — Обновить врача
  app.patch("/:id/doctors/:doctorId", async (request, reply) => {
    const { id, doctorId } = request.params as { id: string; doctorId: string };
    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, clientId: id },
    });
    if (!doctor) throw new NotFoundError("Врач");

    const updated = await prisma.doctor.update({
      where: { id: doctorId },
      data: request.body as Record<string, unknown>,
    });
    reply.send({ success: true, data: updated });
  });

  // DELETE /api/clients/:id/doctors/:doctorId — Удалить врача (soft-delete)
  app.delete("/:id/doctors/:doctorId", async (request, reply) => {
    const { id, doctorId } = request.params as { id: string; doctorId: string };
    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    await prisma.doctor.update({
      where: { id: doctorId },
      data: { isActive: false },
    });
    reply.send({ success: true, data: { deleted: true } });
  });

  // ======== PRICE LIST ========

  // GET /api/clients/:id/prices — Индивидуальный прайс клиента
  app.get("/:id/prices", async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    const prices = await prisma.clientPriceItem.findMany({
      where: { clientId: id },
      include: {
        workItem: {
          select: { id: true, name: true, code: true, basePrice: true, unit: true },
        },
      },
      orderBy: { workItem: { name: "asc" } },
    });

    reply.send({ success: true, data: prices });
  });

  // PUT /api/clients/:id/prices — Установить/обновить цену для клиента
  app.put("/:id/prices", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { workItemId, price } = request.body as { workItemId: string; price: number };

    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    if (!workItemId || price === undefined) {
      throw new ValidationError("Укажите workItemId и price");
    }

    const priceItem = await prisma.clientPriceItem.upsert({
      where: { clientId_workItemId: { clientId: id, workItemId } },
      update: { price },
      create: { clientId: id, workItemId, price },
      include: {
        workItem: { select: { id: true, name: true, code: true, basePrice: true, unit: true } },
      },
    });

    reply.send({ success: true, data: priceItem });
  });

  // DELETE /api/clients/:id/prices/:workItemId — Удалить индивидуальную цену
  app.delete("/:id/prices/:workItemId", async (request, reply) => {
    const { id, workItemId } = request.params as { id: string; workItemId: string };
    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    await prisma.clientPriceItem.deleteMany({
      where: { clientId: id, workItemId },
    });

    reply.send({ success: true, data: { deleted: true } });
  });

  // ======== РЕЕСТР ДОГОВОРОВ ========

  // GET /api/clients/contracts-registry — Список клиентов с договорами
  app.get("/contracts-registry", async (request, reply) => {
    const orgId = request.user.organizationId;

    const clients = await prisma.client.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        shortName: true,
        contractNumber: true,
        contractDate: true,
        contractType: true,
        legalEntityName: true,
      },
      orderBy: { name: "asc" },
    });

    // Determine printed/electronic status from contract fields
    const registry = clients.map(c => ({
      id: c.id,
      name: c.shortName || c.name,
      fullName: c.name,
      legalEntityName: c.legalEntityName,
      contractNumber: c.contractNumber,
      contractDate: c.contractDate,
      contractType: c.contractType,
      hasPrinted: !!c.contractNumber,
      hasElectronic: !!c.contractNumber,
    }));

    reply.send({ success: true, data: registry });
  });

  // ======== STATS ========

  // GET /api/clients/:id/stats — Статистика по клиенту
  app.get("/:id/stats", async (request, reply) => {
    const { id } = request.params as { id: string };
    const client = await prisma.client.findFirst({
      where: { id, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    const [orderStats, paymentStats, invoiceStats] = await Promise.all([
      prisma.order.aggregate({
        where: { clientId: id },
        _count: true,
        _sum: { totalPrice: true },
      }),
      prisma.payment.aggregate({
        where: { clientId: id },
        _sum: { amount: true },
      }),
      prisma.invoice.aggregate({
        where: { clientId: id, isPaid: false },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    const totalOrders = orderStats._count || 0;
    const totalRevenue = Number(orderStats._sum.totalPrice || 0);
    const totalPaid = Number(paymentStats._sum.amount || 0);
    const unpaidInvoicesAmount = Number(invoiceStats._sum.total || 0);
    const unpaidInvoicesCount = invoiceStats._count || 0;
    const balance = totalPaid - totalRevenue;

    reply.send({
      success: true,
      data: {
        totalOrders,
        totalRevenue,
        totalPaid,
        balance,
        unpaidInvoicesAmount,
        unpaidInvoicesCount,
      },
    });
  });
}
