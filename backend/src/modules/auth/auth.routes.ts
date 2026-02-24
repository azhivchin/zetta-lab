import { FastifyInstance } from "fastify";
import { authService } from "./auth.service.js";
import { registerSchema, loginSchema, refreshSchema, createUserSchema } from "./auth.schema.js";
import { authenticate, authorize } from "../../middleware/auth.js";
import { ValidationError } from "../../lib/errors.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const result = await authService.register(parsed.data);
    const tokens = await authService.login(
      { email: parsed.data.email, password: parsed.data.password },
      (payload, opts) => app.jwt.sign(payload, opts)
    );

    reply.status(201).send({
      success: true,
      data: tokens,
    });
  });

  app.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const result = await authService.login(
      parsed.data,
      (payload, opts) => app.jwt.sign(payload, opts)
    );

    reply.send({ success: true, data: result });
  });

  app.post("/refresh", async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError("Невалидный refresh token");
    }

    const result = await authService.refresh(
      parsed.data.refreshToken,
      (payload, opts) => app.jwt.sign(payload, opts)
    );

    reply.send({ success: true, data: result });
  });

  app.post("/logout", { preHandler: [authenticate] }, async (request, reply) => {
    const body = request.body as { refreshToken?: string };
    await authService.logout(request.user.id, body?.refreshToken);
    reply.send({ success: true, message: "Вы вышли из системы" });
  });

  app.get("/me", { preHandler: [authenticate] }, async (request, reply) => {
    const { prisma } = await import("../../lib/prisma.js");
    const user = await prisma.user.findUnique({
      where: { id: request.user.id },
      include: { organization: true },
      omit: { passwordHash: true },
    });

    reply.send({ success: true, data: user });
  });

  app.post("/users", {
    preHandler: [authorize("OWNER", "ADMIN")],
  }, async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.errors.map(e => e.message).join(", "));
    }

    const user = await authService.createUser(request.user.organizationId, parsed.data);
    reply.status(201).send({ success: true, data: user });
  });
}
