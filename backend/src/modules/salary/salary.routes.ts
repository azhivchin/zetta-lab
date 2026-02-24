import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";
import { Prisma } from "@prisma/client";

const calculateSalarySchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Формат: YYYY-MM"),
  userId: z.string().optional(), // Если не указан — рассчитать для всех техников
});

const markPaidSchema = z.object({
  ids: z.array(z.string()).min(1),
});

export async function salaryRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // GET /api/salary/records — Ведомость зарплат
  app.get("/records", async (request, reply) => {
    const { period, userId, isPaid } = request.query as Record<string, string>;
    const orgId = request.user.organizationId;

    const where: Prisma.SalaryRecordWhereInput = {
      user: { organizationId: orgId },
    };
    if (period) where.period = period;
    if (userId) where.userId = userId;
    if (isPaid !== undefined) where.isPaid = isPaid === "true";

    const records = await prisma.salaryRecord.findMany({
      where,
      orderBy: [{ period: "desc" }, { user: { lastName: "asc" } }],
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true } },
      },
    });

    // Totals for the period
    const totalAmount = records.reduce((sum, r) => sum + Number(r.amount), 0);
    const paidAmount = records.filter(r => r.isPaid).reduce((sum, r) => sum + Number(r.amount), 0);

    reply.send({
      success: true,
      data: {
        records,
        totals: { total: totalAmount, paid: paidAmount, unpaid: totalAmount - paidAmount },
      },
    });
  });

  // POST /api/salary/calculate — Рассчитать зарплату за период
  app.post("/calculate", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = calculateSalarySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;
    const { period, userId } = parsed.data;

    // Get period date range
    const [year, month] = period.split("-").map(Number);
    const periodStart = new Date(year, month - 1, 1);
    const periodEnd = new Date(year, month, 0, 23, 59, 59);

    // Get technicians
    const techWhere: Prisma.UserWhereInput = {
      organizationId: orgId,
      isActive: true,
      role: { in: ["SENIOR_TECH", "TECHNICIAN", "CAD_SPECIALIST", "GYPSUM_WORKER", "CERAMIST"] },
    };
    if (userId) techWhere.id = userId;

    const technicians = await prisma.user.findMany({
      where: techWhere,
      select: { id: true, firstName: true, lastName: true, role: true },
    });

    const results = [];

    for (const tech of technicians) {
      // Find completed stages for this technician in this period
      const completedStages = await prisma.orderStage.findMany({
        where: {
          assigneeId: tech.id,
          status: "COMPLETED",
          completedAt: { gte: periodStart, lte: periodEnd },
          order: { organizationId: orgId },
        },
        include: {
          order: {
            include: {
              items: {
                include: {
                  workItem: { select: { name: true, techPayRate: true, techPayPercent: true, basePrice: true } },
                },
              },
            },
          },
        },
      });

      // Calculate salary
      let totalSalary = new Prisma.Decimal(0);
      const details: Array<{
        orderId: string;
        orderNumber: string;
        stageName: string;
        works: string[];
        amount: number;
      }> = [];

      for (const stage of completedStages) {
        let stageAmount = new Prisma.Decimal(0);
        const works: string[] = [];

        for (const item of stage.order.items) {
          const wi = item.workItem;
          let payAmount = new Prisma.Decimal(0);

          if (wi.techPayRate && !wi.techPayRate.isZero()) {
            // Fixed rate per unit
            payAmount = wi.techPayRate.mul(item.quantity);
          } else if (wi.techPayPercent && !wi.techPayPercent.isZero()) {
            // Percentage of price
            payAmount = item.total.mul(wi.techPayPercent).div(100);
          }

          stageAmount = stageAmount.add(payAmount);
          if (!payAmount.isZero()) {
            works.push(`${wi.name}: ${payAmount.toFixed(0)} ₽`);
          }
        }

        // Divide among stages (simplified: each stage gets equal share)
        const stagesCount = await prisma.orderStage.count({
          where: { orderId: stage.orderId, status: "COMPLETED" },
        });
        const perStage = stagesCount > 0 ? stageAmount.div(stagesCount) : stageAmount;
        totalSalary = totalSalary.add(perStage);

        details.push({
          orderId: stage.orderId,
          orderNumber: stage.order.orderNumber,
          stageName: stage.name,
          works,
          amount: Number(perStage.toFixed(2)),
        });
      }

      // Upsert salary record
      const record = await prisma.salaryRecord.upsert({
        where: {
          userId_period: { userId: tech.id, period },
        },
        update: {
          amount: totalSalary,
          details: details as unknown as Prisma.JsonValue,
        },
        create: {
          userId: tech.id,
          period,
          amount: totalSalary,
          details: details as unknown as Prisma.JsonValue,
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
      });

      results.push(record);
    }

    reply.send({ success: true, data: results });
  });

  // PATCH /api/salary/pay — Отметить зарплату как выплаченную
  app.patch("/pay", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = markPaidSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Укажите ID записей");
    }

    await prisma.salaryRecord.updateMany({
      where: {
        id: { in: parsed.data.ids },
        user: { organizationId: request.user.organizationId },
      },
      data: { isPaid: true, paidAt: new Date() },
    });

    reply.send({ success: true, message: "Зарплата отмечена как выплаченная" });
  });

  // GET /api/salary/by-department — Зарплата по отделам с помесячной разбивкой
  app.get("/by-department", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const orgId = request.user.organizationId;
    const { year } = request.query as { year?: string };
    const y = parseInt(year || String(new Date().getFullYear()));

    const records = await prisma.salaryRecord.findMany({
      where: {
        user: { organizationId: orgId },
        period: { gte: `${y}-01`, lte: `${y}-12` },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, role: true, department: true } },
      },
    });

    // Group by department → technician → month
    const deptMap = new Map<string, Map<string, { name: string; role: string; months: Record<string, number>; total: number }>>();

    for (const r of records) {
      const dept = r.user.department || r.user.role || "Другое";
      if (!deptMap.has(dept)) deptMap.set(dept, new Map());
      const techMap = deptMap.get(dept)!;
      const techId = r.userId;
      if (!techMap.has(techId)) {
        techMap.set(techId, {
          name: `${r.user.lastName} ${r.user.firstName}`,
          role: r.user.role,
          months: {},
          total: 0,
        });
      }
      const tech = techMap.get(techId)!;
      const month = r.period.split("-")[1];
      tech.months[month] = (tech.months[month] || 0) + Number(r.amount);
      tech.total += Number(r.amount);
    }

    const departments = Array.from(deptMap.entries()).map(([dept, techMap]) => {
      const technicians = Array.from(techMap.values()).sort((a, b) => b.total - a.total);
      const deptTotal = technicians.reduce((s, t) => s + t.total, 0);
      const deptMonths: Record<string, number> = {};
      for (const t of technicians) {
        for (const [m, v] of Object.entries(t.months)) {
          deptMonths[m] = (deptMonths[m] || 0) + v;
        }
      }
      return { department: dept, technicians, total: Math.round(deptTotal), months: deptMonths };
    }).sort((a, b) => b.total - a.total);

    reply.send({ success: true, data: { departments, year: y } });
  });

  // GET /api/salary/decomposition — Зарплата с разбивкой по типу работы
  app.get("/decomposition", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const orgId = request.user.organizationId;
    const { period } = request.query as { period?: string };

    const now = new Date();
    const currentPeriod = period || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [yr, mo] = currentPeriod.split("-").map(Number);
    const periodStart = new Date(yr, mo - 1, 1);
    const periodEnd = new Date(yr, mo, 0, 23, 59, 59);

    const stages = await prisma.orderStage.findMany({
      where: {
        order: { organizationId: orgId },
        status: "COMPLETED",
        completedAt: { gte: periodStart, lte: periodEnd },
        assigneeId: { not: null },
      },
      select: {
        name: true,
        assigneeId: true,
        assignee: { select: { id: true, firstName: true, lastName: true, role: true, department: true } },
        order: {
          select: {
            items: {
              select: {
                quantity: true,
                total: true,
                workItem: { select: { techPayRate: true, techPayPercent: true, category: { select: { code: true, name: true } } } },
              },
            },
          },
        },
      },
    });

    const PROCESS_MAP: Record<string, string> = {
      "1": "DIGITAL_MODELING", "2": "TECHNICAL", "3": "AESTHETIC",
      "4": "MILLING", "5": "PRINTING", "6": "CASTING",
    };
    const PROCESS_LABELS: Record<string, string> = {
      DIGITAL_MODELING: "Цифровое моделирование", TECHNICAL: "Техническая часть",
      AESTHETIC: "Эстетическая часть", MILLING: "Фрезеровка",
      PRINTING: "Печать", CASTING: "Литьё",
    };

    const techMap = new Map<string, { name: string; role: string; processes: Record<string, number>; total: number }>();

    for (const stage of stages) {
      if (!stage.assigneeId || !stage.assignee) continue;
      const tid = stage.assigneeId;
      if (!techMap.has(tid)) {
        techMap.set(tid, { name: `${stage.assignee.lastName} ${stage.assignee.firstName}`, role: stage.assignee.role, processes: {}, total: 0 });
      }
      const tech = techMap.get(tid)!;
      for (const item of stage.order.items) {
        const catCode = item.workItem?.category?.code || "0";
        const process = PROCESS_MAP[catCode] || "OTHER";
        let payAmount = 0;
        if (item.workItem?.techPayRate && Number(item.workItem.techPayRate) > 0) {
          payAmount = Number(item.workItem.techPayRate) * item.quantity;
        } else if (item.workItem?.techPayPercent && Number(item.workItem.techPayPercent) > 0) {
          payAmount = Number(item.total) * Number(item.workItem.techPayPercent) / 100;
        }
        tech.processes[process] = (tech.processes[process] || 0) + payAmount;
        tech.total += payAmount;
      }
    }

    const technicians = Array.from(techMap.values())
      .map(t => ({ ...t, total: Math.round(t.total), processes: Object.fromEntries(Object.entries(t.processes).map(([k, v]) => [k, Math.round(v)])) }))
      .sort((a, b) => b.total - a.total);

    const processTotals: Record<string, number> = {};
    for (const t of technicians) {
      for (const [p, v] of Object.entries(t.processes)) {
        processTotals[p] = (processTotals[p] || 0) + v;
      }
    }

    reply.send({ success: true, data: { technicians, processTotals, processLabels: PROCESS_LABELS, period: currentPeriod } });
  });

  // GET /api/salary/technician/:id — Детализация по технику
  app.get("/technician/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const user = await prisma.user.findFirst({
      where: { id, organizationId: request.user.organizationId },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!user) throw new NotFoundError("Сотрудник");

    const records = await prisma.salaryRecord.findMany({
      where: { userId: id },
      orderBy: { period: "desc" },
      take: 12, // Last 12 months
    });

    reply.send({ success: true, data: { user, records } });
  });
}
