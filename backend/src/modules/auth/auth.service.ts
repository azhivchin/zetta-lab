import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "../../lib/prisma.js";
import { Prisma } from "@prisma/client";
import redis from "../../lib/redis.js";
import { AppError, UnauthorizedError } from "../../lib/errors.js";
import type { RegisterInput, LoginInput, CreateUserInput } from "./auth.schema.js";

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 50) + "-" + crypto.randomBytes(3).toString("hex");
}

export class AuthService {
  async register(input: RegisterInput) {
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) {
      throw new AppError(409, "Пользователь с таким email уже существует");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);
    const slug = generateSlug(input.organizationName);

    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: input.phone,
          role: "OWNER",
        },
      });

      const categories = [
        { code: "1", name: "Цифровые работы", sortOrder: 1 },
        { code: "2", name: "Несъёмное протезирование", sortOrder: 2 },
        { code: "3", name: "Имплантология", sortOrder: 3 },
        { code: "4", name: "Сложное протезирование", sortOrder: 4 },
        { code: "5", name: "Съёмное протезирование", sortOrder: 5 },
        { code: "6", name: "Ремонт и перебазировка", sortOrder: 6 },
      ];

      for (const cat of categories) {
        await tx.workCategory.create({
          data: { organizationId: org.id, ...cat },
        });
      }

      const defaultReferences = [
        { type: "expense_category", code: "salary", name: "Зарплата", sortOrder: 1 },
        { type: "expense_category", code: "materials", name: "Материалы", sortOrder: 2 },
        { type: "expense_category", code: "rent", name: "Аренда", sortOrder: 3 },
        { type: "expense_category", code: "equipment", name: "Оборудование", sortOrder: 4 },
        { type: "expense_category", code: "logistics", name: "Логистика", sortOrder: 5 },
        { type: "expense_category", code: "utilities", name: "Коммунальные услуги", sortOrder: 6 },
        { type: "expense_category", code: "other", name: "Прочее", sortOrder: 7 },
        { type: "department", code: "cad", name: "CAD/CAM", sortOrder: 1 },
        { type: "department", code: "ceramic", name: "Керамика", sortOrder: 2 },
        { type: "department", code: "gypsum", name: "Гипсовочная", sortOrder: 3 },
        { type: "department", code: "assembly", name: "Сборка", sortOrder: 4 },
        { type: "department", code: "removable", name: "Съёмное", sortOrder: 5 },
        { type: "contract_type", code: "service", name: "Сервисный", sortOrder: 1 },
        { type: "contract_type", code: "subcontract", name: "Подряд", sortOrder: 2 },
        { type: "contract_type", code: "individual", name: "С физлицом", sortOrder: 3 },
        { type: "courier_direction", code: "north", name: "Север", sortOrder: 1 },
        { type: "courier_direction", code: "south", name: "Юг", sortOrder: 2 },
        { type: "courier_direction", code: "east", name: "Восток", sortOrder: 3 },
        { type: "courier_direction", code: "west", name: "Запад", sortOrder: 4 },
        { type: "courier_direction", code: "center", name: "Центр", sortOrder: 5 },
        { type: "rework_reason", code: "ceramic_chip", name: "Скол керамики", sortOrder: 1 },
        { type: "rework_reason", code: "fit_issue", name: "Проблема посадки", sortOrder: 2 },
        { type: "rework_reason", code: "color_mismatch", name: "Несоответствие цвета", sortOrder: 3 },
        { type: "rework_reason", code: "framework_defect", name: "Дефект каркаса", sortOrder: 4 },
        { type: "rework_reason", code: "cad_error", name: "Ошибка CAD", sortOrder: 5 },
        { type: "rework_reason", code: "impression_issue", name: "Проблема слепка", sortOrder: 6 },
        { type: "rework_reason", code: "other", name: "Прочее", sortOrder: 7 },
        { type: "payment_method", code: "cash", name: "Наличные", sortOrder: 1 },
        { type: "payment_method", code: "bank", name: "Безнал", sortOrder: 2 },
        { type: "payment_method", code: "card", name: "Карта", sortOrder: 3 },
        { type: "account_type", code: "cash", name: "Касса", sortOrder: 1 },
        { type: "account_type", code: "bank", name: "Расчётный счёт", sortOrder: 2 },
        { type: "account_type", code: "card", name: "Карта", sortOrder: 3 },
        { type: "account_type", code: "credit_card", name: "Кредитная карта", sortOrder: 4 },
        { type: "pl_category", code: "revenue", name: "Выручка", sortOrder: 1, metadata: { type: "income" } },
        { type: "pl_category", code: "salary", name: "Зарплата", sortOrder: 2, metadata: { type: "expense" } },
        { type: "pl_category", code: "materials", name: "Материалы", sortOrder: 3, metadata: { type: "expense" } },
        { type: "pl_category", code: "subcontract", name: "Субподряд", sortOrder: 4, metadata: { type: "expense" } },
        { type: "pl_category", code: "rent", name: "Аренда", sortOrder: 5, metadata: { type: "expense" } },
        { type: "pl_category", code: "equipment", name: "Оборудование", sortOrder: 6, metadata: { type: "expense" } },
        { type: "pl_category", code: "logistics", name: "Логистика", sortOrder: 7, metadata: { type: "expense" } },
        { type: "pl_category", code: "credit", name: "Кредиты", sortOrder: 8, metadata: { type: "expense" } },
        { type: "pl_category", code: "other", name: "Прочее", sortOrder: 9, metadata: { type: "expense" } },
        { type: "production_stage", code: "gypsum", name: "Гипсовка", sortOrder: 1 },
        { type: "production_stage", code: "cad", name: "CAD-моделирование", sortOrder: 2 },
        { type: "production_stage", code: "framework", name: "Каркас/фрезеровка", sortOrder: 3 },
        { type: "production_stage", code: "ceramics", name: "Керамика/нанесение", sortOrder: 4 },
        { type: "production_stage", code: "fitting", name: "Примерка", sortOrder: 5 },
        { type: "production_stage", code: "assembly", name: "Финальная сборка", sortOrder: 6 },
        { type: "material_unit", code: "pcs", name: "шт", sortOrder: 1 },
        { type: "material_unit", code: "ml", name: "мл", sortOrder: 2 },
        { type: "material_unit", code: "g", name: "г", sortOrder: 3 },
        { type: "material_unit", code: "m", name: "м", sortOrder: 4 },
        { type: "material_unit", code: "l", name: "л", sortOrder: 5 },
        { type: "material_unit", code: "kg", name: "кг", sortOrder: 6 },
      ] as Array<{ type: string; code: string; name: string; sortOrder: number; metadata?: Prisma.InputJsonValue }>;

      for (const ref of defaultReferences) {
        await tx.referenceList.create({
          data: { organizationId: org.id, ...ref },
        });
      }

      return { org, user };
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role,
      },
      organization: {
        id: result.org.id,
        name: result.org.name,
        slug: result.org.slug,
      },
    };
  }

  async login(input: LoginInput, jwtSign: (payload: object, options?: object) => string) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { organization: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError("Неверный email или пароль");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Неверный email или пароль");
    }

    const payload = {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    };

    const accessToken = jwtSign(payload, { expiresIn: "15m" });
    const refreshToken = crypto.randomBytes(40).toString("hex");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    });

    await redis.setex(
      `user:${user.id}`,
      900, // 15 минут
      JSON.stringify(payload)
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
        },
      },
    };
  }

  async refresh(refreshToken: string, jwtSign: (payload: object, options?: object) => string) {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { organization: true } } },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedError("Refresh token истёк или невалиден");
    }

    const user = stored.user;
    const payload = {
      id: user.id,
      organizationId: user.organizationId,
      role: user.role,
      email: user.email,
    };

    const accessToken = jwtSign(payload, { expiresIn: "15m" });

    const newRefreshToken = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: stored.id } }),
      prisma.refreshToken.create({
        data: { userId: user.id, token: newRefreshToken, expiresAt },
      }),
    ]);

    await redis.setex(`user:${user.id}`, 900, JSON.stringify(payload));

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        organization: {
          id: user.organization.id,
          name: user.organization.name,
        },
      },
    };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    } else {
      await prisma.refreshToken.deleteMany({ where: { userId } });
    }
    await redis.del(`user:${userId}`);
  }

  async createUser(orgId: string, input: CreateUserInput) {
    const exists = await prisma.user.findUnique({ where: { email: input.email } });
    if (exists) {
      throw new AppError(409, "Пользователь с таким email уже существует");
    }

    const passwordHash = await bcrypt.hash(input.password, 12);

    const user = await prisma.user.create({
      data: {
        organizationId: orgId,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        patronymic: input.patronymic,
        phone: input.phone,
        role: input.role,
      },
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }
}

export const authService = new AuthService();
