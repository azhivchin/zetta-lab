"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { PageHeader, StatusBadge } from "@/components/ui";
import { authApi, getToken } from "@/lib/api";
import { Plus, Search, ChevronLeft, ChevronRight, Eye, LayoutGrid, List, Zap, CreditCard } from "lucide-react";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  client: { name: string; shortName: string | null };
  doctor: { lastName: string; firstName: string } | null;
  patient: { lastName: string; firstName: string } | null;
  items: { workItem: { name: string }; quantity: number }[];
  dueDate: string | null;
  createdAt: string;
  receivedAt: string;
  totalPrice: number | string;
  isUrgent: boolean;
  isPaid: boolean;
  paymentStatus: string;
  discountTotal: number | string;
  color: string | null;
  toothFormula: string | null;
  frameworkDate: string | null;
  settingDate: string | null;
  fittingSentAt: string | null;
  fittingBackAt: string | null;
  stages: { name: string; status: string; assignee: { firstName: string; lastName: string } | null }[];
}

interface KanbanColumn {
  status: string;
  count: number;
  orders: Order[];
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  ON_FITTING: "Примерка",
  REWORK: "Доработка",
  ASSEMBLY: "Сборка",
  READY: "Готов",
  DELIVERED: "Сдан",
  CANCELLED: "Отменён",
};

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  ON_FITTING: "bg-purple-100 text-purple-800",
  REWORK: "bg-red-100 text-red-800",
  ASSEMBLY: "bg-orange-100 text-orange-800",
  READY: "bg-green-100 text-green-800",
  DELIVERED: "bg-gray-100 text-gray-800",
  CANCELLED: "bg-gray-200 text-gray-500",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  UNPAID: "Не опл.",
  PARTIAL: "Частично",
  PAID: "Оплачен",
};

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  UNPAID: "text-gray-400",
  PARTIAL: "text-orange-500",
  PAID: "text-green-500",
};

const ROW_COLORS: Record<string, string> = {
  READY: "bg-green-50",
  ON_FITTING: "bg-purple-50",
  REWORK: "bg-red-50",
  CANCELLED: "bg-gray-100",
};

const MONTHS = [
  { label: "Янв", month: "01" }, { label: "Фев", month: "02" }, { label: "Мар", month: "03" },
  { label: "Апр", month: "04" }, { label: "Май", month: "05" }, { label: "Июн", month: "06" },
  { label: "Июл", month: "07" }, { label: "Авг", month: "08" }, { label: "Сен", month: "09" },
  { label: "Окт", month: "10" }, { label: "Ноя", month: "11" }, { label: "Дек", month: "12" },
];

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [monthFilter, setMonthFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>([]);
  const limit = 30;

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(limit));
      if (search) params.set("search", search);
      if (statusFilter) params.set("status", statusFilter);
      if (monthFilter) {
        const year = new Date().getFullYear();
        params.set("dateFrom", `${year}-${monthFilter}-01`);
        const lastDay = new Date(year, parseInt(monthFilter), 0).getDate();
        params.set("dateTo", `${year}-${monthFilter}-${lastDay}`);
      }

      const res = await authApi(`/orders?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        // API returns { orders, pagination } in data, or data as array
        const d = json.data;
        if (d?.orders) {
          setOrders(d.orders);
          setTotal(d.pagination?.total || 0);
        } else if (Array.isArray(d)) {
          setOrders(d);
          setTotal(json.pagination?.total || d.length);
        } else {
          setOrders(d || []);
          setTotal(json.pagination?.total || 0);
        }
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [page, search, statusFilter, monthFilter]);

  const fetchKanban = useCallback(async () => {
    try {
      const res = await authApi("/orders/kanban");
      if (res.ok) {
        const json = await res.json();
        const d = json.data;
        // API returns { columns: [{ status, count, orders }] }
        if (d?.columns) {
          setKanbanColumns(d.columns);
        } else if (Array.isArray(d)) {
          setKanbanColumns(d);
        } else {
          // Fallback: treat as Record<status, orders[]>
          const cols = Object.entries(d || {}).map(([status, orders]) => ({
            status,
            count: (orders as Order[]).length,
            orders: orders as Order[],
          }));
          setKanbanColumns(cols);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "table") {
      fetchOrders();
    } else {
      fetchKanban();
    }
  }, [viewMode, fetchOrders, fetchKanban]);

  const totalPages = Math.ceil(total / limit);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
  };

  const formatShortDate = (d: string | null) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  };

  const isOverdue = (order: Order) => {
    if (!order.dueDate) return false;
    if (["DELIVERED", "CANCELLED"].includes(order.status)) return false;
    return new Date(order.dueDate) < new Date();
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Заказ-наряды">
            <div className="flex items-center gap-3">
              <div className="flex bg-gray-200 rounded-lg p-0.5">
                <button onClick={() => setViewMode("table")} className={`p-1.5 rounded-md ${viewMode === "table" ? "bg-white shadow-sm" : ""}`}>
                  <List className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("kanban")} className={`p-1.5 rounded-md ${viewMode === "kanban" ? "bg-white shadow-sm" : ""}`}>
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
              <button onClick={() => router.push("/orders/new")} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Новый наряд
              </button>
            </div>
          </PageHeader>

          {viewMode === "table" && (
            <>
              {/* Filters */}
              <div className="flex gap-3 mb-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Поиск по номеру, клиенту, пациенту..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    className="input-field pl-10"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                  className="input-field w-48"
                >
                  <option value="">Все статусы</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {/* Month filter buttons */}
              <div className="flex gap-1.5 mb-4 flex-wrap">
                <button
                  onClick={() => { setMonthFilter(""); setPage(1); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${!monthFilter ? "bg-zetta-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                >
                  Все
                </button>
                {MONTHS.map(m => (
                  <button
                    key={m.month}
                    onClick={() => { setMonthFilter(m.month === monthFilter ? "" : m.month); setPage(1); }}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${m.month === monthFilter ? "bg-zetta-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        <th className="text-left p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">№</th>
                        <th className="text-left p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Заказчик</th>
                        <th className="text-left p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Пациент</th>
                        <th className="text-left p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Работы</th>
                        <th className="text-left p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Цвет</th>
                        <th className="text-left p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Статус</th>
                        <th className="text-right p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Сумма</th>
                        <th className="text-center p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Каркас</th>
                        <th className="text-center p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Примерка</th>
                        <th className="text-center p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Срок</th>
                        <th className="text-center p-2.5 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Опл.</th>
                        <th className="p-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={12} className="p-8 text-center text-gray-400">Загрузка...</td></tr>
                      ) : orders.length === 0 ? (
                        <tr><td colSpan={12} className="p-8 text-center text-gray-400">
                          Нарядов пока нет. <button onClick={() => router.push("/orders/new")} className="text-zetta-600 hover:underline">Создать первый</button>
                        </td></tr>
                      ) : orders.map((order) => (
                        <tr
                          key={order.id}
                          className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                            isOverdue(order) ? "bg-red-50" : ROW_COLORS[order.status] || ""
                          }`}
                          onClick={() => router.push(`/orders/${order.id}`)}
                        >
                          <td className="p-2.5 font-mono text-sm font-medium text-zetta-600 whitespace-nowrap">
                            {order.isUrgent && <Zap className="w-3 h-3 text-orange-500 inline mr-0.5" />}
                            {order.orderNumber}
                          </td>
                          <td className="p-2.5 text-sm whitespace-nowrap">{order.client?.shortName || order.client?.name}</td>
                          <td className="p-2.5 text-sm whitespace-nowrap">
                            {order.patient ? `${order.patient.lastName} ${order.patient.firstName[0]}.` : "—"}
                          </td>
                          <td className="p-2.5 text-sm text-gray-600 max-w-[200px] truncate">
                            {order.items?.slice(0, 2).map(i => i.workItem?.name).join(", ")}
                            {(order.items?.length || 0) > 2 && ` +${order.items.length - 2}`}
                          </td>
                          <td className="p-2.5 text-sm text-gray-500 whitespace-nowrap">{order.color || "—"}</td>
                          <td className="p-2.5">
                            <StatusBadge status={order.status} label={STATUS_LABELS[order.status]} />
                          </td>
                          <td className="p-2.5 text-sm font-medium text-right whitespace-nowrap">{Number(order.totalPrice).toLocaleString("ru-RU")} ₽</td>
                          <td className="p-2.5 text-xs text-center text-gray-500 whitespace-nowrap">{formatShortDate(order.frameworkDate)}</td>
                          <td className="p-2.5 text-xs text-center text-gray-500 whitespace-nowrap">
                            {order.fittingSentAt ? (
                              <span title={`Отпр: ${formatShortDate(order.fittingSentAt)}${order.fittingBackAt ? ` / Верн: ${formatShortDate(order.fittingBackAt)}` : ""}`}>
                                {formatShortDate(order.fittingSentAt)}
                                {order.fittingBackAt && <span className="text-green-600"> ✓</span>}
                              </span>
                            ) : ""}
                          </td>
                          <td className={`p-2.5 text-xs text-center whitespace-nowrap ${isOverdue(order) ? "text-red-600 font-bold" : "text-gray-500"}`}>
                            {formatShortDate(order.dueDate)}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`text-xs font-medium ${PAYMENT_STATUS_COLORS[order.paymentStatus] || "text-gray-400"}`} title={PAYMENT_STATUS_LABELS[order.paymentStatus] || ""}>
                              <CreditCard className={`w-3.5 h-3.5 mx-auto ${PAYMENT_STATUS_COLORS[order.paymentStatus] || "text-gray-300"}`} />
                            </span>
                          </td>
                          <td className="p-2.5">
                            <Eye className="w-4 h-4 text-gray-400" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-gray-500">Всего: {total}</p>
                  <div className="flex items-center gap-2">
                    <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 rounded-md border hover:bg-gray-50 disabled:opacity-30">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm">{page} / {totalPages}</span>
                    <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 rounded-md border hover:bg-gray-50 disabled:opacity-30">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {viewMode === "kanban" && (
            <div className="flex gap-4 overflow-x-auto pb-4">
              {(kanbanColumns.length > 0 ? kanbanColumns : Object.keys(STATUS_LABELS).filter(k => k !== "CANCELLED" && k !== "DELIVERED").map(status => ({ status, count: 0, orders: [] }))).map((col) => (
                <div key={col.status} className="flex-shrink-0 w-72">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-sm text-gray-700">{STATUS_LABELS[col.status] || col.status}</h3>
                    <span className="text-xs bg-gray-200 px-2 py-0.5 rounded-full">{col.count}</span>
                  </div>
                  <div className="space-y-2">
                    {col.orders.map((order) => (
                      <div
                        key={order.id}
                        onClick={() => router.push(`/orders/${order.id}`)}
                        className={`card p-3 cursor-pointer hover:shadow-md transition-shadow ${order.isUrgent ? "border-l-4 border-l-orange-400" : ""}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs font-medium text-zetta-600">
                            {order.isUrgent && <Zap className="w-3 h-3 text-orange-500 inline mr-0.5" />}
                            {order.orderNumber}
                          </span>
                          <span className="text-xs text-gray-400">{formatDate(order.dueDate)}</span>
                        </div>
                        <p className="text-sm font-medium truncate">{order.client?.shortName || order.client?.name}</p>
                        {order.patient && (
                          <p className="text-xs text-gray-500">{order.patient.lastName} {order.patient.firstName}</p>
                        )}
                        {order.stages && order.stages.length > 0 && (
                          <div className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
                            <span>Этап: {order.stages[0]?.name}</span>
                            {order.stages[0]?.assignee && (
                              <span className="text-zetta-600">({order.stages[0].assignee.firstName[0]}. {order.stages[0].assignee.lastName})</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                    {col.orders.length === 0 && (
                      <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center text-xs text-gray-400">
                        Пусто
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="flex h-screen bg-gray-50"><Sidebar /><main className="flex-1 flex items-center justify-center"><p className="text-gray-400">Загрузка...</p></main></div>}>
      <OrdersPageContent />
    </Suspense>
  );
}
