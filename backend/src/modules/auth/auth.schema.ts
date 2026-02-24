import { z } from "zod";

export const registerSchema = z.object({
  organizationName: z.string().min(2, "Название организации: минимум 2 символа"),
  firstName: z.string().min(2, "Имя: минимум 2 символа"),
  lastName: z.string().min(2, "Фамилия: минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(6, "Пароль: минимум 6 символов"),
  phone: z.string().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const createUserSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  patronymic: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  role: z.enum([
    "ADMIN", "SENIOR_TECH", "TECHNICIAN", "CAD_SPECIALIST",
    "GYPSUM_WORKER", "CERAMIST", "COURIER", "ACCOUNTANT"
  ]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
