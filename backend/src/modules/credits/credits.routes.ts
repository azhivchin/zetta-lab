import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";

const createCreditSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  lender: z.string().optional(),
  totalAmount: z.number().positive("Сумма должна быть > 0"),
  interestRate: z.number().min(0).optional(),
  monthlyPayment: z.number().min(0).optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  notes: z.string().optional(),
});

const createPaymentSchema = z.object({
  creditId: z.string(),
  amount: z.number().positive("Сумма должна быть > 0"),
  principal: z.number().min(0).optional(),
  interest: z.number().min(0).optional(),
  accountId: z.string().optional(),
  date: z.string().optional(),
  notes: z.string().optional(),
});

export async function creditsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { isActive } = request.query as { isActive?: string };

    const where: { organizationId: string; isActive?: boolean } = { organizationId: orgId };
    if (isActive !== undefined) where.isActive = isActive === "true";

    const credits = await prisma.credit.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      include: {
        _count: { select: { payments: true } },
      },
    });

    const totalDebt = credits.filter(c => c.isActive).reduce((sum, c) => sum + Number(c.remainingAmount), 0);
    const totalMonthly = credits.filter(c => c.isActive).reduce((sum, c) => sum + Number(c.monthlyPayment || 0), 0);

    reply.send({ success: true, data: { credits, totalDebt, totalMonthly } });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const credit = await prisma.credit.findFirst({
      where: { id, organizationId: orgId },
      include: {
        payments: {
          orderBy: { date: "desc" },
          include: {
            account: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!credit) throw new NotFoundError("Кредит");

    const totalPaid = credit.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalPrincipal = credit.payments.reduce((sum, p) => sum + Number(p.principal || 0), 0);
    const totalInterest = credit.payments.reduce((sum, p) => sum + Number(p.interest || 0), 0);

    reply.send({
      success: true,
      data: { ...credit, totalPaid, totalPrincipal, totalInterest },
    });
  });

  app.post("/", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = createCreditSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;

    const credit = await prisma.credit.create({
      data: {
        organizationId: orgId,
        name: parsed.data.name,
        lender: parsed.data.lender,
        totalAmount: parsed.data.totalAmount,
        interestRate: parsed.data.interestRate,
        monthlyPayment: parsed.data.monthlyPayment,
        remainingAmount: parsed.data.totalAmount, // Изначально = полная сумма
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
        notes: parsed.data.notes,
      },
    });

    reply.status(201).send({ success: true, data: credit });
  });

  app.patch("/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.credit.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundError("Кредит");

    const parsed = createCreditSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.startDate) data.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate) data.endDate = new Date(parsed.data.endDate);

    const credit = await prisma.credit.update({
      where: { id },
      data,
    });

    reply.send({ success: true, data: credit });
  });

  // DELETE /api/credits/:id
  app.delete("/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.credit.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) throw new NotFoundError("Кредит");

    await prisma.$transaction([
      prisma.creditPayment.deleteMany({ where: { creditId: id } }),
      prisma.credit.delete({ where: { id } }),
    ]);

    reply.send({ success: true, data: { deleted: true } });
  });

  app.post("/payments", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = createPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;
    const credit = await prisma.credit.findFirst({ where: { id: parsed.data.creditId, organizationId: orgId } });
    if (!credit) throw new NotFoundError("Кредит");

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.creditPayment.create({
        data: {
          creditId: parsed.data.creditId,
          amount: parsed.data.amount,
          principal: parsed.data.principal,
          interest: parsed.data.interest,
          accountId: parsed.data.accountId,
          date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
          notes: parsed.data.notes,
        },
      });

      const principalAmount = parsed.data.principal ?? parsed.data.amount;
      const newRemaining = Math.max(0, Number(credit.remainingAmount) - principalAmount);

      await tx.credit.update({
        where: { id: parsed.data.creditId },
        data: {
          remainingAmount: newRemaining,
          isActive: newRemaining > 0,
        },
      });

      if (parsed.data.accountId) {
        await tx.paymentAccount.update({
          where: { id: parsed.data.accountId },
          data: { balance: { decrement: parsed.data.amount } },
        });
      }

      return p;
    });

    reply.status(201).send({ success: true, data: payment });
  });

  app.get("/dashboard", async (request, reply) => {
    const orgId = request.user.organizationId;

    const credits = await prisma.credit.findMany({
      where: { organizationId: orgId, isActive: true },
      orderBy: { remainingAmount: "desc" },
      include: {
        _count: { select: { payments: true } },
      },
    });

    const totalDebt = credits.reduce((sum, c) => sum + Number(c.remainingAmount), 0);
    const totalMonthly = credits.reduce((sum, c) => sum + Number(c.monthlyPayment || 0), 0);
    const totalOriginal = credits.reduce((sum, c) => sum + Number(c.totalAmount), 0);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const monthPayments = await prisma.creditPayment.aggregate({
      where: {
        credit: { organizationId: orgId },
        date: { gte: monthStart, lte: monthEnd },
      },
      _sum: { amount: true },
    });

    reply.send({
      success: true,
      data: {
        credits,
        totalDebt,
        totalMonthly,
        totalOriginal,
        paidThisMonth: Number(monthPayments._sum.amount || 0),
      },
    });
  });
}
