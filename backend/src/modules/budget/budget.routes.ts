import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError } from "../../lib/errors.js";
import { z } from "zod";

const upsertTargetSchema = z.object({
  targets: z.array(z.object({
    period: z.string().regex(/^\d{4}-\d{2}$/, "Формат: YYYY-MM"),
    category: z.string(),
    amount: z.number().min(0),
  })),
});

// Категории P&L (fallback если справочник пуст)
const FALLBACK_PL_CATEGORIES = [
  { key: "revenue", label: "Выручка", type: "income" },
  { key: "salary", label: "Зарплата", type: "expense" },
  { key: "materials", label: "Материалы", type: "expense" },
  { key: "subcontract", label: "Субподряд", type: "expense" },
  { key: "rent", label: "Аренда", type: "expense" },
  { key: "equipment", label: "Оборудование", type: "expense" },
  { key: "logistics", label: "Логистика", type: "expense" },
  { key: "credit", label: "Кредиты", type: "expense" },
  { key: "other", label: "Прочее", type: "expense" },
] as const;

/** Загрузить категории P&L из справочника организации */
async function getPlCategories(orgId: string): Promise<Array<{ key: string; label: string; type: string }>> {
  const refs = await prisma.referenceList.findMany({
    where: { organizationId: orgId, type: "pl_category", isActive: true },
    orderBy: { sortOrder: "asc" },
  });
  if (refs.length === 0) return [...FALLBACK_PL_CATEGORIES];
  return refs.map(r => ({
    key: r.code,
    label: r.name,
    type: (r.metadata as Record<string, unknown>)?.type === "income" ? "income" : "expense",
  }));
}

export async function budgetRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ======== P&L ЗА ПЕРИОД ========

  // GET /api/budget/pl?year=2026&month=02 — P&L за месяц или год
  app.get("/pl", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { year, month } = request.query as { year?: string; month?: string };

    const y = parseInt(year || String(new Date().getFullYear()));

    // Определяем диапазон дат
    let dateFrom: Date;
    let dateTo: Date;
    let periods: string[];

    if (month) {
      // Один месяц
      const m = parseInt(month) - 1;
      dateFrom = new Date(y, m, 1);
      dateTo = new Date(y, m + 1, 0, 23, 59, 59);
      periods = [`${y}-${String(m + 1).padStart(2, "0")}`];
    } else {
      // Весь год
      dateFrom = new Date(y, 0, 1);
      dateTo = new Date(y, 11, 31, 23, 59, 59);
      periods = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
    }

    // Факт: собираем данные из разных таблиц
    const [
      revenue,
      expensesByCategory,
      salaryTotal,
      creditPayments,
    ] = await Promise.all([
      // Выручка = сумма оплат от клиентов
      prisma.payment.aggregate({
        where: {
          client: { organizationId: orgId },
          date: { gte: dateFrom, lte: dateTo },
        },
        _sum: { amount: true },
      }),
      // Расходы по категориям
      prisma.expense.groupBy({
        by: ["category"],
        where: {
          organizationId: orgId,
          date: { gte: dateFrom, lte: dateTo },
        },
        _sum: { amount: true },
      }),
      // Зарплата
      prisma.salaryRecord.aggregate({
        where: {
          user: { organizationId: orgId },
          period: month ? `${y}-${String(parseInt(month)).padStart(2, "0")}` : { startsWith: String(y) },
          isPaid: true,
        },
        _sum: { amount: true },
      }),
      // Платежи по кредитам
      prisma.creditPayment.aggregate({
        where: {
          credit: { organizationId: orgId },
          date: { gte: dateFrom, lte: dateTo },
        },
        _sum: { amount: true },
      }),
    ]);

    // План: из BudgetTarget
    const targets = await prisma.budgetTarget.findMany({
      where: {
        organizationId: orgId,
        period: { in: periods },
      },
    });

    // Собираем план по категориям (суммируем если несколько месяцев)
    const planByCategory: Record<string, number> = {};
    for (const t of targets) {
      planByCategory[t.category] = (planByCategory[t.category] || 0) + Number(t.amount);
    }

    // Собираем факт по категориям
    const expenseMap: Record<string, number> = {};
    for (const e of expensesByCategory) {
      expenseMap[e.category] = Number(e._sum.amount || 0);
    }

    const revenueNum = Number(revenue._sum.amount || 0);
    const salaryNum = Number(salaryTotal._sum.amount || 0);
    const creditNum = Number(creditPayments._sum.amount || 0);

    // Строим P&L строки
    const plCategories = await getPlCategories(orgId);
    const rows = plCategories.map(cat => {
      let fact: number;
      if (cat.key === "revenue") {
        fact = revenueNum;
      } else if (cat.key === "salary") {
        fact = salaryNum + (expenseMap["salary"] || 0);
      } else if (cat.key === "credit") {
        fact = creditNum;
      } else {
        fact = expenseMap[cat.key] || 0;
      }

      const plan = planByCategory[cat.key] || 0;
      const variance = cat.type === "income" ? fact - plan : plan - fact;

      return {
        category: cat.key,
        label: cat.label,
        type: cat.type,
        plan,
        fact,
        variance,
        variancePercent: plan > 0 ? Math.round((variance / plan) * 100) : 0,
      };
    });

    // Итоги
    const totalRevenue = rows.find(r => r.category === "revenue")?.fact || 0;
    const totalExpenses = rows.filter(r => r.type === "expense").reduce((s, r) => s + r.fact, 0);
    const grossMargin = totalRevenue - totalExpenses;
    const marginPercent = totalRevenue > 0 ? Math.round((grossMargin / totalRevenue) * 100) : 0;

    const planRevenue = planByCategory["revenue"] || 0;
    const planExpenses = rows.filter(r => r.type === "expense").reduce((s, r) => s + r.plan, 0);
    const planProfit = planRevenue - planExpenses;

    reply.send({
      success: true,
      data: {
        period: month ? `${y}-${String(parseInt(month)).padStart(2, "0")}` : String(y),
        rows,
        summary: {
          revenue: totalRevenue,
          expenses: totalExpenses,
          profit: grossMargin,
          marginPercent,
          planRevenue,
          planExpenses,
          planProfit,
        },
      },
    });
  });

  // ======== P&L ПОМЕСЯЧНО (ТАБЛИЦА) ========

  // GET /api/budget/pl-monthly?year=2026 — P&L по месяцам
  app.get("/pl-monthly", async (request, reply) => {
    const orgId = request.user.organizationId;
    const y = parseInt((request.query as { year?: string }).year || String(new Date().getFullYear()));

    const months: Array<{ period: string; revenue: number; expenses: number; profit: number; marginPercent: number }> = [];

    for (let m = 0; m < 12; m++) {
      const dateFrom = new Date(y, m, 1);
      const dateTo = new Date(y, m + 1, 0, 23, 59, 59);

      const [rev, exp, sal, cred] = await Promise.all([
        prisma.payment.aggregate({
          where: { client: { organizationId: orgId }, date: { gte: dateFrom, lte: dateTo } },
          _sum: { amount: true },
        }),
        prisma.expense.aggregate({
          where: { organizationId: orgId, date: { gte: dateFrom, lte: dateTo } },
          _sum: { amount: true },
        }),
        prisma.salaryRecord.aggregate({
          where: { user: { organizationId: orgId }, period: `${y}-${String(m + 1).padStart(2, "0")}`, isPaid: true },
          _sum: { amount: true },
        }),
        prisma.creditPayment.aggregate({
          where: { credit: { organizationId: orgId }, date: { gte: dateFrom, lte: dateTo } },
          _sum: { amount: true },
        }),
      ]);

      const revenue = Number(rev._sum.amount || 0);
      const expenses = Number(exp._sum.amount || 0) + Number(sal._sum.amount || 0) + Number(cred._sum.amount || 0);
      const profit = revenue - expenses;

      months.push({
        period: `${y}-${String(m + 1).padStart(2, "0")}`,
        revenue,
        expenses,
        profit,
        marginPercent: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
      });
    }

    // YTD
    const ytdRevenue = months.reduce((s, m) => s + m.revenue, 0);
    const ytdExpenses = months.reduce((s, m) => s + m.expenses, 0);
    const ytdProfit = ytdRevenue - ytdExpenses;

    reply.send({
      success: true,
      data: {
        year: y,
        months,
        ytd: {
          revenue: ytdRevenue,
          expenses: ytdExpenses,
          profit: ytdProfit,
          marginPercent: ytdRevenue > 0 ? Math.round((ytdProfit / ytdRevenue) * 100) : 0,
        },
      },
    });
  });

  // ======== ПЛАН (BUDGET TARGETS) ========

  // GET /api/budget/targets?year=2026 — Плановые значения
  app.get("/targets", async (request, reply) => {
    const orgId = request.user.organizationId;
    const y = (request.query as { year?: string }).year || String(new Date().getFullYear());

    const targets = await prisma.budgetTarget.findMany({
      where: {
        organizationId: orgId,
        period: { startsWith: y },
      },
      orderBy: [{ period: "asc" }, { category: "asc" }],
    });

    reply.send({ success: true, data: targets });
  });

  // PUT /api/budget/targets — Bulk upsert плановых значений
  app.put("/targets", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = upsertTargetSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;

    const results = await prisma.$transaction(
      parsed.data.targets.map(t =>
        prisma.budgetTarget.upsert({
          where: {
            organizationId_period_category: {
              organizationId: orgId,
              period: t.period,
              category: t.category,
            },
          },
          update: { amount: t.amount },
          create: {
            organizationId: orgId,
            period: t.period,
            category: t.category,
            amount: t.amount,
          },
        })
      )
    );

    reply.send({ success: true, data: { upserted: results.length } });
  });

  // ======== КАТЕГОРИИ P&L ========

  // GET /api/budget/categories — Список категорий P&L
  app.get("/categories", async (request, reply) => {
    const orgId = request.user.organizationId;
    const categories = await getPlCategories(orgId);
    reply.send({ success: true, data: categories });
  });
}
