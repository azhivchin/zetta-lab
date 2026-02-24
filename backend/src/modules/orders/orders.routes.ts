import { FastifyInstance } from "fastify";
import { ordersService } from "./orders.service.js";
import { createOrderSchema, updateOrderSchema, orderFilterSchema, assignStageSchema, updateStageSchema, updateItemsSchema } from "./orders.schema.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import prisma from "../../lib/prisma.js";
import PDFDocument from "pdfkit";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(__dirname, "..", "..", "..", "fonts");
const FONT_REGULAR = path.join(FONT_DIR, "PTSans-Regular.ttf");
const FONT_BOLD = path.join(FONT_DIR, "PTSans-Bold.ttf");

export async function ordersRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/", async (request, reply) => {
    const filters = orderFilterSchema.parse(request.query);
    const result = await ordersService.findAll(request.user.organizationId, filters);
    reply.send({ success: true, data: result });
  });

  app.get("/kanban", async (request, reply) => {
    const result = await ordersService.getKanban(request.user.organizationId);
    reply.send({ success: true, data: result });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = await ordersService.findById(request.user.organizationId, id);
    reply.send({ success: true, data: order });
  });

  app.post("/", async (request, reply) => {
    const parsed = createOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }
    const order = await ordersService.create(
      request.user.organizationId,
      request.user.id,
      parsed.data
    );
    reply.status(201).send({ success: true, data: order });
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }
    const order = await ordersService.update(
      request.user.organizationId, id, request.user.id, parsed.data
    );
    reply.send({ success: true, data: order });
  });

  app.put("/:orderId/stages/:stageId/assign", async (request, reply) => {
    const { stageId } = request.params as { orderId: string; stageId: string };
    const parsed = assignStageSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }
    const stage = await ordersService.assignStage(
      request.user.organizationId, stageId, parsed.data.assigneeId, parsed.data.dueDate
    );
    reply.send({ success: true, data: stage });
  });

  app.patch("/:orderId/stages/:stageId", async (request, reply) => {
    const { stageId } = request.params as { orderId: string; stageId: string };
    const parsed = updateStageSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }
    const stage = await ordersService.updateStage(
      request.user.organizationId, stageId, request.user.id, parsed.data.status, parsed.data.notes
    );
    reply.send({ success: true, data: stage });
  });

  app.delete("/:id", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const order = await ordersService.softDelete(
      request.user.organizationId, id, request.user.id
    );
    reply.send({ success: true, data: order });
  });

  app.put("/:id/items", {
    preHandler: [authorize("OWNER", "ADMIN", "SENIOR_TECH")],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateItemsSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }
    const order = await ordersService.updateItems(
      request.user.organizationId, id, parsed.data.items
    );
    reply.send({ success: true, data: order });
  });

  app.get("/:id/print-pdf", async (request, reply) => {
    const { id } = request.params as { id: string };
    const orgId = request.user.organizationId;

    const order = await prisma.order.findFirst({
      where: { id, organizationId: orgId },
      include: {
        client: { select: { name: true, shortName: true, phone: true, address: true } },
        doctor: { select: { firstName: true, lastName: true, phone: true } },
        patient: { select: { firstName: true, lastName: true, patronymic: true, phone: true } },
        items: {
          include: { workItem: { select: { name: true, code: true, unit: true } } },
        },
        stages: {
          orderBy: { sortOrder: "asc" },
          include: { assignee: { select: { firstName: true, lastName: true } } },
        },
      },
    });
    if (!order) throw new NotFoundError("Наряд");

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on("end", () => resolve(Buffer.concat(chunks)));
    });

    try { doc.registerFont("PTSans", FONT_REGULAR); doc.registerFont("PTSans-Bold", FONT_BOLD); doc.font("PTSans"); } catch { /* fallback Helvetica */ }

    const fmtDate = (d: Date | null) => d ? new Date(d).toLocaleDateString("ru-RU") : "—";
    const fmtNum = (n: number | unknown) => Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Header
    doc.fontSize(18).font("PTSans-Bold").text(`Наряд-заказ № ${order.orderNumber}`, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(10).font("PTSans").text(`от ${fmtDate(order.receivedAt)}`, { align: "center" });
    doc.moveDown(1);

    // Info block
    const info = [
      ["Заказчик:", order.client.shortName || order.client.name],
      ["Врач:", order.doctor ? `${order.doctor.lastName} ${order.doctor.firstName}` : "—"],
      ["Тел. врача:", order.doctor?.phone || "—"],
      ["Пациент:", order.patient ? `${order.patient.lastName} ${order.patient.firstName} ${order.patient.patronymic || ""}`.trim() : "—"],
      ["Тел. пациента:", order.patient?.phone || "—"],
      ["Зубная формула:", order.toothFormula || "—"],
      ["Цвет:", order.color || "—"],
      ["Имплант:", order.implantSystem || "—"],
      ["Срок сдачи:", fmtDate(order.dueDate)],
      ["Срочный:", order.isUrgent ? "ДА" : "Нет"],
    ];

    for (const [label, val] of info) {
      doc.font("PTSans-Bold").text(label, 40, doc.y, { continued: true, width: 120 });
      doc.font("PTSans").text(` ${val}`);
    }

    doc.moveDown(1);

    // Items table
    doc.font("PTSans-Bold").fontSize(12).text("Позиции работ:");
    doc.moveDown(0.3);

    const tblY = doc.y;
    const cols = [40, 70, 310, 370, 430, 500];
    const headers = ["№", "Работа", "Кол-во", "Цена", "Итого"];

    doc.fontSize(9).font("PTSans-Bold");
    headers.forEach((h, i) => doc.text(h, cols[i], tblY, { width: cols[i + 1] ? cols[i + 1] - cols[i] : 55 }));
    doc.moveTo(40, tblY + 14).lineTo(555, tblY + 14).stroke();

    let y = tblY + 18;
    doc.font("PTSans").fontSize(9);
    let grandTotal = 0;

    order.items.forEach((item, idx) => {
      if (y > 750) { doc.addPage(); y = 40; }
      const total = Number(item.total);
      grandTotal += total;

      doc.text(String(idx + 1), cols[0], y, { width: 25 });
      doc.text(item.workItem?.name || "—", cols[1], y, { width: 235 });
      doc.text(String(item.quantity), cols[2], y, { width: 55 });
      doc.text(fmtNum(item.price), cols[3], y, { width: 65 });
      doc.text(fmtNum(total), cols[4], y, { width: 55 });
      y += 15;
    });

    doc.moveTo(40, y).lineTo(555, y).stroke();
    y += 5;
    doc.font("PTSans-Bold").text(`ИТОГО: ${fmtNum(grandTotal)} руб.`, 40, y, { align: "right", width: 515 });
    y += 20;

    if (Number(order.discountTotal) > 0) {
      doc.font("PTSans").text(`Скидка: ${fmtNum(order.discountTotal)} руб.`, 40, y, { align: "right", width: 515 });
      y += 15;
      doc.font("PTSans-Bold").text(`К оплате: ${fmtNum(order.totalPrice)} руб.`, 40, y, { align: "right", width: 515 });
      y += 20;
    }

    // Stages
    if (order.stages.length > 0) {
      doc.moveDown(1);
      doc.font("PTSans-Bold").fontSize(12).text("Этапы производства:");
      doc.moveDown(0.3);
      doc.font("PTSans").fontSize(9);

      for (const stage of order.stages) {
        const assignee = stage.assignee ? `${stage.assignee.lastName} ${stage.assignee.firstName}` : "не назначен";
        doc.text(`${stage.name} — ${assignee} (${stage.status})`, { indent: 10 });
      }
    }

    // Notes
    if (order.notes) {
      doc.moveDown(1);
      doc.font("PTSans-Bold").fontSize(10).text("Примечания:");
      doc.font("PTSans").fontSize(9).text(order.notes);
    }

    doc.end();
    const pdfBuffer = await pdfReady;

    reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="order-${order.orderNumber}.pdf"`)
      .send(pdfBuffer);
  });

  app.post("/:id/comments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { text } = request.body as { text: string };
    if (!text?.trim()) throw new ValidationError("Введите текст комментария");
    const comment = await ordersService.addComment(
      request.user.organizationId, id, request.user.id, text
    );
    reply.status(201).send({ success: true, data: comment });
  });
}
