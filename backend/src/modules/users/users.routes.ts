import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { NotFoundError, ValidationError } from "../../lib/errors.js";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const vacationSchema = z.object({
  userId: z.string(),
  type: z.enum(["VACATION", "SICK_LEAVE", "UNPAID", "MATERNITY", "OTHER"]).default("VACATION"),
  dateFrom: z.string(),
  dateTo: z.string(),
  notes: z.string().optional(),
});

const contractSchema = z.object({
  userId: z.string(),
  type: z.enum(["EMPLOYMENT", "GPC", "INTERNSHIP"]).default("EMPLOYMENT"),
  number: z.string().min(1, "Номер договора обязателен"),
  startDate: z.string(),
  endDate: z.string().optional(),
  salary: z.number().min(0).optional(),
  notes: z.string().optional(),
});

export async function usersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/", async (request, reply) => {
    const { role, isActive } = request.query as Record<string, string>;

    const where = {
      organizationId: request.user.organizationId,
      ...(role ? { role: role as any } : {}),
      ...(isActive !== undefined ? { isActive: isActive === "true" } : {}),
    };

    const users = await prisma.user.findMany({
      where,
      orderBy: [{ role: "asc" }, { lastName: "asc" }],
      omit: { passwordHash: true },
    });

    reply.send({ success: true, data: users });
  });

  app.get("/technicians", async (request, reply) => {
    const technicians = await prisma.user.findMany({
      where: {
        organizationId: request.user.organizationId,
        isActive: true,
        role: { in: ["SENIOR_TECH", "TECHNICIAN", "CAD_SPECIALIST", "GYPSUM_WORKER", "CERAMIST"] },
      },
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    reply.send({ success: true, data: technicians });
  });

  app.get("/birthdays", async (request, reply) => {
    const orgId = request.user.organizationId;

    const users = await prisma.user.findMany({
      where: { organizationId: orgId, isActive: true, birthday: { not: null } },
      select: { id: true, firstName: true, lastName: true, birthday: true, department: true, role: true },
      orderBy: { lastName: "asc" },
    });

    const now = new Date();
    const withNext = users.map(u => {
      const bd = new Date(u.birthday!);
      const next = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
      if (next < now) next.setFullYear(next.getFullYear() + 1);
      const daysUntil = Math.ceil((next.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const age = next.getFullYear() - bd.getFullYear();
      return { ...u, nextBirthday: next.toISOString(), daysUntil, age };
    }).sort((a, b) => a.daysUntil - b.daysUntil);

    reply.send({ success: true, data: withNext });
  });

  // GET /api/users/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = await prisma.user.findFirst({
      where: { id, organizationId: request.user.organizationId },
      omit: { passwordHash: true },
      include: {
        vacations: { orderBy: { dateFrom: "desc" }, take: 20 },
        contracts: { orderBy: { startDate: "desc" } },
      },
    });
    if (!user) throw new NotFoundError("Пользователь");
    reply.send({ success: true, data: user });
  });

  app.patch("/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const allowed: Record<string, unknown> = {};
    const fields = [
      "firstName", "lastName", "patronymic", "phone", "role", "isActive",
      "department", "personalPhone", "hrNotes", "salaryCoeff",
    ];
    for (const f of fields) {
      if (body[f] !== undefined) allowed[f] = body[f];
    }
    if (body.birthday !== undefined) allowed.birthday = body.birthday ? new Date(body.birthday as string) : null;
    if (body.hireDate !== undefined) allowed.hireDate = body.hireDate ? new Date(body.hireDate as string) : null;
    if (body.salaryCoeff !== undefined) allowed.salaryCoeff = body.salaryCoeff !== null ? Number(body.salaryCoeff) : null;

    const user = await prisma.user.update({
      where: { id },
      data: allowed,
      omit: { passwordHash: true },
    });
    reply.send({ success: true, data: user });
  });

  app.get("/vacations/all", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { year } = request.query as { year?: string };
    const y = parseInt(year || String(new Date().getFullYear()));

    const vacations = await prisma.vacation.findMany({
      where: {
        user: { organizationId: orgId },
        dateFrom: { lte: new Date(`${y}-12-31`) },
        dateTo: { gte: new Date(`${y}-01-01`) },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, department: true, role: true } },
      },
      orderBy: { dateFrom: "asc" },
    });

    reply.send({ success: true, data: vacations });
  });

  app.post("/vacations", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = vacationSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));

    const user = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: request.user.organizationId },
    });
    if (!user) throw new NotFoundError("Сотрудник");

    const dateFrom = new Date(parsed.data.dateFrom);
    const dateTo = new Date(parsed.data.dateTo);
    const days = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const vacation = await prisma.vacation.create({
      data: {
        userId: parsed.data.userId,
        type: parsed.data.type,
        dateFrom,
        dateTo,
        days,
        notes: parsed.data.notes,
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    reply.status(201).send({ success: true, data: vacation });
  });

  app.patch("/vacations/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.vacation.findFirst({
      where: { id, user: { organizationId: request.user.organizationId } },
    });
    if (!existing) throw new NotFoundError("Отпуск");

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.type) data.type = body.type;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.dateFrom && body.dateTo) {
      data.dateFrom = new Date(body.dateFrom as string);
      data.dateTo = new Date(body.dateTo as string);
      data.days = Math.ceil(
        ((data.dateTo as Date).getTime() - (data.dateFrom as Date).getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;
    }

    const vacation = await prisma.vacation.update({ where: { id }, data });
    reply.send({ success: true, data: vacation });
  });

  // DELETE /api/users/vacations/:id
  app.delete("/vacations/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.vacation.findFirst({
      where: { id, user: { organizationId: request.user.organizationId } },
    });
    if (!existing) throw new NotFoundError("Отпуск");
    await prisma.vacation.delete({ where: { id } });
    reply.send({ success: true, data: { deleted: true } });
  });

  app.get("/contracts/all", async (request, reply) => {
    const orgId = request.user.organizationId;
    const contracts = await prisma.employeeContract.findMany({
      where: { user: { organizationId: orgId } },
      include: { user: { select: { id: true, firstName: true, lastName: true, role: true } } },
      orderBy: { startDate: "desc" },
    });
    reply.send({ success: true, data: contracts });
  });

  app.post("/contracts", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = contractSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));

    const user = await prisma.user.findFirst({
      where: { id: parsed.data.userId, organizationId: request.user.organizationId },
    });
    if (!user) throw new NotFoundError("Сотрудник");

    const contract = await prisma.employeeContract.create({
      data: {
        userId: parsed.data.userId,
        type: parsed.data.type,
        number: parsed.data.number,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
        salary: parsed.data.salary,
        notes: parsed.data.notes,
      },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    reply.status(201).send({ success: true, data: contract });
  });

  app.patch("/contracts/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;

    const existing = await prisma.employeeContract.findFirst({
      where: { id, user: { organizationId: request.user.organizationId } },
    });
    if (!existing) throw new NotFoundError("Договор");

    const data: Record<string, unknown> = {};
    if (body.type) data.type = body.type;
    if (body.number) data.number = body.number;
    if (body.startDate) data.startDate = new Date(body.startDate as string);
    if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate as string) : null;
    if (body.salary !== undefined) data.salary = body.salary !== null ? Number(body.salary) : null;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.isActive !== undefined) data.isActive = body.isActive;

    const contract = await prisma.employeeContract.update({ where: { id }, data });
    reply.send({ success: true, data: contract });
  });
}
