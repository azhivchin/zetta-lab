"use client";
import { useEffect, useState, useCallback } from "react";
import { authApi } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { PageHeader, TabPanel, StatsCard, Modal } from "@/components/ui";
import { useReferences } from "@/lib/useReferences";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";

interface Rework {
  id: string;
  orderId: string;
  reason: string;
  category: string;
  status: string;
  cost: number | string;
  resolution: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  clientId: string | null;
  order?: { orderNumber: string; client?: { name: string; shortName?: string } };
  responsible?: { id: string; firstName: string; lastName: string } | null;
}

interface DoctorRework {
  doctorName: string;
  clientName: string;
  totalWorkSum: number;
  reworkSum: number;
  reworkCount: number;
  reworkPercent: number;
}

interface QualityStats {
  summary: {
    totalReworks: number;
    totalOrders: number;
    reworkRate: number;
    openReworks: number;
    totalCost: number;
  };
  byCategory: { category: string; label: string; count: number; cost: number }[];
  byTechnician: { technicianId: string; technicianName: string; count: number; cost: number }[];
  byClient: { clientId: string; clientName: string; count: number }[];
  byDoctor?: DoctorRework[];
  categories: Record<string, string>;
}

interface Order { id: string; orderNumber: string }
interface User { id: string; firstName: string; lastName: string }

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Открыта",
  IN_PROGRESS: "В работе",
  RESOLVED: "Решена",
  CLOSED: "Закрыта",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700",
  IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-500",
};

const TABS = [
  { key: "reworks", label: "Переделки" },
  { key: "stats", label: "Аналитика" },
];

export default function QualityPage() {
  const { labelMap: reworkReasonLabels } = useReferences("rework_reason");
  const [tab, setTab] = useState("reworks");
  const [reworks, setReworks] = useState<Rework[]>([]);
  const [stats, setStats] = useState<QualityStats | null>(null);
  const [categories, setCategories] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({
    orderId: "",
    reason: "",
    category: "other",
    responsibleId: "",
    cost: 0,
    notes: "",
  });

  const fetchReworks = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterCategory) params.set("category", filterCategory);
      const res = await authApi(`/quality/reworks?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReworks(data.data.reworks);
        setTotal(data.data.pagination.total);
      }
    } catch { /* ignore */ }
  }, [page, filterStatus, filterCategory]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await authApi("/quality/stats");
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
        setCategories(data.data.categories || {});
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchReworks(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchReworks, fetchStats]);

  const openCreateModal = async () => {
    try {
      const [ordersRes, usersRes] = await Promise.all([
        authApi("/orders?limit=200&sortBy=orderNumber&sortOrder=desc"),
        authApi("/users"),
      ]);
      if (ordersRes.ok) {
        const d = await ordersRes.json();
        setOrders(d.data?.orders || d.data || []);
      }
      if (usersRes.ok) {
        const d = await usersRes.json();
        setUsers(d.data || []);
      }
    } catch { /* ignore */ }
    setForm({ orderId: "", reason: "", category: "other", responsibleId: "", cost: 0, notes: "" });
    setShowCreate(true);
  };

  const createRework = async () => {
    if (!form.orderId || !form.reason) return;
    try {
      const res = await authApi("/quality/reworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          responsibleId: form.responsibleId || undefined,
          cost: Number(form.cost),
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        fetchReworks();
        fetchStats();
      }
    } catch { /* ignore */ }
  };

  const updateRework = async (id: string, data: Record<string, unknown>) => {
    try {
      const res = await authApi(`/quality/reworks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        fetchReworks();
        fetchStats();
      }
    } catch { /* ignore */ }
  };

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("ru-RU") : "—";
  const fmtMoney = (n: number | string) => Number(n).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const handleExportReworks = (format: "excel" | "pdf") => {
    const headers = ["Наряд", "Клиент", "Категория", "Причина", "Ответственный", "Стоимость", "Статус", "Дата"];
    const rows = reworks.map(r => [
      r.order?.orderNumber || "—",
      r.order?.client?.shortName || r.order?.client?.name || "—",
      categories[r.category] || r.category,
      r.reason,
      r.responsible ? `${r.responsible.lastName} ${r.responsible.firstName}` : "—",
      Number(r.cost) > 0 ? fmtMoney(r.cost) : "—",
      STATUS_LABELS[r.status] || r.status,
      fmtDate(r.detectedAt),
    ]);
    if (format === "excel") exportToExcel("Переделки", headers, rows);
    else exportToPDF("Переделки", headers, rows);
  };

  const maxCategoryCnt = stats ? Math.max(...stats.byCategory.map(c => c.count), 1) : 1;
  const maxTechCnt = stats ? Math.max(...stats.byTechnician.map(t => t.count), 1) : 1;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <PageHeader title="Контроль качества" subtitle="Переделки, статистика, анализ брака">
            <div className="flex gap-2">
              {tab === "reworks" && reworks.length > 0 && (
                <>
                  <button onClick={() => handleExportReworks("excel")} className="btn-secondary flex items-center gap-1.5 text-sm">Excel</button>
                  <button onClick={() => handleExportReworks("pdf")} className="btn-secondary flex items-center gap-1.5 text-sm">PDF</button>
                </>
              )}
              <button onClick={openCreateModal}
                className="btn-primary text-sm">
                + Переделка
              </button>
            </div>
          </PageHeader>

          {/* Summary cards */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <StatsCard label="Всего переделок" value={stats.summary.totalReworks} />
              <StatsCard label="Открытых" value={stats.summary.openReworks} color="red" />
              <StatsCard label="% переделок" value={`${stats.summary.reworkRate}%`} color="yellow" />
              <StatsCard label="Всего нарядов" value={stats.summary.totalOrders} />
              <StatsCard label="Стоимость" value={`${fmtMoney(stats.summary.totalCost)} ₽`} color="yellow" />
            </div>
          )}

          <TabPanel tabs={TABS} active={tab} onChange={setTab} variant="pills" />

          {loading ? (
            <div className="text-center py-20 text-gray-400">Загрузка...</div>
          ) : tab === "reworks" ? (
            <>
              {/* Filters */}
              <div className="flex gap-3 mb-4">
                <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
                  className="input-field w-44">
                  <option value="">Все статусы</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
                  className="input-field w-44">
                  <option value="">Все категории</option>
                  {Object.entries(categories).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <span className="text-sm text-gray-400 flex items-center ml-auto">
                  Найдено: {total}
                </span>
              </div>

              {/* Table */}
              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase">
                      <th className="text-left px-4 py-3">Наряд</th>
                      <th className="text-left px-4 py-3">Клиент</th>
                      <th className="text-left px-4 py-3">Категория</th>
                      <th className="text-left px-4 py-3">Причина</th>
                      <th className="text-left px-4 py-3">Ответственный</th>
                      <th className="text-right px-4 py-3">Стоимость</th>
                      <th className="text-left px-4 py-3">Статус</th>
                      <th className="text-left px-4 py-3">Дата</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reworks.map(r => (
                      <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 text-zetta-600 font-mono text-xs">{r.order?.orderNumber || "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{r.order?.client?.shortName || r.order?.client?.name || "—"}</td>
                        <td className="px-4 py-3 text-gray-500">{categories[r.category] || r.category}</td>
                        <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">{r.reason}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {r.responsible ? `${r.responsible.lastName} ${r.responsible.firstName}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right text-orange-600">
                          {Number(r.cost) > 0 ? `${fmtMoney(r.cost)} ₽` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <select value={r.status}
                            onChange={e => updateRework(r.id, { status: e.target.value })}
                            className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${STATUS_COLORS[r.status] || "bg-gray-100 text-gray-500"}`}>
                            {Object.entries(STATUS_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(r.detectedAt)}</td>
                        <td className="px-4 py-3">
                          {r.status === "OPEN" && (
                            <button onClick={() => updateRework(r.id, { status: "IN_PROGRESS" })}
                              className="text-xs text-zetta-600 hover:text-zetta-700">В работу</button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {reworks.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-12 text-gray-400">Переделок не найдено</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {total > 50 && (
                <div className="flex justify-center gap-2 mt-4">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded text-sm disabled:opacity-30">&#8592;</button>
                  <span className="px-3 py-1 text-sm text-gray-500">Стр. {page} / {Math.ceil(total / 50)}</span>
                  <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1 bg-white border border-gray-200 text-gray-500 rounded text-sm disabled:opacity-30">&#8594;</button>
                </div>
              )}
            </>
          ) : (
            /* Stats / Analytics tab */
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* By Category */}
                <div className="card p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">По категориям</h3>
                  {stats?.byCategory.length === 0 && <p className="text-gray-400 text-sm">Нет данных</p>}
                  <div className="space-y-3">
                    {stats?.byCategory.map(c => (
                      <div key={c.category}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{c.label}</span>
                          <span className="text-gray-900">{c.count} <span className="text-gray-400">({fmtMoney(c.cost)} ₽)</span></span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-red-500 h-2 rounded-full transition-all"
                            style={{ width: `${(c.count / maxCategoryCnt) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Technician */}
                <div className="card p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">По техникам</h3>
                  {stats?.byTechnician.length === 0 && <p className="text-gray-400 text-sm">Нет данных</p>}
                  <div className="space-y-3">
                    {stats?.byTechnician.map(t => (
                      <div key={t.technicianId}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{t.technicianName}</span>
                          <span className="text-gray-900">{t.count} <span className="text-gray-400">({fmtMoney(t.cost)} ₽)</span></span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="bg-yellow-500 h-2 rounded-full transition-all"
                            style={{ width: `${(t.count / maxTechCnt) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* By Client */}
                <div className="card p-6 lg:col-span-2">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Топ-10 клиентов по переделкам</h3>
                  {stats?.byClient.length === 0 && <p className="text-gray-400 text-sm">Нет данных</p>}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {stats?.byClient.map((c, i) => (
                      <div key={c.clientId} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                        <p className="text-xs text-gray-400 mb-1">#{i + 1}</p>
                        <p className="text-sm text-gray-700 font-medium truncate">{c.clientName}</p>
                        <p className="text-lg font-bold text-red-600">{c.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* By Doctor */}
              {stats?.byDoctor && stats.byDoctor.length > 0 && (
                <div className="card p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Переделки по врачам</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                          <th className="text-left px-4 py-2">Врач</th>
                          <th className="text-left px-4 py-2">Клиника</th>
                          <th className="text-right px-4 py-2">Сумма работ</th>
                          <th className="text-right px-4 py-2">Сумма переделок</th>
                          <th className="text-right px-4 py-2">Кол-во</th>
                          <th className="text-right px-4 py-2">% переделок</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.byDoctor.map((d, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2 text-gray-900 font-medium">{d.doctorName}</td>
                            <td className="px-4 py-2 text-gray-500">{d.clientName}</td>
                            <td className="px-4 py-2 text-right text-gray-700">{fmtMoney(d.totalWorkSum)} ₽</td>
                            <td className="px-4 py-2 text-right text-red-600">{fmtMoney(d.reworkSum)} ₽</td>
                            <td className="px-4 py-2 text-right text-gray-700">{d.reworkCount}</td>
                            <td className="px-4 py-2 text-right">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                d.reworkPercent < 3 ? "bg-green-100 text-green-700" :
                                d.reworkPercent < 10 ? "bg-yellow-100 text-yellow-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {d.reworkPercent}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Create rework modal */}
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Новая переделка" size="lg">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Наряд *</label>
              <select value={form.orderId} onChange={e => setForm(f => ({ ...f, orderId: e.target.value }))}
                className="input-field w-full">
                <option value="">Выберите наряд</option>
                {orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Категория</label>
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                className="input-field w-full">
                {Object.entries(categories).length > 0
                  ? Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)
                  : Object.entries(reworkReasonLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)
                }
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Причина *</label>
              <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                className="input-field w-full h-20 resize-none"
                placeholder="Опишите проблему" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Ответственный</label>
                <select value={form.responsibleId} onChange={e => setForm(f => ({ ...f, responsibleId: e.target.value }))}
                  className="input-field w-full">
                  <option value="">Не указан</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Стоимость, ₽</label>
                <input type="number" min={0} value={form.cost}
                  onChange={e => setForm(f => ({ ...f, cost: Number(e.target.value) }))}
                  className="input-field w-full" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button onClick={() => setShowCreate(false)}
              className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm">Отмена</button>
            <button onClick={createRework} disabled={!form.orderId || !form.reason}
              className="btn-primary text-sm disabled:opacity-40">
              Создать
            </button>
          </div>
        </Modal>
      </main>
    </div>
  );
}
