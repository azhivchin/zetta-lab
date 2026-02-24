import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { Prisma } from "@prisma/client";

export async function reportsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/clients", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const orgId = request.user.organizationId;

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const clients = await prisma.client.findMany({
      where: { organizationId: orgId, isActive: true },
      select: {
        id: true,
        name: true,
        shortName: true,
        _count: { select: { orders: true, doctors: true } },
        orders: {
          where: from || to ? { createdAt: dateFilter } : undefined,
          select: {
            id: true,
            totalPrice: true,
            status: true,
            isPaid: true,
          },
        },
        payments: {
          where: from || to ? { date: dateFilter } : undefined,
          select: { amount: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const report = clients.map(c => {
      const totalRevenue = c.orders.reduce((sum, o) => sum + Number(o.totalPrice), 0);
      const totalPaid = c.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      const completedOrders = c.orders.filter(o => o.status === "DELIVERED").length;
      const activeOrders = c.orders.filter(o => !["DELIVERED", "CANCELLED"].includes(o.status)).length;

      return {
        id: c.id,
        name: c.shortName || c.name,
        fullName: c.name,
        totalOrders: c.orders.length,
        completedOrders,
        activeOrders,
        totalRevenue,
        totalPaid,
        balance: totalRevenue - totalPaid,
        doctorsCount: c._count.doctors,
      };
    });

    // Summary
    const summary = {
      totalClients: report.length,
      totalRevenue: report.reduce((s, r) => s + r.totalRevenue, 0),
      totalPaid: report.reduce((s, r) => s + r.totalPaid, 0),
      totalDebt: report.reduce((s, r) => s + Math.max(0, r.balance), 0),
      totalOrders: report.reduce((s, r) => s + r.totalOrders, 0),
    };

    reply.send({ success: true, data: { report, summary } });
  });

  app.get("/technicians", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { from, to, period } = request.query as { from?: string; to?: string; period?: string };
    const orgId = request.user.organizationId;

    // Get technicians (all production roles)
    const techRoles = ["SENIOR_TECH", "TECHNICIAN", "CAD_SPECIALIST", "GYPSUM_WORKER", "CERAMIST"] as const;
    const technicians = await prisma.user.findMany({
      where: {
        organizationId: orgId,
        role: { in: [...techRoles] },
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        assignedStages: {
          where: {
            status: "COMPLETED",
            ...(from || to ? {
              completedAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            } : {}),
          },
          select: {
            id: true,
            name: true,
            completedAt: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                items: { select: { workItem: { select: { techPayRate: true, techPayPercent: true, basePrice: true } }, total: true } },
              },
            },
          },
        },
        salaryRecords: {
          where: period ? { period } : undefined,
          select: { amount: true, isPaid: true, period: true },
        },
      },
      orderBy: { lastName: "asc" },
    });

    const report = technicians.map(t => {
      const completedStages = t.assignedStages.length;
      const uniqueOrders = new Set(t.assignedStages.map(s => s.order.id)).size;
      const totalSalary = t.salaryRecords.reduce((s, r) => s + Number(r.amount), 0);
      const paidSalary = t.salaryRecords.filter(r => r.isPaid).reduce((s, r) => s + Number(r.amount), 0);

      return {
        id: t.id,
        name: `${t.lastName} ${t.firstName}`,
        role: t.role,
        completedStages,
        uniqueOrders,
        totalSalary,
        paidSalary,
        unpaidSalary: totalSalary - paidSalary,
      };
    });

    const summary = {
      totalTechnicians: report.length,
      totalCompletedStages: report.reduce((s, r) => s + r.completedStages, 0),
      totalSalary: report.reduce((s, r) => s + r.totalSalary, 0),
      totalPaid: report.reduce((s, r) => s + r.paidSalary, 0),
      totalUnpaid: report.reduce((s, r) => s + r.unpaidSalary, 0),
    };

    reply.send({ success: true, data: { report, summary } });
  });

  app.get("/finance", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const orgId = request.user.organizationId;

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const hasDateFilter = from || to;

    // Revenue: delivered orders
    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        ...(hasDateFilter ? { deliveredAt: dateFilter } : {}),
      },
      select: { totalPrice: true, status: true, isPaid: true, deliveredAt: true, createdAt: true },
    });

    // Payments received
    const payments = await prisma.payment.findMany({
      where: {
        client: { organizationId: orgId },
        ...(hasDateFilter ? { date: dateFilter } : {}),
      },
      select: { amount: true, method: true, date: true },
    });

    // Expenses
    const expenses = await prisma.expense.findMany({
      where: {
        organizationId: orgId,
        ...(hasDateFilter ? { date: dateFilter } : {}),
      },
      select: { amount: true, category: true, description: true, date: true },
    });

    // Salary
    const salaryRecords = await prisma.salaryRecord.findMany({
      where: {
        user: { organizationId: orgId },
        isPaid: true,
      },
      select: { amount: true },
    });

    const totalRevenue = orders.filter(o => o.status === "DELIVERED").reduce((s, o) => s + Number(o.totalPrice), 0);
    const totalInvoiced = orders.reduce((s, o) => s + Number(o.totalPrice), 0);
    const totalPaymentsReceived = payments.reduce((s, p) => s + Number(p.amount), 0);
    const totalExpenses = expenses.reduce((s, e) => s + Number(e.amount), 0);
    const totalSalary = salaryRecords.reduce((s, r) => s + Number(r.amount), 0);

    // Expense breakdown by category
    const expenseByCategory: Record<string, number> = {};
    for (const e of expenses) {
      expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + Number(e.amount);
    }

    // Payment breakdown by method
    const paymentByMethod: Record<string, number> = {};
    for (const p of payments) {
      paymentByMethod[p.method] = (paymentByMethod[p.method] || 0) + Number(p.amount);
    }

    // Monthly breakdown (last 12 months)
    const monthly: Record<string, { revenue: number; expenses: number; payments: number }> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[key] = { revenue: 0, expenses: 0, payments: 0 };
    }

    for (const o of orders) {
      const date = o.deliveredAt || o.createdAt;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (monthly[key]) monthly[key].revenue += Number(o.totalPrice);
    }
    for (const e of expenses) {
      const key = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
      if (monthly[key]) monthly[key].expenses += Number(e.amount);
    }
    for (const p of payments) {
      const key = `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, "0")}`;
      if (monthly[key]) monthly[key].payments += Number(p.amount);
    }

    reply.send({
      success: true,
      data: {
        totalRevenue,
        totalInvoiced,
        totalPaymentsReceived,
        totalExpenses,
        totalSalary,
        profit: totalPaymentsReceived - totalExpenses - totalSalary,
        expenseByCategory,
        paymentByMethod,
        monthly,
      },
    });
  });

  app.get("/warehouse", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const orgId = request.user.organizationId;

    const materials = await prisma.material.findMany({
      where: { organizationId: orgId, isActive: true },
      include: {
        movements: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { type: true, quantity: true, createdAt: true, price: true },
        },
        _count: { select: { movements: true, norms: true } },
      },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    const report = materials.map(m => {
      const stockValue = Number(m.currentStock) * Number(m.avgPrice);
      const isLow = m.currentStock.lessThan(m.minStock);

      return {
        id: m.id,
        name: m.name,
        category: m.category,
        unit: m.unit,
        currentStock: Number(m.currentStock),
        minStock: Number(m.minStock),
        avgPrice: Number(m.avgPrice),
        stockValue,
        isLow,
        movementsCount: m._count.movements,
        normsCount: m._count.norms,
        recentMovements: m.movements.map(mv => ({
          type: mv.type,
          quantity: Number(mv.quantity),
          date: mv.createdAt,
        })),
      };
    });

    const summary = {
      totalMaterials: report.length,
      lowStockCount: report.filter(r => r.isLow).length,
      totalStockValue: report.reduce((s, r) => s + r.stockValue, 0),
    };

    reply.send({ success: true, data: { report, summary } });
  });

  app.get("/client-detail/:clientId", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { clientId } = request.params as { clientId: string };
    const { from, to } = request.query as { from?: string; to?: string };
    const orgId = request.user.organizationId;

    const client = await prisma.client.findFirst({
      where: { id: clientId, organizationId: orgId },
      select: {
        id: true, name: true, shortName: true, inn: true, kpp: true,
        legalEntityName: true, contractNumber: true, contractDate: true,
      },
    });
    if (!client) {
      reply.code(404).send({ success: false, error: "Клиент не найден" });
      return;
    }

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const hasDateFilter = from || to;

    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        clientId,
        ...(hasDateFilter ? { receivedAt: dateFilter } : {}),
      },
      include: {
        items: {
          include: { workItem: { select: { code: true, name: true } } },
        },
        doctor: { select: { firstName: true, lastName: true } },
        patient: { select: { firstName: true, lastName: true, patronymic: true } },
      },
      orderBy: { receivedAt: "asc" },
    });

    const payments = await prisma.payment.findMany({
      where: {
        clientId,
        ...(hasDateFilter ? { date: dateFilter } : {}),
      },
      select: { amount: true, method: true, date: true, notes: true },
      orderBy: { date: "asc" },
    });

    let totalAmount = 0;
    let totalDiscount = 0;
    let totalFinal = 0;

    const orderDetails = orders.map(o => {
      const items = o.items.map(item => {
        const price = Number(item.price);
        const qty = item.quantity;
        const discount = Number(item.discount || 0);
        const discountAmount = Number(item.discountAmount || 0);
        const total = Number(item.total);
        return {
          code: item.workItem?.code || "—",
          name: item.workItem?.name || "—",
          quantity: qty,
          price,
          discount,
          discountAmount,
          total,
          notes: item.notes,
        };
      });

      const orderTotal = Number(o.totalPrice);
      const orderDiscount = Number(o.discountTotal || 0);
      totalAmount += orderTotal + orderDiscount;
      totalDiscount += orderDiscount;
      totalFinal += orderTotal;

      const patientName = o.patient
        ? [o.patient.lastName, o.patient.firstName, o.patient.patronymic].filter(Boolean).join(" ")
        : null;
      const doctorName = o.doctor
        ? `${o.doctor.lastName} ${o.doctor.firstName}`
        : null;

      return {
        orderNumber: o.orderNumber,
        date: o.receivedAt,
        status: o.status,
        paymentStatus: o.paymentStatus,
        patient: patientName,
        doctor: doctorName,
        toothFormula: o.toothFormula,
        items,
        total: orderTotal,
        discount: orderDiscount,
        billingPeriod: o.billingPeriod,
      };
    });

    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);

    reply.send({
      success: true,
      data: {
        client: {
          name: client.shortName || client.name,
          fullName: client.name,
          inn: client.inn,
          kpp: client.kpp,
          legalEntityName: client.legalEntityName,
          contractNumber: client.contractNumber,
          contractDate: client.contractDate,
        },
        period: { from: from || null, to: to || null },
        orders: orderDetails,
        payments: payments.map(p => ({
          date: p.date,
          amount: Number(p.amount),
          method: p.method,
          notes: p.notes,
        })),
        summary: {
          totalOrders: orders.length,
          totalAmount,
          totalDiscount,
          totalFinal,
          totalPaid,
          balance: totalFinal - totalPaid,
        },
      },
    });
  });

  app.get("/tech-orders", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const orgId = request.user.organizationId;

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const stages = await prisma.orderStage.findMany({
      where: {
        order: { organizationId: orgId, ...(from || to ? { receivedAt: dateFilter } : {}) },
        assigneeId: { not: null },
      },
      select: {
        assigneeId: true,
        status: true,
        assignee: { select: { id: true, firstName: true, lastName: true } },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            client: { select: { name: true, shortName: true } },
            doctor: { select: { lastName: true, firstName: true } },
            items: { select: { quantity: true } },
          },
        },
      },
    });

    // Collect unique technicians
    const techMap = new Map<string, string>();
    for (const s of stages) {
      if (s.assigneeId && s.assignee) {
        techMap.set(s.assigneeId, `${s.assignee.lastName} ${s.assignee.firstName}`);
      }
    }
    const technicians = Array.from(techMap.entries()).map(([id, name]) => ({ id, name }));

    // Build order rows
    const orderMap = new Map<string, {
      orderId: string; orderNumber: string; status: string; client: string; doctor: string | null;
      unitCount: number; techUnits: Record<string, number>;
    }>();

    for (const s of stages) {
      const oid = s.order.id;
      if (!orderMap.has(oid)) {
        const unitCount = s.order.items.reduce((sum, i) => sum + i.quantity, 0);
        orderMap.set(oid, {
          orderId: oid,
          orderNumber: s.order.orderNumber,
          status: s.order.status,
          client: s.order.client.shortName || s.order.client.name,
          doctor: s.order.doctor ? `${s.order.doctor.lastName} ${s.order.doctor.firstName}` : null,
          unitCount,
          techUnits: {},
        });
      }
      if (s.assigneeId) {
        const row = orderMap.get(oid)!;
        row.techUnits[s.assigneeId] = (row.techUnits[s.assigneeId] || 0) + 1;
      }
    }

    const orders = Array.from(orderMap.values()).sort((a, b) => a.orderNumber.localeCompare(b.orderNumber));

    reply.send({ success: true, data: { technicians, orders } });
  });

  app.get("/order-profitability", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const orgId = request.user.organizationId;

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        status: "DELIVERED",
        ...(from || to ? { deliveredAt: dateFilter } : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        totalPrice: true,
        totalCost: true,
        client: { select: { name: true, shortName: true } },
        doctor: { select: { lastName: true, firstName: true } },
        deliveredAt: true,
        items: {
          select: {
            quantity: true,
            total: true,
            workItem: {
              select: {
                techPayRate: true,
                techPayPercent: true,
                materialNorms: {
                  select: {
                    quantity: true,
                    material: { select: { avgPrice: true } },
                  },
                },
              },
            },
          },
        },
        stages: {
          where: { status: "COMPLETED", assigneeId: { not: null } },
          select: { assigneeId: true },
        },
      },
      orderBy: { deliveredAt: "desc" },
      take: 200,
    });

    const profitability = orders.map(o => {
      const revenue = Number(o.totalPrice);

      // Calculate labor cost
      let laborCost = 0;
      for (const item of o.items) {
        if (item.workItem?.techPayRate && Number(item.workItem.techPayRate) > 0) {
          laborCost += Number(item.workItem.techPayRate) * item.quantity;
        } else if (item.workItem?.techPayPercent && Number(item.workItem.techPayPercent) > 0) {
          laborCost += Number(item.total) * Number(item.workItem.techPayPercent) / 100;
        }
      }

      // Calculate material cost
      let materialCost = 0;
      for (const item of o.items) {
        if (item.workItem?.materialNorms) {
          for (const norm of item.workItem.materialNorms) {
            materialCost += Number(norm.quantity) * Number(norm.material.avgPrice) * item.quantity;
          }
        }
      }

      const totalCost = laborCost + materialCost;
      const margin = revenue - totalCost;
      const marginPercent = revenue > 0 ? Math.round((margin / revenue) * 100 * 10) / 10 : 0;

      return {
        orderNumber: o.orderNumber,
        client: o.client.shortName || o.client.name,
        doctor: o.doctor ? `${o.doctor.lastName} ${o.doctor.firstName}` : null,
        deliveredAt: o.deliveredAt,
        revenue: Math.round(revenue),
        laborCost: Math.round(laborCost),
        materialCost: Math.round(materialCost),
        totalCost: Math.round(totalCost),
        margin: Math.round(margin),
        marginPercent,
      };
    });

    const summary = {
      totalRevenue: profitability.reduce((s, p) => s + p.revenue, 0),
      totalCost: profitability.reduce((s, p) => s + p.totalCost, 0),
      totalMargin: profitability.reduce((s, p) => s + p.margin, 0),
      avgMarginPercent: profitability.length > 0
        ? Math.round(profitability.reduce((s, p) => s + p.marginPercent, 0) / profitability.length * 10) / 10
        : 0,
      totalOrders: profitability.length,
    };

    reply.send({ success: true, data: { orders: profitability, summary } });
  });

  app.get("/orders-summary", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const orgId = request.user.organizationId;

    const dateFilter: Record<string, unknown> = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);

    const orders = await prisma.order.findMany({
      where: {
        organizationId: orgId,
        ...(from || to ? { createdAt: dateFilter } : {}),
      },
      select: {
        status: true,
        totalPrice: true,
        isPaid: true,
        isUrgent: true,
        createdAt: true,
        dueDate: true,
        deliveredAt: true,
      },
    });

    const statusBreakdown: Record<string, { count: number; totalPrice: number }> = {};
    let totalOrders = 0;
    let totalRevenue = 0;
    let paidCount = 0;
    let urgentCount = 0;
    let overdueCount = 0;
    const now = new Date();

    for (const o of orders) {
      totalOrders++;
      totalRevenue += Number(o.totalPrice);
      if (o.isPaid) paidCount++;
      if (o.isUrgent) urgentCount++;
      if (o.dueDate && o.dueDate < now && !["DELIVERED", "CANCELLED"].includes(o.status)) {
        overdueCount++;
      }

      if (!statusBreakdown[o.status]) {
        statusBreakdown[o.status] = { count: 0, totalPrice: 0 };
      }
      statusBreakdown[o.status].count++;
      statusBreakdown[o.status].totalPrice += Number(o.totalPrice);
    }

    // Average time to delivery
    const delivered = orders.filter(o => o.deliveredAt);
    const avgDays = delivered.length > 0
      ? delivered.reduce((sum, o) => {
          const days = (o.deliveredAt!.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / delivered.length
      : 0;

    reply.send({
      success: true,
      data: {
        totalOrders,
        totalRevenue,
        paidCount,
        unpaidCount: totalOrders - paidCount,
        urgentCount,
        overdueCount,
        avgDeliveryDays: Math.round(avgDays * 10) / 10,
        statusBreakdown,
      },
    });
  });
}
