import { FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError, ForbiddenError } from "../lib/errors.js";
import { UserRole } from "@prisma/client";

export interface JwtPayload {
  id: string;
  organizationId: string;
  role: UserRole;
  email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    user: JwtPayload;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const decoded = await request.jwtVerify<JwtPayload>();
    request.user = decoded;
  } catch (err) {
    throw new UnauthorizedError("Невалидный или просроченный токен");
  }
}

export function authorize(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (roles.length > 0 && !roles.includes(request.user.role)) {
      throw new ForbiddenError(`Требуется роль: ${roles.join(", ")}`);
    }
  };
}

// Проверка что пользователь работает в своей организации
export function orgGuard(orgIdFromParam: string, user: JwtPayload): void {
  if (orgIdFromParam !== user.organizationId && user.role !== "OWNER") {
    throw new ForbiddenError("Нет доступа к данным другой организации");
  }
}
