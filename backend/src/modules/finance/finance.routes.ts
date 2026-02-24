import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";
import { amountInWords } from "../../lib/amount-in-words.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONT_REGULAR = path.join(__dirname, "../../fonts/PTSans-Regular.ttf");
const FONT_BOLD = path.join(__dirname, "../../fonts/PTSans-Bold.ttf");

const createInvoiceSchema = z.object({
  clientId: z.string(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  orgRequisitesId: z.string().optional(),
  contractReference: z.string().optional(),
  billingPeriod: z.string().optional(),
  variant: z.enum(["DETAILED", "SIMPLIFIED"]).optional(),
  items: z.array(z.object({
    orderId: z.string().optional(),
    description: z.string(),
    quantity: z.number().int().min(1).default(1),
    price: z.number(),
  })).min(1, "Добавьте хотя бы одну позицию"),
});

const createPaymentSchema = z.object({
  clientId: z.string(),
  amount: z.number().positive("Сумма должна быть > 0"),
  method: z.enum(["cash", "bank", "card"]).default("bank"),
  date: z.string().optional(),
  notes: z.string().optional(),
  accountId: z.string().optional(),
  orderId: z.string().optional(),
});

const updateExpenseSchema = z.object({
  category: z.string().optional(),
  description: z.string().optional(),
  amount: z.number().positive().optional(),
  isRecurring: z.boolean().optional(),
  date: z.string().optional(),
  accountId: z.string().optional(),
});

const createExpenseSchema = z.object({
  category: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  isRecurring: z.boolean().default(false),
  date: z.string().optional(),
  accountId: z.string().optional(),
});

async function recalcOrderPaymentStatus(orderId: string) {
  const payments = await prisma.payment.aggregate({
    where: { orderId },
    _sum: { amount: true },
  });
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { totalPrice: true },
  });
  if (!order) return;

  const totalPaid = Number(payments._sum.amount || 0);
  const totalPrice = Number(order.totalPrice || 0);

  let paymentStatus: string;
  if (totalPrice > 0 && totalPaid >= totalPrice) paymentStatus = "PAID";
  else if (totalPaid > 0) paymentStatus = "PARTIAL";
  else paymentStatus = "UNPAID";

  await prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus },
  });
}

export async function financeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/summary", async (request, reply) => {
    const orgId = request.user.organizationId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [
      totalRevenue,
      monthRevenue,
      totalExpenses,
      monthExpenses,
      unpaidInvoices,
      recentPayments,
    ] = await Promise.all([
      // Total revenue (all payments)
      prisma.payment.aggregate({
        where: { client: { organizationId: orgId } },
        _sum: { amount: true },
      }),
      // This month's revenue
      prisma.payment.aggregate({
        where: {
          client: { organizationId: orgId },
          date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
      }),
      // Total expenses
      prisma.expense.aggregate({
        where: { organizationId: orgId },
        _sum: { amount: true },
      }),
      // This month's expenses
      prisma.expense.aggregate({
        where: {
          organizationId: orgId,
          date: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
      }),
      // Unpaid invoices
      prisma.invoice.findMany({
        where: { client: { organizationId: orgId }, isPaid: false },
        include: { client: { select: { name: true, shortName: true } } },
        orderBy: { date: "desc" },
      }),
      // Recent payments
      prisma.payment.findMany({
        where: { client: { organizationId: orgId } },
        include: { client: { select: { name: true, shortName: true } } },
        orderBy: { date: "desc" },
        take: 10,
      }),
    ]);

    reply.send({
      success: true,
      data: {
        totalRevenue: totalRevenue._sum.amount || 0,
        monthRevenue: monthRevenue._sum.amount || 0,
        totalExpenses: totalExpenses._sum.amount || 0,
        monthExpenses: monthExpenses._sum.amount || 0,
        unpaidInvoices,
        recentPayments,
      },
    });
  });

  // GET /api/finance/invoices
  app.get("/invoices", async (request, reply) => {
    const { clientId, isPaid, page = "1", limit = "50" } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const orgId = request.user.organizationId;

    const where: Prisma.InvoiceWhereInput = {
      client: { organizationId: orgId },
    };
    if (clientId) where.clientId = clientId;
    if (isPaid !== undefined) where.isPaid = isPaid === "true";

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          client: { select: { name: true, shortName: true } },
          items: true,
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    reply.send({
      success: true,
      data: { invoices, pagination: { page: parseInt(page), limit: parseInt(limit), total } },
    });
  });

  // POST /api/finance/invoices
  app.post("/invoices", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = createInvoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    // Verify client belongs to organization
    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    // Generate invoice number
    const count = await prisma.invoice.count({
      where: { client: { organizationId: request.user.organizationId } },
    });
    const number = `С-${String(count + 1).padStart(4, "0")}`;

    const total = parsed.data.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    let orgRequisitesId = parsed.data.orgRequisitesId;
    if (!orgRequisitesId && client.ourRequisitesId) {
      orgRequisitesId = client.ourRequisitesId;
    }
    if (!orgRequisitesId) {
      const defaultReq = await prisma.orgRequisites.findFirst({
        where: { organizationId: request.user.organizationId, isDefault: true },
      });
      if (defaultReq) orgRequisitesId = defaultReq.id;
    }

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const seqCount = await prisma.invoice.count({
      where: { client: { organizationId: request.user.organizationId }, createdAt: { gte: yearStart } },
    });

    const invoice = await prisma.invoice.create({
      data: {
        clientId: parsed.data.clientId,
        number,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
        total,
        notes: parsed.data.notes,
        orgRequisitesId: orgRequisitesId || undefined,
        contractReference: parsed.data.contractReference,
        billingPeriod: parsed.data.billingPeriod,
        variant: parsed.data.variant || "DETAILED",
        sequenceNumber: seqCount + 1,
        items: {
          create: parsed.data.items.map(item => ({
            orderId: item.orderId,
            description: item.description,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
          })),
        },
      },
      include: { items: true, client: true, orgRequisites: true },
    });

    reply.status(201).send({ success: true, data: invoice });
  });

  app.patch("/invoices/:id/pay", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const invoice = await prisma.invoice.findFirst({
      where: { id, client: { organizationId: request.user.organizationId } },
    });
    if (!invoice) throw new NotFoundError("Счёт");

    const updated = await prisma.invoice.update({
      where: { id },
      data: { isPaid: true },
    });
    reply.send({ success: true, data: updated });
  });

  // GET /api/finance/payments
  app.get("/payments", async (request, reply) => {
    const { clientId, dateFrom, dateTo, page = "1", limit = "50" } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Prisma.PaymentWhereInput = {
      client: { organizationId: request.user.organizationId },
    };
    if (clientId) where.clientId = clientId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          client: { select: { name: true, shortName: true } },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    reply.send({
      success: true,
      data: { payments, pagination: { page: parseInt(page), limit: parseInt(limit), total } },
    });
  });

  // POST /api/finance/payments
  app.post("/payments", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = createPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const client = await prisma.client.findFirst({
      where: { id: parsed.data.clientId, organizationId: request.user.organizationId },
    });
    if (!client) throw new NotFoundError("Заказчик");

    const orgId = request.user.organizationId;

    // Validate accountId belongs to this org
    if (parsed.data.accountId) {
      const account = await prisma.paymentAccount.findFirst({
        where: { id: parsed.data.accountId, organizationId: orgId, isActive: true },
      });
      if (!account) throw new NotFoundError("Счёт");
    }

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          clientId: parsed.data.clientId,
          amount: parsed.data.amount,
          method: parsed.data.method,
          date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
          notes: parsed.data.notes,
          accountId: parsed.data.accountId,
          orderId: parsed.data.orderId,
        },
        include: { client: { select: { name: true, shortName: true } } },
      });

      // Update account balance (payment = income)
      if (parsed.data.accountId) {
        await tx.paymentAccount.update({
          where: { id: parsed.data.accountId },
          data: { balance: { increment: parsed.data.amount } },
        });
      }

      return p;
    });

    // Recalc order payment status if orderId provided
    if (parsed.data.orderId) {
      await recalcOrderPaymentStatus(parsed.data.orderId);
    }

    reply.status(201).send({ success: true, data: payment });
  });

  // GET /api/finance/expenses
  app.get("/expenses", async (request, reply) => {
    const { category, dateFrom, dateTo, page = "1", limit = "50" } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Prisma.ExpenseWhereInput = {
      organizationId: request.user.organizationId,
    };
    if (category) where.category = category;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: { date: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.expense.count({ where }),
    ]);

    // Group by category for summary
    const byCategory = await prisma.expense.groupBy({
      by: ["category"],
      where: { organizationId: request.user.organizationId },
      _sum: { amount: true },
    });

    reply.send({
      success: true,
      data: { expenses, byCategory, pagination: { page: parseInt(page), limit: parseInt(limit), total } },
    });
  });

  // POST /api/finance/expenses
  app.post("/expenses", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const parsed = createExpenseSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const orgId = request.user.organizationId;

    // Validate accountId belongs to this org
    if (parsed.data.accountId) {
      const account = await prisma.paymentAccount.findFirst({
        where: { id: parsed.data.accountId, organizationId: orgId, isActive: true },
      });
      if (!account) throw new NotFoundError("Счёт");
    }

    const expense = await prisma.$transaction(async (tx) => {
      const e = await tx.expense.create({
        data: {
          organizationId: orgId,
          category: parsed.data.category,
          description: parsed.data.description,
          amount: parsed.data.amount,
          isRecurring: parsed.data.isRecurring,
          date: parsed.data.date ? new Date(parsed.data.date) : new Date(),
          accountId: parsed.data.accountId,
        },
      });

      // Update account balance (expense = outgoing)
      if (parsed.data.accountId) {
        await tx.paymentAccount.update({
          where: { id: parsed.data.accountId },
          data: { balance: { decrement: parsed.data.amount } },
        });
      }

      return e;
    });

    reply.status(201).send({ success: true, data: expense });
  });

  app.patch("/expenses/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const parsed = updateExpenseSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const existing = await prisma.expense.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!existing) throw new NotFoundError("Расход");

    const newAccountId = parsed.data.accountId !== undefined ? parsed.data.accountId : existing.accountId;
    const newAmount = parsed.data.amount !== undefined ? parsed.data.amount : Number(existing.amount);
    const oldAmount = Number(existing.amount);

    const expense = await prisma.$transaction(async (tx) => {
      // Revert old account balance
      if (existing.accountId) {
        await tx.paymentAccount.update({
          where: { id: existing.accountId },
          data: { balance: { increment: oldAmount } },
        });
      }

      const e = await tx.expense.update({
        where: { id },
        data: {
          ...parsed.data,
          date: parsed.data.date ? new Date(parsed.data.date) : undefined,
          accountId: newAccountId,
        },
      });

      // Apply new account balance
      if (newAccountId) {
        await tx.paymentAccount.update({
          where: { id: newAccountId },
          data: { balance: { decrement: newAmount } },
        });
      }

      return e;
    });

    reply.send({ success: true, data: expense });
  });

  // DELETE /api/finance/expenses/:id
  app.delete("/expenses/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = (request.params as { id: string });
    const orgId = request.user.organizationId;

    const expense = await prisma.expense.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!expense) throw new NotFoundError("Расход");

    // Revert account balance if expense had accountId
    if (expense.accountId) {
      await prisma.$transaction([
        prisma.expense.delete({ where: { id } }),
        prisma.paymentAccount.update({
          where: { id: expense.accountId },
          data: { balance: { increment: expense.amount } },
        }),
      ]);
    } else {
      await prisma.expense.delete({ where: { id } });
    }

    reply.send({ success: true });
  });

  // DELETE /api/finance/payments/:id
  app.delete("/payments/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = (request.params as { id: string });
    const orgId = request.user.organizationId;

    const payment = await prisma.payment.findFirst({
      where: { id, client: { organizationId: orgId } },
    });
    if (!payment) throw new NotFoundError("Платёж");

    // Revert account balance if payment had accountId
    if (payment.accountId) {
      await prisma.$transaction([
        prisma.payment.delete({ where: { id } }),
        prisma.paymentAccount.update({
          where: { id: payment.accountId },
          data: { balance: { decrement: payment.amount } },
        }),
      ]);
    } else {
      await prisma.payment.delete({ where: { id } });
    }

    // Recalc order payment status if orderId was set
    if (payment.orderId) {
      await recalcOrderPaymentStatus(payment.orderId);
    }

    reply.send({ success: true });
  });

  // DELETE /api/finance/invoices/:id
  app.delete("/invoices/:id", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = (request.params as { id: string });
    const orgId = request.user.organizationId;

    const invoice = await prisma.invoice.findFirst({
      where: { id, client: { organizationId: orgId } },
    });
    if (!invoice) throw new NotFoundError("Счёт");

    if (invoice.isPaid) {
      throw new ValidationError("Нельзя удалить оплаченный счёт");
    }

    await prisma.$transaction([
      prisma.invoiceItem.deleteMany({ where: { invoiceId: id } }),
      prisma.invoice.delete({ where: { id } }),
    ]);

    reply.send({ success: true });
  });

  async function loadInvoiceForPdf(id: string, orgId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: { id, client: { organizationId: orgId } },
      include: {
        client: true,
        orgRequisites: true,
        items: {
          include: {
            order: {
              select: {
                orderNumber: true,
                toothFormula: true,
                patient: { select: { lastName: true, firstName: true, patronymic: true } },
              },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundError("Счёт");

    let requisites = invoice.orgRequisites;
    if (!requisites && invoice.client.ourRequisitesId) {
      requisites = await prisma.orgRequisites.findUnique({ where: { id: invoice.client.ourRequisitesId } });
    }
    if (!requisites) {
      requisites = await prisma.orgRequisites.findFirst({
        where: { organizationId: orgId, isDefault: true },
      });
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });

    return { invoice, requisites, org };
  }

  function createPdfDoc() {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });
    doc.registerFont("PTSans", FONT_REGULAR);
    doc.registerFont("PTSans-Bold", FONT_BOLD);
    doc.font("PTSans");
    return { doc, pdfReady };
  }

  const fmtNum = (n: number | string | Prisma.Decimal) => Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: Date) => d.toLocaleDateString("ru-RU");

  function drawItemsTable(
    doc: PDFKit.PDFDocument,
    items: Array<{ description: string; quantity: number; price: unknown; total: unknown; order?: { orderNumber: string; toothFormula?: string | null; patient?: { lastName: string; firstName: string; patronymic?: string | null } | null } | null }>,
    detailed: boolean,
  ) {
    const LEFT = 40;
    const RIGHT = 555;
    const cols = { num: LEFT, desc: LEFT + 30, unit: 310, qty: 350, price: 400, total: 480 };

    // Header
    let y = doc.y;
    doc.font("PTSans-Bold").fontSize(8);
    doc.text("№", cols.num, y, { width: 25 });
    doc.text("Наименование работ (услуг)", cols.desc, y, { width: 270 });
    doc.text("Ед.", cols.unit, y, { width: 35 });
    doc.text("Кол-во", cols.qty, y, { width: 45 });
    doc.text("Цена, руб.", cols.price, y, { width: 70 });
    doc.text("Сумма, руб.", cols.total, y, { width: 75 });

    y += 14;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).stroke();
    y += 4;

    // Rows
    doc.font("PTSans").fontSize(8);
    items.forEach((item, i) => {
      let desc = item.description;
      if (detailed && item.order) {
        const patient = item.order.patient
          ? ` — ${item.order.patient.lastName} ${item.order.patient.firstName?.charAt(0) || ""}.${item.order.patient.patronymic ? item.order.patient.patronymic.charAt(0) + "." : ""}`
          : "";
        const tooth = item.order.toothFormula ? ` (${item.order.toothFormula})` : "";
        desc += `${patient}${tooth} [${item.order.orderNumber}]`;
      }

      if (y > 740) {
        doc.addPage();
        y = 40;
      }

      doc.text(`${i + 1}`, cols.num, y, { width: 25 });
      doc.text(desc, cols.desc, y, { width: 270 });
      doc.text("усл.", cols.unit, y, { width: 35 });
      doc.text(`${item.quantity}`, cols.qty, y, { width: 45 });
      doc.text(fmtNum(Number(item.price)), cols.price, y, { width: 70, align: "right" });
      doc.text(fmtNum(Number(item.total)), cols.total, y, { width: 75, align: "right" });
      y += 16;
    });

    // Bottom line
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).stroke();
    doc.y = y + 4;
  }

  app.get("/invoices/:id/pdf", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { variant } = request.query as { variant?: string };
    const { invoice, requisites, org } = await loadInvoiceForPdf(id, request.user.organizationId);
    const isDetailed = (variant || invoice.variant) !== "SIMPLIFIED";

    const { doc, pdfReady } = createPdfDoc();
    const LEFT = 40;
    const RIGHT = 555;

    if (requisites) {
      doc.font("PTSans").fontSize(8);

      const bankTop = 40;
      doc.rect(LEFT, bankTop, RIGHT - LEFT, 60).lineWidth(0.5).stroke();
      doc.moveTo(LEFT + 260, bankTop).lineTo(LEFT + 260, bankTop + 60).stroke();
      doc.moveTo(LEFT, bankTop + 30).lineTo(RIGHT, bankTop + 30).stroke();

      doc.text(`БИК  ${requisites.bik || ""}`, LEFT + 265, bankTop + 4, { width: 240 });
      doc.text(`Банк получателя: ${requisites.bankName || ""}`, LEFT + 4, bankTop + 4, { width: 250 });
      doc.text(`К/с  ${requisites.correspondentAccount || ""}`, LEFT + 265, bankTop + 34, { width: 240 });
      doc.text(`Р/с  ${requisites.settlementAccount || ""}`, LEFT + 4, bankTop + 34, { width: 250 });

      const recTop = bankTop + 65;
      doc.rect(LEFT, recTop, RIGHT - LEFT, 40).lineWidth(0.5).stroke();
      doc.moveTo(LEFT + 260, recTop).lineTo(LEFT + 260, recTop + 40).stroke();
      doc.moveTo(LEFT, recTop + 20).lineTo(LEFT + 260, recTop + 20).stroke();

      doc.text(`ИНН ${requisites.inn || ""}`, LEFT + 4, recTop + 4, { width: 120 });
      doc.text(`КПП ${requisites.kpp || ""}`, LEFT + 130, recTop + 4, { width: 120 });
      doc.text(`Получатель: ${requisites.name || org?.name || ""}`, LEFT + 4, recTop + 24, { width: 250 });
      doc.text(`Сч. №  ${requisites.settlementAccount || ""}`, LEFT + 265, recTop + 12, { width: 240 });

      doc.y = recTop + 50;
    }

    doc.moveDown(0.5);
    doc.font("PTSans-Bold").fontSize(14);
    doc.text(`Счёт на оплату № ${invoice.number} от ${fmtDate(invoice.date)}`, { align: "center" });
    doc.moveDown(0.3);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.5);

    doc.font("PTSans").fontSize(9);
    if (requisites) {
      doc.font("PTSans-Bold").text("Поставщик: ", { continued: true });
      doc.font("PTSans").text(`${requisites.name || org?.name || ""}, ИНН ${requisites.inn || "—"}, КПП ${requisites.kpp || "—"}, ${requisites.legalAddress || requisites.physicalAddress || ""}`);
    } else {
      doc.font("PTSans-Bold").text("Поставщик: ", { continued: true });
      doc.font("PTSans").text(org?.name || "Зуботехническая лаборатория");
    }
    doc.moveDown(0.3);

    doc.font("PTSans-Bold").text("Покупатель: ", { continued: true });
    const clientInfo = [
      invoice.client.legalEntityName || invoice.client.name,
      invoice.client.inn ? `ИНН ${invoice.client.inn}` : null,
      invoice.client.kpp ? `КПП ${invoice.client.kpp}` : null,
      invoice.client.legalAddress || invoice.client.address,
    ].filter(Boolean).join(", ");
    doc.font("PTSans").text(clientInfo);

    if (invoice.contractReference) {
      doc.moveDown(0.2);
      doc.font("PTSans-Bold").text("Основание: ", { continued: true });
      doc.font("PTSans").text(invoice.contractReference);
    }
    if (invoice.billingPeriod) {
      doc.font("PTSans-Bold").text("Период: ", { continued: true });
      doc.font("PTSans").text(invoice.billingPeriod);
    }

    doc.moveDown(0.5);

    drawItemsTable(doc, invoice.items as typeof invoice.items, isDetailed);

    const totalNum = Number(invoice.total);
    doc.moveDown(0.3);
    doc.font("PTSans-Bold").fontSize(10);
    doc.text(`Итого: ${fmtNum(totalNum)} руб.`, { align: "right" });
    doc.moveDown(0.2);
    doc.text(`Без налога (НДС)`, { align: "right" });
    doc.moveDown(0.2);
    doc.text(`Всего к оплате: ${fmtNum(totalNum)} руб.`, { align: "right" });

    doc.moveDown(0.5);
    doc.font("PTSans").fontSize(9);
    doc.text(`Всего наименований ${invoice.items.length}, на сумму ${fmtNum(totalNum)} руб.`);
    doc.font("PTSans-Bold").text(amountInWords(totalNum));

    if (invoice.dueDate) {
      doc.moveDown(0.5);
      doc.font("PTSans").fontSize(9);
      doc.text(`Оплатить до: ${fmtDate(invoice.dueDate)}`);
    }

    if (invoice.notes) {
      doc.moveDown(0.3);
      doc.font("PTSans").fontSize(8).text(`Примечание: ${invoice.notes}`);
    }

    doc.moveDown(1.5);
    const sigY = doc.y;
    doc.font("PTSans").fontSize(9);
    doc.text("Руководитель", LEFT, sigY);
    doc.moveTo(LEFT + 80, sigY + 12).lineTo(LEFT + 230, sigY + 12).lineWidth(0.3).stroke();
    if (requisites?.signatoryName) {
      doc.text(requisites.signatoryName, LEFT + 240, sigY);
    }

    doc.moveDown(1);
    const sigY2 = doc.y;
    doc.text("Бухгалтер", LEFT, sigY2);
    doc.moveTo(LEFT + 80, sigY2 + 12).lineTo(LEFT + 230, sigY2 + 12).lineWidth(0.3).stroke();

    doc.moveDown(1);
    doc.fontSize(7).text("М.П.", LEFT);

    doc.end();
    const pdfBuffer = await pdfReady;

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="invoice-${invoice.number}.pdf"`);
    return reply.send(pdfBuffer);
  });

  app.get("/invoices/:id/act-pdf", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { variant } = request.query as { variant?: string };
    const { invoice, requisites, org } = await loadInvoiceForPdf(id, request.user.organizationId);
    const isDetailed = (variant || invoice.variant) !== "SIMPLIFIED";

    const { doc, pdfReady } = createPdfDoc();
    const LEFT = 40;
    const RIGHT = 555;

    const executorName = requisites?.name || org?.name || "Зуботехническая лаборатория";
    const clientLegalName = invoice.client.legalEntityName || invoice.client.name;

    doc.font("PTSans-Bold").fontSize(14);
    doc.text("АКТ", { align: "center" });
    doc.fontSize(11).text(`сдачи-приёмки выполненных работ`, { align: "center" });
    doc.moveDown(0.3);
    doc.font("PTSans").fontSize(10);
    doc.text(`к счёту № ${invoice.number} от ${fmtDate(invoice.date)}`, { align: "center" });
    if (invoice.contractReference) {
      doc.text(`по ${invoice.contractReference}`, { align: "center" });
    }
    doc.moveDown(0.5);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.5).stroke();
    doc.moveDown(0.5);

    doc.font("PTSans").fontSize(9);
    doc.font("PTSans-Bold").text("Исполнитель: ", { continued: true });
    doc.font("PTSans").text(executorName);
    if (requisites?.inn) doc.text(`ИНН ${requisites.inn}${requisites.kpp ? `, КПП ${requisites.kpp}` : ""}`);
    if (requisites?.legalAddress) doc.text(`Адрес: ${requisites.legalAddress}`);
    doc.moveDown(0.3);

    doc.font("PTSans-Bold").text("Заказчик: ", { continued: true });
    doc.font("PTSans").text(clientLegalName);
    if (invoice.client.inn) doc.text(`ИНН ${invoice.client.inn}${invoice.client.kpp ? `, КПП ${invoice.client.kpp}` : ""}`);
    if (invoice.client.legalAddress || invoice.client.address) {
      doc.text(`Адрес: ${invoice.client.legalAddress || invoice.client.address}`);
    }

    doc.moveDown(0.5);
    doc.font("PTSans").fontSize(9);
    doc.text("Исполнитель выполнил, а Заказчик принял следующие работы (услуги):");
    if (invoice.billingPeriod) {
      doc.text(`Период: ${invoice.billingPeriod}`);
    }
    doc.moveDown(0.5);

    drawItemsTable(doc, invoice.items as typeof invoice.items, isDetailed);

    const totalNum = Number(invoice.total);
    doc.moveDown(0.3);
    doc.font("PTSans-Bold").fontSize(10);
    doc.text(`Итого: ${fmtNum(totalNum)} руб.`, { align: "right" });
    doc.text("Без налога (НДС)", { align: "right" });

    doc.moveDown(0.3);
    doc.font("PTSans").fontSize(9);
    doc.text(`Всего оказано услуг на сумму: ${amountInWords(totalNum)}`);

    doc.moveDown(0.5);
    doc.text("Вышеперечисленные работы (услуги) выполнены полностью и в срок.");
    doc.text("Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.");

    doc.moveDown(1.5);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(0.3).stroke();
    doc.moveDown(0.5);

    const sigBase = doc.y;
    doc.font("PTSans-Bold").fontSize(9);
    doc.text("ИСПОЛНИТЕЛЬ:", LEFT, sigBase);
    doc.moveDown(0.3);
    doc.font("PTSans").fontSize(8);
    if (requisites?.signatoryPosition) doc.text(requisites.signatoryPosition, LEFT);
    doc.moveDown(1.5);
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + 200, doc.y).lineWidth(0.3).stroke();
    const execSigY = doc.y;
    doc.moveDown(0.2);
    doc.text(`/${requisites?.signatoryName || ""}/ `, LEFT);

    doc.font("PTSans-Bold").fontSize(9);
    doc.text("ЗАКАЗЧИК:", 310, sigBase);
    doc.font("PTSans").fontSize(8);
    if (invoice.client.signatoryPosition) doc.text(invoice.client.signatoryPosition, 310, sigBase + 15);
    doc.moveTo(310, execSigY).lineTo(510, execSigY).lineWidth(0.3).stroke();
    doc.text(`/${invoice.client.signatoryName || ""}/`, 310, execSigY + 3);

    doc.moveDown(1);
    doc.fontSize(7).text("М.П.", LEFT, doc.y);
    doc.text("М.П.", 310, doc.y);

    doc.end();
    const pdfBuffer = await pdfReady;

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="act-${invoice.number}.pdf"`);
    return reply.send(pdfBuffer);
  });

  app.get("/invoices/:id/torg12-pdf", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { invoice, requisites, org } = await loadInvoiceForPdf(id, request.user.organizationId);

    const { doc, pdfReady } = createPdfDoc();
    const LEFT = 40;
    const RIGHT = 555;

    const executorName = requisites?.name || org?.name || "Зуботехническая лаборатория";
    const clientLegalName = invoice.client.legalEntityName || invoice.client.name;

    doc.font("PTSans").fontSize(7);
    doc.text("Унифицированная форма № ТОРГ-12", { align: "right" });
    doc.text("Утверждена постановлением Госкомстата России от 25.12.98 № 132", { align: "right" });
    doc.moveDown(0.5);

    doc.font("PTSans-Bold").fontSize(8);
    const headerY = doc.y;
    doc.text(`Грузоотправитель: ${executorName}`, LEFT, headerY, { width: 400 });
    if (requisites?.legalAddress) {
      doc.text(`${requisites.legalAddress}`, LEFT);
    }
    doc.moveDown(0.3);
    doc.text(`Грузополучатель: ${clientLegalName}`, LEFT, doc.y, { width: 400 });
    if (invoice.client.legalAddress || invoice.client.address) {
      doc.font("PTSans").text(`${invoice.client.legalAddress || invoice.client.address}`, LEFT);
    }
    doc.moveDown(0.3);
    doc.font("PTSans-Bold").text(`Поставщик: ${executorName}`, LEFT, doc.y, { width: 400 });
    doc.font("PTSans");
    if (requisites?.inn) doc.text(`ИНН/КПП ${requisites.inn}/${requisites.kpp || ""}`, LEFT);
    doc.moveDown(0.3);
    doc.font("PTSans-Bold").text(`Плательщик: ${clientLegalName}`, LEFT, doc.y, { width: 400 });
    doc.font("PTSans");
    if (invoice.client.inn) doc.text(`ИНН/КПП ${invoice.client.inn}/${invoice.client.kpp || ""}`, LEFT);
    if (invoice.contractReference) {
      doc.moveDown(0.2);
      doc.text(`Основание: ${invoice.contractReference}`, LEFT);
    }

    doc.moveDown(0.5);

    doc.font("PTSans-Bold").fontSize(12);
    doc.text("ТОВАРНАЯ НАКЛАДНАЯ", { align: "center" });
    doc.fontSize(9).font("PTSans");
    doc.text(`№ ${invoice.number} от ${fmtDate(invoice.date)}`, { align: "center" });
    doc.moveDown(0.5);

    const cols = { num: LEFT, desc: LEFT + 25, unit: 290, qty: 340, price: 400, total: 480 };
    let y = doc.y;

    doc.font("PTSans-Bold").fontSize(7);
    doc.text("№", cols.num, y, { width: 20 });
    doc.text("Наименование товара (работ, услуг)", cols.desc, y, { width: 255 });
    doc.text("Ед. изм.", cols.unit, y, { width: 45 });
    doc.text("Кол-во", cols.qty, y, { width: 55 });
    doc.text("Цена, руб.", cols.price, y, { width: 70, align: "right" });
    doc.text("Сумма, руб.", cols.total, y, { width: 75, align: "right" });

    y += 12;
    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).stroke();
    y += 4;

    doc.font("PTSans").fontSize(8);
    invoice.items.forEach((item, i) => {
      if (y > 720) { doc.addPage(); y = 40; }
      doc.text(`${i + 1}`, cols.num, y, { width: 20 });
      doc.text(item.description, cols.desc, y, { width: 255 });
      doc.text("усл.", cols.unit, y, { width: 45 });
      doc.text(`${item.quantity}`, cols.qty, y, { width: 55 });
      doc.text(fmtNum(Number(item.price)), cols.price, y, { width: 70, align: "right" });
      doc.text(fmtNum(Number(item.total)), cols.total, y, { width: 75, align: "right" });
      y += 15;
    });

    doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.5).stroke();
    y += 6;

    const totalNum = Number(invoice.total);
    doc.font("PTSans-Bold").fontSize(9);
    doc.text(`Итого: ${invoice.items.length} наименований на сумму ${fmtNum(totalNum)} руб.`, LEFT, y);
    y += 16;
    doc.font("PTSans").fontSize(8);
    doc.text(amountInWords(totalNum), LEFT, y);
    y += 20;

    doc.y = y;
    doc.moveDown(0.5);
    const sigBlock = doc.y;

    doc.font("PTSans-Bold").fontSize(8);
    doc.text("Отпуск груза разрешил", LEFT, sigBlock);
    doc.font("PTSans").fontSize(7);
    doc.moveDown(0.5);
    doc.text(`${requisites?.signatoryPosition || "Руководитель"}`, LEFT);
    doc.moveTo(LEFT + 120, doc.y + 2).lineTo(LEFT + 240, doc.y + 2).lineWidth(0.3).stroke();
    doc.text(`/${requisites?.signatoryName || ""}/`, LEFT + 245);

    doc.moveDown(1);
    doc.font("PTSans-Bold").fontSize(8).text("Груз принял", LEFT);
    doc.font("PTSans").fontSize(7);
    doc.moveDown(0.5);
    doc.text(`${invoice.client.signatoryPosition || "Руководитель"}`, LEFT);
    doc.moveTo(LEFT + 120, doc.y + 2).lineTo(LEFT + 240, doc.y + 2).lineWidth(0.3).stroke();
    doc.text(`/${invoice.client.signatoryName || ""}/`, LEFT + 245);

    doc.moveDown(1);
    doc.font("PTSans-Bold").fontSize(8).text("Груз получил грузополучатель", LEFT);
    doc.font("PTSans").fontSize(7);
    doc.moveDown(0.5);
    doc.moveTo(LEFT + 160, doc.y + 2).lineTo(LEFT + 280, doc.y + 2).lineWidth(0.3).stroke();

    doc.moveDown(1);
    doc.fontSize(7).text("М.П.", LEFT);
    doc.text("М.П.", 310);

    doc.end();
    const pdfBuffer = await pdfReady;

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="torg12-${invoice.number}.pdf"`);
    return reply.send(pdfBuffer);
  });

  app.get("/invoices/:id/bundle-pdf", {
    preHandler: [authorize("OWNER", "ADMIN", "ACCOUNTANT")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { variant } = request.query as { variant?: string };
    const { invoice, requisites, org } = await loadInvoiceForPdf(id, request.user.organizationId);

    const isDetailed = (variant || invoice.variant) !== "SIMPLIFIED";
    const { doc, pdfReady } = createPdfDoc();
    const LEFT = 40;
    const RIGHT = 555;
    const executorName = requisites?.name || org?.name || "Зуботехническая лаборатория";
    const clientLegalName = invoice.client.legalEntityName || invoice.client.name;
    const totalNum = Number(invoice.total);

    if (requisites) {
      doc.font("PTSans").fontSize(8);
      const bankTop = 40;
      doc.rect(LEFT, bankTop, RIGHT - LEFT, 60).lineWidth(0.5).stroke();
      doc.moveTo(LEFT + 260, bankTop).lineTo(LEFT + 260, bankTop + 60).stroke();
      doc.moveTo(LEFT, bankTop + 30).lineTo(RIGHT, bankTop + 30).stroke();
      doc.text(`БИК  ${requisites.bik || ""}`, LEFT + 265, bankTop + 4, { width: 240 });
      doc.text(`Банк получателя: ${requisites.bankName || ""}`, LEFT + 4, bankTop + 4, { width: 250 });
      doc.text(`К/с  ${requisites.correspondentAccount || ""}`, LEFT + 265, bankTop + 34, { width: 240 });
      doc.text(`Р/с  ${requisites.settlementAccount || ""}`, LEFT + 4, bankTop + 34, { width: 250 });

      const recTop = bankTop + 65;
      doc.rect(LEFT, recTop, RIGHT - LEFT, 40).lineWidth(0.5).stroke();
      doc.moveTo(LEFT + 260, recTop).lineTo(LEFT + 260, recTop + 40).stroke();
      doc.moveTo(LEFT, recTop + 20).lineTo(LEFT + 260, recTop + 20).stroke();
      doc.text(`ИНН ${requisites.inn || ""}`, LEFT + 4, recTop + 4);
      doc.text(`КПП ${requisites.kpp || ""}`, LEFT + 130, recTop + 4);
      doc.text(`Получатель: ${requisites.name || org?.name || ""}`, LEFT + 4, recTop + 24, { width: 250 });
      doc.text(`Сч. №  ${requisites.settlementAccount || ""}`, LEFT + 265, recTop + 12, { width: 240 });
      doc.y = recTop + 50;
    }

    doc.moveDown(0.5);
    doc.font("PTSans-Bold").fontSize(14).text(`Счёт на оплату № ${invoice.number} от ${fmtDate(invoice.date)}`, { align: "center" });
    doc.moveDown(0.3);
    doc.moveTo(LEFT, doc.y).lineTo(RIGHT, doc.y).lineWidth(1.5).stroke();
    doc.moveDown(0.5);

    doc.font("PTSans").fontSize(9);
    doc.font("PTSans-Bold").text("Поставщик: ", { continued: true });
    doc.font("PTSans").text(executorName);
    doc.moveDown(0.2);
    doc.font("PTSans-Bold").text("Покупатель: ", { continued: true });
    doc.font("PTSans").text(clientLegalName);
    doc.moveDown(0.5);

    drawItemsTable(doc, invoice.items as typeof invoice.items, isDetailed);
    doc.moveDown(0.3);
    doc.font("PTSans-Bold").fontSize(10).text(`Итого: ${fmtNum(totalNum)} руб.  Без налога (НДС)`, { align: "right" });
    doc.moveDown(0.3);
    doc.font("PTSans-Bold").fontSize(9).text(amountInWords(totalNum));

    doc.addPage();
    doc.font("PTSans-Bold").fontSize(14).text("АКТ", { align: "center" });
    doc.fontSize(11).text("сдачи-приёмки выполненных работ", { align: "center" });
    doc.moveDown(0.3);
    doc.font("PTSans").fontSize(10).text(`к счёту № ${invoice.number} от ${fmtDate(invoice.date)}`, { align: "center" });
    doc.moveDown(0.5);

    doc.font("PTSans").fontSize(9);
    doc.font("PTSans-Bold").text("Исполнитель: ", { continued: true });
    doc.font("PTSans").text(executorName);
    doc.moveDown(0.2);
    doc.font("PTSans-Bold").text("Заказчик: ", { continued: true });
    doc.font("PTSans").text(clientLegalName);
    doc.moveDown(0.5);
    doc.text("Исполнитель выполнил, а Заказчик принял следующие работы (услуги):");
    doc.moveDown(0.5);

    drawItemsTable(doc, invoice.items as typeof invoice.items, isDetailed);
    doc.moveDown(0.3);
    doc.font("PTSans-Bold").fontSize(10).text(`Итого: ${fmtNum(totalNum)} руб.  Без налога (НДС)`, { align: "right" });
    doc.moveDown(0.3);
    doc.font("PTSans").fontSize(9).text(`Всего оказано услуг на сумму: ${amountInWords(totalNum)}`);
    doc.moveDown(0.5);
    doc.text("Вышеперечисленные работы (услуги) выполнены полностью и в срок.");
    doc.text("Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.");

    doc.moveDown(2);
    const bSigY = doc.y;
    doc.font("PTSans-Bold").fontSize(9);
    doc.text("ИСПОЛНИТЕЛЬ:", LEFT, bSigY);
    doc.text("ЗАКАЗЧИК:", 310, bSigY);
    doc.moveDown(1.5);
    doc.moveTo(LEFT, doc.y).lineTo(LEFT + 200, doc.y).lineWidth(0.3).stroke();
    doc.moveTo(310, doc.y).lineTo(510, doc.y).lineWidth(0.3).stroke();
    doc.moveDown(0.3);
    doc.font("PTSans").fontSize(8);
    doc.text(`/${requisites?.signatoryName || ""}/`, LEFT);
    doc.text(`/${invoice.client.signatoryName || ""}/`, 310, doc.y - 10);

    doc.end();
    const pdfBuffer = await pdfReady;

    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `inline; filename="bundle-${invoice.number}.pdf"`);
    return reply.send(pdfBuffer);
  });
}
