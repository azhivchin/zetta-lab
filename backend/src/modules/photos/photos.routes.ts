import { FastifyInstance } from "fastify";
import prisma from "../../lib/prisma.js";
import { authenticate } from "../../middleware/auth.js";
import { ValidationError, NotFoundError } from "../../lib/errors.js";
import { pipeline } from "stream/promises";
import { createWriteStream, createReadStream, mkdirSync, existsSync, unlinkSync } from "fs";
import { join, extname } from "path";
import { randomUUID } from "crypto";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".bmp": "image/bmp", ".heic": "image/heic",
};

const UPLOAD_DIR = join(process.cwd(), "uploads", "photos");

// Ensure upload directory exists
if (!existsSync(UPLOAD_DIR)) {
  mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function photosRoutes(app: FastifyInstance) {
  // NOTE: No global auth hook — file serving must be public for <img> tags

  app.post("/upload/:orderId", { preHandler: [authenticate] }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };

    // Verify order belongs to user's org
    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: request.user.organizationId },
    });
    if (!order) throw new NotFoundError("Наряд");

    const parts = request.parts();
    const savedPhotos = [];
    let caption = "";
    let stage = "";

    for await (const part of parts) {
      if (part.type === "field") {
        if (part.fieldname === "caption") caption = part.value as string;
        if (part.fieldname === "stage") stage = part.value as string;
        continue;
      }

      // It's a file
      if (!part.mimetype.startsWith("image/")) {
        throw new ValidationError("Допускаются только изображения (jpg, png, webp)");
      }

      const ext = extname(part.filename) || ".jpg";
      const newFilename = `${randomUUID()}${ext}`;
      const filepath = join(UPLOAD_DIR, newFilename);

      await pipeline(part.file, createWriteStream(filepath));

      const photo = await prisma.orderPhoto.create({
        data: {
          orderId,
          url: `/api/photos/file/${newFilename}`,
          filename: part.filename,
          caption: caption || null,
          stage: stage || null,
        },
      });

      savedPhotos.push(photo);
    }

    if (savedPhotos.length === 0) {
      throw new ValidationError("Файл не загружен");
    }

    reply.status(201).send({ success: true, data: savedPhotos });
  });

  app.get("/file/:filename", async (request, reply) => {
    const { filename } = request.params as { filename: string };

    // Prevent path traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return reply.status(400).send({ success: false, error: "Invalid filename" });
    }

    const filepath = join(UPLOAD_DIR, filename);
    if (!existsSync(filepath)) {
      return reply.status(404).send({ success: false, error: "File not found" });
    }

    const ext = extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    const stream = createReadStream(filepath);
    reply.header("Content-Type", contentType);
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(stream);
  });

  app.get("/order/:orderId", { preHandler: [authenticate] }, async (request, reply) => {
    const { orderId } = request.params as { orderId: string };

    const order = await prisma.order.findFirst({
      where: { id: orderId, organizationId: request.user.organizationId },
    });
    if (!order) throw new NotFoundError("Наряд");

    const photos = await prisma.orderPhoto.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });

    reply.send({ success: true, data: photos });
  });

  app.patch("/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { caption, stage } = request.body as { caption?: string; stage?: string };

    const photo = await prisma.orderPhoto.findUnique({
      where: { id },
      include: { order: { select: { organizationId: true } } },
    });
    if (!photo || photo.order.organizationId !== request.user.organizationId) {
      throw new NotFoundError("Фото");
    }

    const updated = await prisma.orderPhoto.update({
      where: { id },
      data: {
        ...(caption !== undefined ? { caption } : {}),
        ...(stage !== undefined ? { stage } : {}),
      },
    });

    reply.send({ success: true, data: updated });
  });

  app.delete("/:id", { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const photo = await prisma.orderPhoto.findUnique({
      where: { id },
      include: { order: { select: { organizationId: true } } },
    });
    if (!photo || photo.order.organizationId !== request.user.organizationId) {
      throw new NotFoundError("Фото");
    }

    // Delete physical file
    const filename = photo.url.split("/").pop();
    if (filename) {
      const filepath = join(UPLOAD_DIR, filename);
      try { unlinkSync(filepath); } catch { /* file might not exist */ }
    }

    await prisma.orderPhoto.delete({ where: { id } });

    reply.send({ success: true, data: { deleted: true } });
  });

  app.get("/gallery", { preHandler: [authenticate] }, async (request, reply) => {
    const { clientId, page = "1", limit = "20" } = request.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {
      order: { organizationId: request.user.organizationId },
    };
    if (clientId) {
      (where.order as Record<string, unknown>).clientId = clientId;
    }

    const [photos, total] = await Promise.all([
      prisma.orderPhoto.findMany({
        where: where as any,
        orderBy: { createdAt: "desc" },
        skip,
        take: parseInt(limit),
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              client: { select: { name: true, shortName: true } },
            },
          },
        },
      }),
      prisma.orderPhoto.count({ where: where as any }),
    ]);

    reply.send({
      success: true,
      data: { photos, pagination: { page: parseInt(page), limit: parseInt(limit), total } },
    });
  });
}
