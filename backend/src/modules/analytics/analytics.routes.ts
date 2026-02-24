import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.js";

// Линейная регрессия (y = a + bx)
function linearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = data.length;
  if (n < 2) return { slope: 0, intercept: data[0]?.y || 0 };
  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  // ======== ВЫРУЧКА ПО МЕСЯЦАМ ========
  // GET /api/analytics/revenue?year=2026
  app.get("/revenue", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { year } = request.query as { year?: string };
    const y = parseInt(year || String(new Date().getFullYear()));

    const payments = await prisma.payment.findMany({
      where: {
        client: { organizationId: orgId },
        date: { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31T23:59:59`) },
      },
      select: { amount: true, date: true },
    });

    const expenses = await prisma.expense.findMany({
      where: {
        organizationId: orgId,
        date: { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31T23:59:59`) },
      },
      select: { amount: true, date: true, category: true },
    });

    // Группируем по месяцам
    const months: { month: string; revenue: number; expenses: number; profit: number }[] = [];
    for (let m = 0; m < 12; m++) {
      const label = `${y}-${String(m + 1).padStart(2, "0")}`;
      const rev = payments
        .filter(p => new Date(p.date).getMonth() === m)
        .reduce((s, p) => s + Number(p.amount), 0);
      const exp = expenses
        .filter(e => new Date(e.date).getMonth() === m)
        .reduce((s, e) => s + Number(e.amount), 0);
      months.push({ month: label, revenue: Math.round(rev), expenses: Math.round(exp), profit: Math.round(rev - exp) });
    }

    // Объёмы заказов по месяцам
    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        receivedAt: { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31T23:59:59`) },
      },
      select: { receivedAt: true, totalPrice: true },
    });

    const ordersByMonth = Array.from({ length: 12 }, (_, m) => {
      const mo = orders.filter(o => new Date(o.receivedAt).getMonth() === m);
      return {
        month: `${y}-${String(m + 1).padStart(2, "0")}`,
        count: mo.length,
        amount: Math.round(mo.reduce((s, o) => s + Number(o.totalPrice), 0)),
      };
    });

    reply.send({ success: true, data: { months, ordersByMonth, year: y } });
  });

  // ======== ДЕДЛАЙНЫ / СРОКИ ========
  // GET /api/analytics/deadlines?dateFrom=...&dateTo=...
  app.get("/deadlines", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { dateFrom, dateTo } = request.query as { dateFrom?: string; dateTo?: string };

    const now = new Date();
    const from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), 0, 1);
    const to = dateTo ? new Date(dateTo) : now;

    const delivered = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        status: "DELIVERED",
        deliveredAt: { not: null },
        dueDate: { not: null },
        receivedAt: { gte: from, lte: to },
      },
      select: {
        id: true, deliveredAt: true, dueDate: true, receivedAt: true,
        client: { select: { id: true, name: true, shortName: true } },
      },
    });

    let onTime = 0;
    let late = 0;
    let totalDelay = 0;
    const byClient = new Map<string, { name: string; total: number; onTime: number; avgDelay: number; delays: number[] }>();

    for (const o of delivered) {
      const due = new Date(o.dueDate!).getTime();
      const actual = new Date(o.deliveredAt!).getTime();
      const delayDays = Math.max(0, Math.round((actual - due) / (1000 * 60 * 60 * 24)));

      if (actual <= due) onTime++;
      else { late++; totalDelay += delayDays; }

      const cId = o.client.id;
      if (!byClient.has(cId)) byClient.set(cId, { name: o.client.shortName || o.client.name, total: 0, onTime: 0, avgDelay: 0, delays: [] });
      const c = byClient.get(cId)!;
      c.total++;
      if (actual <= due) c.onTime++;
      else c.delays.push(delayDays);
    }

    // Финализируем по клиенту
    const clientStats = Array.from(byClient.values()).map(c => ({
      name: c.name,
      total: c.total,
      onTime: c.onTime,
      onTimeRate: c.total > 0 ? Math.round((c.onTime / c.total) * 100) : 0,
      avgDelay: c.delays.length > 0 ? Math.round(c.delays.reduce((a, b) => a + b, 0) / c.delays.length * 10) / 10 : 0,
    })).sort((a, b) => b.total - a.total).slice(0, 15);

    const total = onTime + late;

    reply.send({
      success: true,
      data: {
        summary: {
          total,
          onTime,
          late,
          onTimeRate: total > 0 ? Math.round((onTime / total) * 100) : 0,
          avgDelay: late > 0 ? Math.round(totalDelay / late * 10) / 10 : 0,
        },
        byClient: clientStats,
      },
    });
  });

  // ======== ТЕХНИКИ — РЕЙТИНГ ========
  // GET /api/analytics/technicians?dateFrom=...&dateTo=...
  app.get("/technicians", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { dateFrom, dateTo } = request.query as { dateFrom?: string; dateTo?: string };

    const now = new Date();
    const from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), 0, 1);
    const to = dateTo ? new Date(dateTo) : now;

    // Этапы техников
    const stages = await prisma.orderStage.findMany({
      where: {
        order: { organizationId: orgId },
        completedAt: { gte: from, lte: to },
        status: "COMPLETED",
        assigneeId: { not: null },
      },
      select: {
        assigneeId: true,
        assignee: { select: { id: true, firstName: true, lastName: true, department: true, role: true } },
      },
    });

    // Зарплаты за период
    const periodFrom = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
    const periodTo = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}`;

    const salaries = await prisma.salaryRecord.findMany({
      where: {
        user: { organizationId: orgId },
        period: { gte: periodFrom, lte: periodTo },
      },
      select: { userId: true, amount: true },
    });

    // Переделки по технику
    const reworks = await prisma.rework.findMany({
      where: {
        organizationId: orgId,
        responsibleId: { not: null },
        detectedAt: { gte: from, lte: to },
      },
      select: { responsibleId: true, cost: true },
    });

    // Агрегируем
    const techMap = new Map<string, {
      name: string; department: string | null; role: string;
      stagesCompleted: number; salary: number; reworks: number; reworkCost: number;
    }>();

    for (const s of stages) {
      const id = s.assigneeId!;
      if (!techMap.has(id)) {
        techMap.set(id, {
          name: `${s.assignee?.lastName} ${s.assignee?.firstName}`,
          department: s.assignee?.department || null,
          role: s.assignee?.role || "",
          stagesCompleted: 0, salary: 0, reworks: 0, reworkCost: 0,
        });
      }
      techMap.get(id)!.stagesCompleted++;
    }

    for (const s of salaries) {
      if (!techMap.has(s.userId)) continue;
      techMap.get(s.userId)!.salary += Number(s.amount);
    }

    for (const r of reworks) {
      const id = r.responsibleId!;
      if (!techMap.has(id)) continue;
      techMap.get(id)!.reworks++;
      techMap.get(id)!.reworkCost += Number(r.cost);
    }

    const technicians = Array.from(techMap.entries()).map(([id, t]) => ({
      id,
      ...t,
      salary: Math.round(t.salary),
      reworkCost: Math.round(t.reworkCost),
      reworkRate: t.stagesCompleted > 0 ? Math.round((t.reworks / t.stagesCompleted) * 100 * 10) / 10 : 0,
    })).sort((a, b) => b.stagesCompleted - a.stagesCompleted);

    reply.send({ success: true, data: technicians });
  });

  // ======== ПРОГНОЗЫ ========
  // GET /api/analytics/forecast?months=3
  app.get("/forecast", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { months: forecastMonths } = request.query as { months?: string };
    const ahead = parseInt(forecastMonths || "3");

    // Собираем данные за последние 12 месяцев
    const now = new Date();
    const lookback = 12;
    const startDate = new Date(now.getFullYear(), now.getMonth() - lookback + 1, 1);

    const payments = await prisma.payment.findMany({
      where: {
        client: { organizationId: orgId },
        date: { gte: startDate },
      },
      select: { amount: true, date: true },
    });

    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        receivedAt: { gte: startDate },
      },
      select: { receivedAt: true, totalPrice: true },
    });

    // Агрегируем по месяцам
    const revenueData: { x: number; y: number; label: string }[] = [];
    const ordersData: { x: number; y: number; label: string }[] = [];

    for (let i = 0; i < lookback; i++) {
      const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const m = d.getMonth();
      const yr = d.getFullYear();
      const label = `${yr}-${String(m + 1).padStart(2, "0")}`;

      const rev = payments
        .filter(p => { const pd = new Date(p.date); return pd.getMonth() === m && pd.getFullYear() === yr; })
        .reduce((s, p) => s + Number(p.amount), 0);

      const cnt = orders.filter(o => { const od = new Date(o.receivedAt); return od.getMonth() === m && od.getFullYear() === yr; }).length;

      revenueData.push({ x: i, y: Math.round(rev), label });
      ordersData.push({ x: i, y: cnt, label });
    }

    // Регрессия
    const revReg = linearRegression(revenueData);
    const ordReg = linearRegression(ordersData);

    // Прогноз
    const revenueHistory = revenueData.map(d => ({ month: d.label, actual: d.y }));
    const revenueForecast: { month: string; forecast: number }[] = [];
    const ordersHistory = ordersData.map(d => ({ month: d.label, actual: d.y }));
    const ordersForecast: { month: string; forecast: number }[] = [];

    for (let i = 0; i < ahead; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const x = lookback + i;
      revenueForecast.push({ month: label, forecast: Math.max(0, Math.round(revReg.intercept + revReg.slope * x)) });
      ordersForecast.push({ month: label, forecast: Math.max(0, Math.round(ordReg.intercept + ordReg.slope * x)) });
    }

    reply.send({
      success: true,
      data: {
        revenue: { history: revenueHistory, forecast: revenueForecast, trend: revReg.slope > 0 ? "up" : "down" },
        orders: { history: ordersHistory, forecast: ordersForecast, trend: ordReg.slope > 0 ? "up" : "down" },
      },
    });
  });

  // ======== РЕЙТИНГ ВРАЧЕЙ ========
  // GET /api/analytics/doctors?dateFrom=...&dateTo=...&clientId=...
  app.get("/doctors", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { dateFrom, dateTo, clientId } = request.query as { dateFrom?: string; dateTo?: string; clientId?: string };

    const now = new Date();
    const from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), 0, 1);
    const to = dateTo ? new Date(dateTo) : now;

    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        receivedAt: { gte: from, lte: to },
        doctorId: { not: null },
        ...(clientId ? { clientId } : {}),
      },
      select: {
        totalPrice: true,
        doctorId: true,
        doctor: { select: { id: true, firstName: true, lastName: true, specialty: true } },
        client: { select: { id: true, name: true, shortName: true } },
      },
    });

    const doctorMap = new Map<string, {
      name: string; specialty: string | null; clientName: string; clientId: string;
      revenue: number; count: number;
    }>();

    for (const o of orders) {
      if (!o.doctorId || !o.doctor) continue;
      const id = o.doctorId;
      if (!doctorMap.has(id)) {
        doctorMap.set(id, {
          name: `${o.doctor.lastName} ${o.doctor.firstName}`,
          specialty: o.doctor.specialty,
          clientName: o.client.shortName || o.client.name,
          clientId: o.client.id,
          revenue: 0,
          count: 0,
        });
      }
      const d = doctorMap.get(id)!;
      d.revenue += Number(o.totalPrice);
      d.count++;
    }

    const totalRevenue = Array.from(doctorMap.values()).reduce((s, d) => s + d.revenue, 0);

    const doctors = Array.from(doctorMap.entries()).map(([id, d]) => ({
      id,
      ...d,
      revenue: Math.round(d.revenue),
      avgCheck: d.count > 0 ? Math.round(d.revenue / d.count) : 0,
      percent: totalRevenue > 0 ? Math.round((d.revenue / totalRevenue) * 100 * 10) / 10 : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    reply.send({ success: true, data: { doctors, totalRevenue: Math.round(totalRevenue) } });
  });

  // ======== ДНЕВНЫЕ ОБЪЁМЫ ========
  // GET /api/analytics/daily?year=2026&month=01
  app.get("/daily", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { year, month } = request.query as { year?: string; month?: string };

    const y = parseInt(year || String(new Date().getFullYear()));
    const m = parseInt(month || String(new Date().getMonth() + 1));

    const from = new Date(y, m - 1, 1);
    const to = new Date(y, m, 0, 23, 59, 59);

    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        receivedAt: { gte: from, lte: to },
      },
      select: { receivedAt: true, totalPrice: true },
    });

    const payments = await prisma.payment.findMany({
      where: {
        client: { organizationId: orgId },
        date: { gte: from, lte: to },
      },
      select: { amount: true, date: true },
    });

    // Build daily breakdown
    const daysInMonth = new Date(y, m, 0).getDate();
    const days: { date: string; dayOfWeek: string; ordersCount: number; ordersAmount: number; paymentsAmount: number; cumulative: number }[] = [];
    const DOW = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    let cumulative = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOrders = orders.filter(o => new Date(o.receivedAt).getDate() === d);
      const dayPayments = payments.filter(p => new Date(p.date).getDate() === d);

      const ordersAmount = dayOrders.reduce((s, o) => s + Number(o.totalPrice), 0);
      const paymentsAmount = dayPayments.reduce((s, p) => s + Number(p.amount), 0);
      cumulative += paymentsAmount;

      days.push({
        date: dateStr,
        dayOfWeek: DOW[date.getDay()],
        ordersCount: dayOrders.length,
        ordersAmount: Math.round(ordersAmount),
        paymentsAmount: Math.round(paymentsAmount),
        cumulative: Math.round(cumulative),
      });
    }

    reply.send({ success: true, data: { days, month: m, year: y } });
  });

  // ======== РАСПРЕДЕЛЕНИЕ КЛИЕНТОВ ========
  // GET /api/analytics/clients?year=2026
  app.get("/clients", async (request, reply) => {
    const orgId = request.user.organizationId;
    const { year } = request.query as { year?: string };
    const y = parseInt(year || String(new Date().getFullYear()));

    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        receivedAt: { gte: new Date(`${y}-01-01`), lte: new Date(`${y}-12-31T23:59:59`) },
      },
      select: {
        totalPrice: true,
        client: { select: { id: true, name: true, shortName: true } },
      },
    });

    const clientMap = new Map<string, { name: string; count: number; revenue: number }>();
    for (const o of orders) {
      const id = o.client.id;
      if (!clientMap.has(id)) clientMap.set(id, { name: o.client.shortName || o.client.name, count: 0, revenue: 0 });
      const c = clientMap.get(id)!;
      c.count++;
      c.revenue += Number(o.totalPrice);
    }

    const clients = Array.from(clientMap.values())
      .map(c => ({ ...c, revenue: Math.round(c.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 20);

    const totalRevenue = clients.reduce((s, c) => s + c.revenue, 0);

    reply.send({ success: true, data: { clients, totalRevenue, year: y } });
  });
}
