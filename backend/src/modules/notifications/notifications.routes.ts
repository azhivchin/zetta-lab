import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.js";
import { NotFoundError } from "../../lib/errors.js";

// Telegram bot integration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(chatId: string, text: string): Promise<boolean> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return false;
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Create notification and optionally send via Telegram
export async function createNotification(params: {
  organizationId: string;
  userId?: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
}) {
  const notification = await prisma.notification.create({
    data: {
      organizationId: params.organizationId,
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      data: params.data || {},
    },
  });

  // Send Telegram if user has telegramId
  if (params.userId) {
    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: { telegramId: true },
    });
    if (user?.telegramId) {
      await sendTelegramMessage(user.telegramId, `<b>${params.title}</b>\n\n${params.message}`);
    }
  }

  return notification;
}

// Broadcast to all users in org with a specific role (or all)
export async function broadcastNotification(params: {
  organizationId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  roles?: string[];
}) {
  const where: Record<string, unknown> = {
    organizationId: params.organizationId,
    isActive: true,
  };
  if (params.roles && params.roles.length > 0) {
    where.role = { in: params.roles };
  }

  const users = await prisma.user.findMany({
    where: where as any,
    select: { id: true, telegramId: true },
  });

  for (const user of users) {
    await prisma.notification.create({
      data: {
        organizationId: params.organizationId,
        userId: user.id,
        type: params.type,
        title: params.title,
        message: params.message,
        data: params.data || {},
      },
    });

    if (user.telegramId) {
      await sendTelegramMessage(user.telegramId, `<b>${params.title}</b>\n\n${params.message}`);
    }
  }
}

export async function notificationsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/", async (request, reply) => {
    const { page = "1", limit = "20", unreadOnly } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {
      organizationId: request.user.organizationId,
      OR: [
        { userId: request.user.id },
        { userId: null }, // Broadcast notifications
      ],
    };
    if (unreadOnly === "true") {
      where.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
      }),
      prisma.notification.count({ where: where as any }),
      prisma.notification.count({
        where: {
          ...where,
          isRead: false,
        } as any,
      }),
    ]);

    reply.send({
      success: true,
      data: {
        notifications,
        unreadCount,
        pagination: { page: parseInt(page), limit: parseInt(limit), total },
      },
    });
  });

  app.patch("/:id/read", async (request, reply) => {
    const { id } = request.params as { id: string };

    const notification = await prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.organizationId !== request.user.organizationId) {
      throw new NotFoundError("Уведомление");
    }

    const updated = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    reply.send({ success: true, data: updated });
  });

  app.patch("/read-all", async (request, reply) => {
    await prisma.notification.updateMany({
      where: {
        organizationId: request.user.organizationId,
        OR: [
          { userId: request.user.id },
          { userId: null },
        ],
        isRead: false,
      },
      data: { isRead: true },
    });

    reply.send({ success: true, data: { updated: true } });
  });

  app.post("/test-telegram", async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      select: { telegramId: true, firstName: true },
    });

    if (!user?.telegramId) {
      return reply.status(400).send({
        success: false,
        error: { message: "Telegram ID не привязан к аккаунту. Укажите его в настройках профиля." },
      });
    }

    const sent = await sendTelegramMessage(
      user.telegramId,
      `✅ Тестовое уведомление\n\nПривет, ${user.firstName}! Уведомления Zetta Lab работают.`
    );

    reply.send({
      success: true,
      data: { sent, telegramId: user.telegramId },
    });
  });

  app.post("/link-telegram", async (request, reply) => {
    const { telegramId } = request.body as { telegramId: string };

    if (!telegramId?.trim()) {
      return reply.status(400).send({
        success: false,
        error: { message: "Укажите Telegram ID" },
      });
    }

    await prisma.user.update({
      where: { id: request.user.id },
      data: { telegramId: telegramId.trim() },
    });

    // Send welcome message
    await sendTelegramMessage(
      telegramId.trim(),
      "🔔 Zetta Lab — уведомления подключены!\n\nВы будете получать оповещения о новых нарядах, изменениях статусов и просрочках."
    );

    reply.send({ success: true, data: { linked: true } });
  });
}
