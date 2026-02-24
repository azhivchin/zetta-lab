import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";

const createAccountSchema = z.object({
  name: z.string().min(1, "Название обязательно"),
  type: z.enum(["cash", "bank", "card", "credit_card"]).default("bank"),
  balance: z.number().default(0),
  currency: z.string().default("RUB"),
  isDefault: z.boolean().optional(),
  notes: z.string().optional(),
});

const transferSchema = z.object({
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: z.number().positive("Сумма должна быть > 0"),
  notes: z.string().optional(),
  date: z.string().optional(),
});

export async function accountsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ======== CRUD СЧЕТОВ ========

  // GET /api/accounts — Все счета организации
  app.get("/", async (request, reply) => {
    const orgId = request.user.organizationId;

    const accounts = await prisma.paymentAccount.findMany({
      where: { organizationId: orgId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });

    // Общий баланс
    const totalBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

    reply.send({ success: true, data: { accounts, totalBalance } });
  });

  // POST /api/accounts — Создать счёт
  app.post("/", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = createAccountSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;

    // Если ставим isDefault — убираем у остальных
    if (parsed.data.isDefault) {
      await prisma.paymentAccount.updateMany({
        where: { organizationId: orgId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.paymentAccount.create({
      data: {
        organizationId: orgId,
        name: parsed.data.name,
        type: parsed.data.type,
        balance: parsed.data.balance,
        currency: parsed.data.currency,
        isDefault: parsed.data.isDefault ?? false,
        notes: parsed.data.notes,
      },
    });

    reply.status(201).send({ success: true, data: account });
  });

  // PATCH /api/accounts/:id — Обновить счёт
  app.patch("/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.paymentAccount.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Счёт");

    const parsed = createAccountSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    if (parsed.data.isDefault) {
      await prisma.paymentAccount.updateMany({
        where: { organizationId: orgId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const account = await prisma.paymentAccount.update({
      where: { id },
      data: parsed.data,
    });

    reply.send({ success: true, data: account });
  });

  // DELETE /api/accounts/:id
  app.delete("/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const existing = await prisma.paymentAccount.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Счёт");

    // Отвязываем платежи и расходы (не удаляем!)
    await prisma.$transaction([
      prisma.payment.updateMany({ where: { accountId: id }, data: { accountId: null } }),
      prisma.expense.updateMany({ where: { accountId: id }, data: { accountId: null } }),
      prisma.paymentAccount.delete({ where: { id } }),
    ]);

    reply.send({ success: true, data: { deleted: true } });
  });

  // ======== ПЕРЕВОДЫ ========

  // GET /api/accounts/transfers — История переводов
  app.get("/transfers", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { page = "1", limit = "50" } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const transfers = await prisma.accountTransfer.findMany({
      where: {
        fromAccount: { organizationId: orgId },
      },
      orderBy: { date: "desc" },
      skip,
      take: parseInt(limit),
      include: {
        fromAccount: { select: { id: true, name: true, type: true } },
        toAccount: { select: { id: true, name: true, type: true } },
      },
    });

    reply.send({ success: true, data: transfers });
  });

  // POST /api/accounts/transfers — Перевод между счетами
  app.post("/transfers", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = transferSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;

    if (parsed.data.fromAccountId === parsed.data.toAccountId) {
      throw new ValidationError("Нельзя переводить на тот же счёт");
    }

    // Проверяем оба счёта
    const [from, to] = await Promise.all([
      prisma.paymentAccount.findFirst({ where: { id: parsed.data.fromAccountId, organizationId: orgId } }),
      prisma.paymentAccount.findFirst({ where: { id: parsed.data.toAccountId, organizationId: orgId } }),
    ]);
    if (!from) throw new NotFoundError("Счёт-источник");
    if (!to) throw new NotFoundError("Счёт-получатель");

    // Транзакция: создаём перевод + обновляем балансы
    const transfer = await prisma.$transaction(async (tx) => {
      const t = await tx.accountTransfer.create({
        data: {
          fromAccountId: parsed.data.fromAccountId,
          toAccountId: parsed.data.toAccountId,
          amount: parsed.data.amount,
          notes: parsed.data.notes,
          date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
        },
        include: {
          fromAccount: { select: { id: true, name: true } },
          toAccount: { select: { id: true, name: true } },
        },
      });

      await tx.paymentAccount.update({
        where: { id: parsed.data.fromAccountId },
        data: { balance: { decrement: parsed.data.amount } },
      });

      await tx.paymentAccount.update({
        where: { id: parsed.data.toAccountId },
        data: { balance: { increment: parsed.data.amount } },
      });

      return t;
    });

    reply.status(201).send({ success: true, data: transfer });
  });

  // ======== ПЕРЕСЧЁТ БАЛАНСА ========

  // POST /api/accounts/:id/recalculate — Пересчитать баланс по операциям
  app.post("/:id/recalculate", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const account = await prisma.paymentAccount.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!account) throw new NotFoundError("Счёт");

    // Считаем баланс по всем операциям
    const [income, expenses, transfersOut, transfersIn, creditPay] = await Promise.all([
      prisma.payment.aggregate({ where: { accountId: id }, _sum: { amount: true } }),
      prisma.expense.aggregate({ where: { accountId: id }, _sum: { amount: true } }),
      prisma.accountTransfer.aggregate({ where: { fromAccountId: id }, _sum: { amount: true } }),
      prisma.accountTransfer.aggregate({ where: { toAccountId: id }, _sum: { amount: true } }),
      prisma.creditPayment.aggregate({ where: { accountId: id }, _sum: { amount: true } }),
    ]);

    const balance =
      Number(income._sum.amount || 0)
      - Number(expenses._sum.amount || 0)
      - Number(transfersOut._sum.amount || 0)
      + Number(transfersIn._sum.amount || 0)
      - Number(creditPay._sum.amount || 0);

    const updated = await prisma.paymentAccount.update({
      where: { id },
      data: { balance },
    });

    reply.send({ success: true, data: updated });
  });
}
