import { z } from "zod";

export const createOrderSchema = z.object({
  clientId: z.string().min(1, "Выберите заказчика"),
  doctorId: z.string().optional(),
  patientId: z.string().optional(),
  patientName: z.string().optional(), // Если пациент новый — создаём
  toothFormula: z.string().optional(),
  color: z.string().optional(),
  implantSystem: z.string().optional(),
  hasStl: z.boolean().default(false),
  notes: z.string().optional(),
  isUrgent: z.boolean().default(false),
  dueDate: z.string().optional(), // ISO date
  items: z.array(z.object({
    workItemId: z.string(),
    quantity: z.number().int().min(1).default(1),
    price: z.number().optional(), // Если не указана — берём из прайса
    discount: z.number().min(0).max(100).default(0), // % скидки
    notes: z.string().optional(),
  })).min(1, "Добавьте хотя бы одну работу"),
});

export const updateOrderSchema = z.object({
  status: z.enum(["NEW", "IN_PROGRESS", "ON_FITTING", "REWORK", "ASSEMBLY", "READY", "DELIVERED", "CANCELLED"]).optional(),
  doctorId: z.string().optional(),
  patientId: z.string().optional(),
  toothFormula: z.string().optional(),
  color: z.string().optional(),
  implantSystem: z.string().optional(),
  hasStl: z.boolean().optional(),
  notes: z.string().optional(),
  isUrgent: z.boolean().optional(),
  dueDate: z.string().optional(),
  frameworkDate: z.string().optional(),
  settingDate: z.string().optional(),
  fittingSentAt: z.string().optional(),
  fittingBackAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  isPaid: z.boolean().optional(),
  paymentStatus: z.enum(["UNPAID", "PARTIAL", "PAID"]).optional(),
  billingPeriod: z.string().optional(),
});

export const orderFilterSchema = z.object({
  status: z.string().optional(),
  clientId: z.string().optional(),
  assigneeId: z.string().optional(),
  isUrgent: z.string().optional(),
  isPaid: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.string().default("1"),
  limit: z.string().default("50"),
  sortBy: z.string().default("receivedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const assignStageSchema = z.object({
  assigneeId: z.string(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
});

export const updateStageSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "SKIPPED"]),
  notes: z.string().optional(),
});

export const updateItemsSchema = z.object({
  items: z.array(z.object({
    workItemId: z.string(),
    quantity: z.number().int().min(1).default(1),
    priceOverride: z.number().optional(),
  })).min(1, "Добавьте хотя бы одну работу"),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
