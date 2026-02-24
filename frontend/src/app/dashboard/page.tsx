"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import {
  ClipboardList, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, Zap, Calendar, ArrowRight, Building2, Users
} from "lucide-react";
import { PageHeader, StatsCard, StatusBadge } from "@/components/ui";

interface Counters {
  totalOrders: number;
  newOrders: number;
  inProgressOrders: number;
  overdueOrders: number;
  readyOrders: number;
  dueThisWeek: number;
  urgentOrders: number;
  totalClients: number;
}

interface RecentOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalPrice: string | number;
  dueDate: string | null;
  createdAt: string;
  isUrgent: boolean;
  isPaid: boolean;
  client: { name: string; shortName: string | null };
  patient: { lastName: string; firstName: string } | null;
}

interface StageStat {
  status: string;
  _count: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [counters, setCounters] = useState<Counters | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [stageStats, setStageStats] = useState<StageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authApi("/dashboard");
      if (res.ok) {
        const json = await res.json();
        const d = json.data;
        setCounters(d.counters);
        setRecentOrders(d.recentOrders || []);
        setStageStats(d.stageStats || []);
      } else {
        setError("Ошибка загрузки данных");
      }
    } catch (e) {
      console.error(e);
      setError("Не удалось загрузить дашборд");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  };

  const formatPrice = (p: string | number) => {
    return Number(p).toLocaleString("ru-RU");
  };

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-pulse flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-zetta-500"></div>
            <p className="text-gray-500 text-sm">Загрузка дашборда...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Дашборд" subtitle="Обзор состояния лаборатории">
            <button onClick={() => router.push("/orders/new")} className="btn-primary flex items-center gap-2">
              <ClipboardList className="w-4 h-4" />
              Новый наряд
            </button>
          </PageHeader>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
          )}

          {counters && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/orders")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Всего нарядов</span>
                  <div className="w-8 h-8 rounded-lg bg-zetta-100 flex items-center justify-center">
                    <ClipboardList className="w-4 h-4 text-zetta-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-gray-900">{counters.totalOrders}</p>
              </div>

              <div className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/orders?status=NEW")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Новые</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-blue-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-blue-600">{counters.newOrders}</p>
              </div>

              <div className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/orders?status=IN_PROGRESS")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">В работе</span>
                  <div className="w-8 h-8 rounded-lg bg-yellow-100 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-yellow-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-yellow-600">{counters.inProgressOrders}</p>
              </div>

              <div className={`card p-4 ${counters.overdueOrders > 0 ? "ring-2 ring-red-300" : ""}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Просрочено</span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${counters.overdueOrders > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                    <AlertTriangle className={`w-4 h-4 ${counters.overdueOrders > 0 ? "text-red-600" : "text-gray-400"}`} />
                  </div>
                </div>
                <p className={`text-3xl font-bold ${counters.overdueOrders > 0 ? "text-red-600" : "text-gray-400"}`}>{counters.overdueOrders}</p>
              </div>

              <div className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/orders?status=READY")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Готово к сдаче</span>
                  <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-green-600">{counters.readyOrders}</p>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Сдать на этой неделе</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-indigo-600">{counters.dueThisWeek}</p>
              </div>

              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Срочные</span>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${counters.urgentOrders > 0 ? "bg-orange-100" : "bg-gray-100"}`}>
                    <Zap className={`w-4 h-4 ${counters.urgentOrders > 0 ? "text-orange-600" : "text-gray-400"}`} />
                  </div>
                </div>
                <p className={`text-3xl font-bold ${counters.urgentOrders > 0 ? "text-orange-600" : "text-gray-400"}`}>{counters.urgentOrders}</p>
              </div>

              <div className="card p-4 cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push("/clients")}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Заказчики</span>
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-purple-600" />
                  </div>
                </div>
                <p className="text-3xl font-bold text-purple-600">{counters.totalClients}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-medium text-gray-900">Последние наряды</h2>
                  <button onClick={() => router.push("/orders")} className="text-sm text-zetta-600 hover:text-zetta-700 flex items-center gap-1">
                    Все наряды <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                {recentOrders.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <ClipboardList className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p>Нарядов пока нет</p>
                    <button onClick={() => router.push("/orders/new")} className="btn-primary mt-3 text-sm">Создать первый наряд</button>
                  </div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500">
                        <th className="text-left p-3">Номер</th>
                        <th className="text-left p-3">Заказчик</th>
                        <th className="text-left p-3">Пациент</th>
                        <th className="text-left p-3">Статус</th>
                        <th className="text-right p-3">Сумма</th>
                        <th className="text-right p-3">Срок</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentOrders.map((order) => (
                        <tr key={order.id} className="border-t border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/orders/${order.id}`)}>
                          <td className="p-3 font-mono text-sm text-zetta-600 font-medium">
                            {order.isUrgent && <Zap className="w-3 h-3 text-orange-500 inline mr-1" />}
                            {order.orderNumber}
                          </td>
                          <td className="p-3 text-sm">{order.client?.shortName || order.client?.name}</td>
                          <td className="p-3 text-sm text-gray-600">
                            {order.patient ? `${order.patient.lastName} ${order.patient.firstName[0]}.` : "—"}
                          </td>
                          <td className="p-3">
                            <StatusBadge status={order.status} />
                          </td>
                          <td className="p-3 text-sm text-right font-medium">{formatPrice(order.totalPrice)} ₽</td>
                          <td className="p-3 text-sm text-right text-gray-500">{formatDate(order.dueDate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="card p-4">
                <h2 className="font-medium text-gray-900 mb-3">Этапы в работе</h2>
                {stageStats.length === 0 ? (
                  <p className="text-sm text-gray-400">Нет активных этапов</p>
                ) : (
                  <div className="space-y-2">
                    {stageStats.map((stat) => {
                      const total = stageStats.reduce((sum, s) => sum + s._count, 0);
                      const pct = total > 0 ? Math.round((stat._count / total) * 100) : 0;
                      const labels: Record<string, string> = { PENDING: "Ожидание", IN_PROGRESS: "В работе", COMPLETED: "Завершено", SKIPPED: "Пропущено" };
                      const colors: Record<string, string> = { PENDING: "bg-gray-300", IN_PROGRESS: "bg-yellow-400", COMPLETED: "bg-green-400", SKIPPED: "bg-gray-200" };
                      return (
                        <div key={stat.status}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-600">{labels[stat.status] || stat.status}</span>
                            <span className="font-medium">{stat._count}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className={`h-2 rounded-full ${colors[stat.status] || "bg-zetta-400"}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="card p-4">
                <h2 className="font-medium text-gray-900 mb-3">Быстрые действия</h2>
                <div className="space-y-2">
                  <button onClick={() => router.push("/orders/new")} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-zetta-50 text-sm flex items-center gap-2 transition-colors">
                    <ClipboardList className="w-4 h-4 text-zetta-500" /> Создать наряд
                  </button>
                  <button onClick={() => router.push("/clients")} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-100 text-sm flex items-center gap-2 transition-colors">
                    <Building2 className="w-4 h-4 text-gray-500" /> Добавить заказчика
                  </button>
                  <button onClick={() => router.push("/users")} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-100 text-sm flex items-center gap-2 transition-colors">
                    <Users className="w-4 h-4 text-gray-500" /> Управление командой
                  </button>
                  <button onClick={() => router.push("/work-catalog")} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-100 text-sm flex items-center gap-2 transition-colors">
                    <TrendingUp className="w-4 h-4 text-gray-500" /> Каталог работ
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
