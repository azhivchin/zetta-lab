"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { PageHeader, TabPanel } from "@/components/ui";
import { authApi, getToken } from "@/lib/api";
import { BarChart3, Users, Building2, Warehouse, DollarSign, Download, TrendingUp, TrendingDown, AlertTriangle, FileSpreadsheet, FileText, Eye, X, ClipboardList, PieChart } from "lucide-react";
import { useReferences } from "@/lib/useReferences";
import { registerCyrillicFonts } from "@/lib/pdf-fonts";

type Tab = "orders" | "clients" | "technicians" | "finance" | "warehouse" | "techOrders" | "profitability";

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: "orders", label: "Наряды", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "clients", label: "Заказчики", icon: <Building2 className="w-4 h-4" /> },
  { key: "technicians", label: "Техники", icon: <Users className="w-4 h-4" /> },
  { key: "techOrders", label: "По техникам", icon: <ClipboardList className="w-4 h-4" /> },
  { key: "profitability", label: "Рентабельность", icon: <PieChart className="w-4 h-4" /> },
  { key: "finance", label: "Финансы", icon: <DollarSign className="w-4 h-4" /> },
  { key: "warehouse", label: "Склад", icon: <Warehouse className="w-4 h-4" /> },
];

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый", IN_PROGRESS: "В работе", ON_FITTING: "Примерка", REWORK: "Доработка",
  ASSEMBLY: "Сборка", READY: "Готов", DELIVERED: "Сдан", CANCELLED: "Отменён",
};

const ROLE_LABELS: Record<string, string> = {
  SENIOR_TECH: "Ст. техник", TECHNICIAN: "Техник", CAD_SPECIALIST: "CAD",
  GYPSUM_WORKER: "Гипсовщик", CERAMIST: "Керамист",
};

// EXPENSE_LABELS moved to useReferences("expense_category") in the component

const fmt = (n: number) => n.toLocaleString("ru-RU");

export default function ReportsPage() {
  const router = useRouter();
  const { labelMap: EXPENSE_LABELS } = useReferences("expense_category");
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [detailClient, setDetailClient] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Tech-orders matrix
  const [techOrdersData, setTechOrdersData] = useState<{ technicians: { id: string; name: string }[]; orders: any[] } | null>(null);
  // Profitability
  const [profitData, setProfitData] = useState<{ orders: any[]; summary: any } | null>(null);
  const [profitSort, setProfitSort] = useState<"marginPercent" | "margin" | "revenue">("marginPercent");
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      from: from.toISOString().split("T")[0],
      to: now.toISOString().split("T")[0],
    };
  });

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setData(null);
    setTechOrdersData(null);
    setProfitData(null);
    try {
      const params = `from=${dateRange.from}&to=${dateRange.to}`;
      let url = "";
      switch (activeTab) {
        case "orders": url = `/reports/orders-summary?${params}`; break;
        case "clients": url = `/reports/clients?${params}`; break;
        case "technicians": url = `/reports/technicians?${params}`; break;
        case "finance": url = `/reports/finance?${params}`; break;
        case "warehouse": url = `/reports/warehouse`; break;
        case "techOrders": url = `/reports/tech-orders?${params}`; break;
        case "profitability": url = `/reports/order-profitability?${params}`; break;
      }
      const res = await authApi(url);
      if (res.ok) {
        const d = await res.json();
        if (activeTab === "techOrders") {
          setTechOrdersData(d.data);
          setData(d.data); // keep truthy for export/empty check
        } else if (activeTab === "profitability") {
          setProfitData(d.data);
          setData(d.data);
        } else {
          setData(d.data);
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [activeTab, dateRange]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const openDetailReport = async (clientId: string) => {
    setDetailClient(clientId);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const params = `from=${dateRange.from}&to=${dateRange.to}`;
      const res = await authApi(`/reports/client-detail/${clientId}?${params}`);
      if (res.ok) {
        const d = await res.json();
        setDetailData(d.data);
      }
    } catch (e) { console.error(e); }
    setDetailLoading(false);
  };

  const getTabData = (): { headers: string[]; rows: (string | number)[][]; title: string } | null => {
    if (!data) return null;
    switch (activeTab) {
      case "orders":
        return {
          title: "Наряды",
          headers: ["Статус", "Количество", "Сумма"],
          rows: Object.entries(data.statusBreakdown || {}).map(([s, info]: [string, any]) => [
            STATUS_LABELS[s] || s, info.count, info.totalPrice,
          ]),
        };
      case "clients":
        return {
          title: "Заказчики",
          headers: ["Заказчик", "Заказов", "Выполнено", "Активных", "Выручка", "Оплачено", "Баланс"],
          rows: (data.report || []).map((r: any) => [r.name, r.totalOrders, r.completedOrders, r.activeOrders, r.totalRevenue, r.totalPaid, r.balance]),
        };
      case "technicians":
        return {
          title: "Техники",
          headers: ["Техник", "Роль", "Этапов", "Нарядов", "Начислено", "Выплачено", "К выплате"],
          rows: (data.report || []).map((r: any) => [r.name, ROLE_LABELS[r.role] || r.role, r.completedStages, r.uniqueOrders, r.totalSalary, r.paidSalary, r.unpaidSalary]),
        };
      case "finance":
        return {
          title: "Финансы",
          headers: ["Показатель", "Сумма"],
          rows: [
            ["Поступления", data.totalPaymentsReceived || 0],
            ["Расходы", data.totalExpenses || 0],
            ["Зарплаты", data.totalSalary || 0],
            ["Прибыль", data.profit || 0],
            ...Object.entries(data.expenseByCategory || {}).map(([cat, amount]: [string, any]) => [`Расход: ${EXPENSE_LABELS[cat] || cat}`, amount]),
          ],
        };
      case "warehouse":
        return {
          title: "Склад",
          headers: ["Материал", "Категория", "Ед.", "Остаток", "Мин.", "Цена", "Стоимость", "Статус"],
          rows: (data.report || []).map((r: any) => [r.name, r.category || "—", r.unit, r.currentStock, r.minStock, r.avgPrice, r.stockValue, r.isLow ? "Мало" : "OK"]),
        };
      case "profitability":
        return {
          title: "Рентабельность",
          headers: ["Наряд", "Клиент", "Врач", "Дата", "Выручка", "Себестоим.", "Маржа", "Маржа %"],
          rows: (profitData?.orders || []).map((r: any) => [r.orderNumber, r.client, r.doctor || "—", r.deliveredAt ? new Date(r.deliveredAt).toLocaleDateString("ru-RU") : "—", r.revenue, r.totalCost, r.margin, `${r.marginPercent}%`]),
        };
      case "techOrders":
        return {
          title: "По техникам",
          headers: ["Наряд", "Статус", "Клиент", "Врач", "Ед.", ...(techOrdersData?.technicians || []).map(t => t.name)],
          rows: (techOrdersData?.orders || []).map((r: any) => [r.orderNumber, STATUS_LABELS[r.status] || r.status, r.client, r.doctor || "—", r.unitCount, ...(techOrdersData?.technicians || []).map(t => r.techUnits[t.id] || 0)]),
        };
      default: return null;
    }
  };

  const exportExcel = async () => {
    const d = getTabData();
    if (!d) return;
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([d.headers, ...d.rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, d.title);
    // Set column widths
    ws["!cols"] = d.headers.map(() => ({ wch: 18 }));
    XLSX.writeFile(wb, `${d.title}_${dateRange.from}_${dateRange.to}.xlsx`);
  };

  const exportPDF = async () => {
    const d = getTabData();
    if (!d) return;
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: d.headers.length > 5 ? "landscape" : "portrait" });
    await registerCyrillicFonts(doc);
    doc.setFontSize(16);
    doc.text(`${d.title} — ${dateRange.from} - ${dateRange.to}`, 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [d.headers],
      body: d.rows.map(row => row.map(cell => typeof cell === "number" ? fmt(cell) : String(cell))),
      styles: { fontSize: 9, cellPadding: 3, font: "PTSans" },
      headStyles: { fillColor: [59, 130, 246], font: "PTSans", fontStyle: "bold" },
    });
    doc.save(`${d.title}_${dateRange.from}_${dateRange.to}.pdf`);
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Отчёты">
            {data && (
              <div className="flex items-center gap-2">
                <button onClick={exportExcel} className="btn-secondary flex items-center gap-2 text-sm">
                  <FileSpreadsheet className="w-4 h-4" />
                  Excel
                </button>
                <button onClick={exportPDF} className="btn-secondary flex items-center gap-2 text-sm">
                  <FileText className="w-4 h-4" />
                  PDF
                </button>
              </div>
            )}
          </PageHeader>

          {/* Tabs */}
          <TabPanel tabs={TABS.map(t => ({ key: t.key, label: t.label }))} active={activeTab} onChange={(t) => setActiveTab(t as Tab)} variant="pills" />

          {/* Date range */}
          {activeTab !== "warehouse" && (
            <div className="flex items-center gap-3 mb-6">
              <input type="date" value={dateRange.from} onChange={(e) => setDateRange(p => ({ ...p, from: e.target.value }))} className="input-field w-44" />
              <span className="text-gray-400">—</span>
              <input type="date" value={dateRange.to} onChange={(e) => setDateRange(p => ({ ...p, to: e.target.value }))} className="input-field w-44" />
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Загрузка отчёта...</div>
          ) : !data ? (
            <div className="card p-12 text-center">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Нет данных</p>
            </div>
          ) : (
            <>
              {/* ORDERS TAB */}
              {activeTab === "orders" && (
                <div>
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Всего нарядов</p>
                      <p className="text-2xl font-bold">{data.totalOrders}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Выручка</p>
                      <p className="text-2xl font-bold text-green-600">{fmt(data.totalRevenue)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Просрочено</p>
                      <p className="text-2xl font-bold text-red-600">{data.overdueCount}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Ср. срок (дн.)</p>
                      <p className="text-2xl font-bold">{data.avgDeliveryDays}</p>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <div className="p-4 border-b border-gray-100">
                      <h3 className="font-medium">По статусам</h3>
                    </div>
                    <div className="p-4 space-y-3">
                      {Object.entries(data.statusBreakdown || {}).map(([status, info]: [string, any]) => {
                        const pct = data.totalOrders > 0 ? (info.count / data.totalOrders * 100) : 0;
                        return (
                          <div key={status} className="flex items-center gap-3">
                            <span className="text-sm w-28 text-gray-600">{STATUS_LABELS[status] || status}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                              <div className="bg-zetta-500 h-full rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max(pct, 8)}%` }}>
                                <span className="text-xs text-white font-medium">{info.count}</span>
                              </div>
                            </div>
                            <span className="text-sm text-gray-500 w-24 text-right">{fmt(info.totalPrice)} ₽</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* CLIENTS TAB */}
              {activeTab === "clients" && (
                <div>
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Заказчиков</p>
                      <p className="text-2xl font-bold">{data.summary?.totalClients}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Выручка</p>
                      <p className="text-2xl font-bold text-green-600">{fmt(data.summary?.totalRevenue || 0)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Оплачено</p>
                      <p className="text-2xl font-bold text-blue-600">{fmt(data.summary?.totalPaid || 0)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Задолженность</p>
                      <p className="text-2xl font-bold text-red-600">{fmt(data.summary?.totalDebt || 0)} ₽</p>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500">
                          <th className="text-left p-3">Заказчик</th>
                          <th className="text-center p-3">Заказов</th>
                          <th className="text-center p-3">Выполнено</th>
                          <th className="text-center p-3">Активных</th>
                          <th className="text-right p-3">Выручка</th>
                          <th className="text-right p-3">Оплачено</th>
                          <th className="text-right p-3">Баланс</th>
                          <th className="text-center p-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.report || []).map((r: any) => (
                          <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="p-3 text-sm font-medium">{r.name}</td>
                            <td className="p-3 text-sm text-center">{r.totalOrders}</td>
                            <td className="p-3 text-sm text-center text-green-600">{r.completedOrders}</td>
                            <td className="p-3 text-sm text-center text-blue-600">{r.activeOrders}</td>
                            <td className="p-3 text-sm text-right">{fmt(r.totalRevenue)} ₽</td>
                            <td className="p-3 text-sm text-right text-green-600">{fmt(r.totalPaid)} ₽</td>
                            <td className={`p-3 text-sm text-right font-medium ${r.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                              {r.balance > 0 ? "+" : ""}{fmt(r.balance)} ₽
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => openDetailReport(r.id)}
                                className="text-zetta-600 hover:text-zetta-800"
                                title="Детальный отчёт"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TECHNICIANS TAB */}
              {activeTab === "technicians" && (
                <div>
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Техников</p>
                      <p className="text-2xl font-bold">{data.summary?.totalTechnicians}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Этапов завершено</p>
                      <p className="text-2xl font-bold">{data.summary?.totalCompletedStages}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Начислено</p>
                      <p className="text-2xl font-bold text-blue-600">{fmt(data.summary?.totalSalary || 0)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">К выплате</p>
                      <p className="text-2xl font-bold text-orange-600">{fmt(data.summary?.totalUnpaid || 0)} ₽</p>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500">
                          <th className="text-left p-3">Техник</th>
                          <th className="text-left p-3">Роль</th>
                          <th className="text-center p-3">Этапов</th>
                          <th className="text-center p-3">Нарядов</th>
                          <th className="text-right p-3">Начислено</th>
                          <th className="text-right p-3">Выплачено</th>
                          <th className="text-right p-3">Долг</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.report || []).map((r: any) => (
                          <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="p-3 text-sm font-medium">{r.name}</td>
                            <td className="p-3 text-sm text-gray-500">{ROLE_LABELS[r.role] || r.role}</td>
                            <td className="p-3 text-sm text-center">{r.completedStages}</td>
                            <td className="p-3 text-sm text-center">{r.uniqueOrders}</td>
                            <td className="p-3 text-sm text-right">{fmt(r.totalSalary)} ₽</td>
                            <td className="p-3 text-sm text-right text-green-600">{fmt(r.paidSalary)} ₽</td>
                            <td className={`p-3 text-sm text-right font-medium ${r.unpaidSalary > 0 ? "text-orange-600" : "text-gray-400"}`}>
                              {fmt(r.unpaidSalary)} ₽
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* FINANCE TAB */}
              {activeTab === "finance" && (
                <div>
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="card p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="w-4 h-4 text-green-500" />
                        <p className="text-sm text-gray-500">Поступления</p>
                      </div>
                      <p className="text-2xl font-bold text-green-600">{fmt(data.totalPaymentsReceived || 0)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingDown className="w-4 h-4 text-red-500" />
                        <p className="text-sm text-gray-500">Расходы</p>
                      </div>
                      <p className="text-2xl font-bold text-red-600">{fmt(data.totalExpenses || 0)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Зарплаты</p>
                      <p className="text-2xl font-bold text-orange-600">{fmt(data.totalSalary || 0)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Прибыль</p>
                      <p className={`text-2xl font-bold ${(data.profit || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmt(data.profit || 0)} ₽
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    {/* Expenses by category */}
                    <div className="card overflow-hidden">
                      <div className="p-4 border-b border-gray-100"><h3 className="font-medium">Расходы по категориям</h3></div>
                      <div className="p-4 space-y-3">
                        {Object.entries(data.expenseByCategory || {}).map(([cat, amount]: [string, any]) => {
                          const total = data.totalExpenses || 1;
                          const pct = (amount / total * 100);
                          return (
                            <div key={cat} className="flex items-center gap-3">
                              <span className="text-sm w-28 text-gray-600">{EXPENSE_LABELS[cat] || cat}</span>
                              <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                                <div className="bg-red-400 h-full rounded-full" style={{ width: `${Math.max(pct, 5)}%` }} />
                              </div>
                              <span className="text-sm text-gray-700 w-28 text-right">{fmt(amount)} ₽</span>
                            </div>
                          );
                        })}
                        {Object.keys(data.expenseByCategory || {}).length === 0 && (
                          <p className="text-sm text-gray-400">Нет расходов за период</p>
                        )}
                      </div>
                    </div>

                    {/* Monthly breakdown */}
                    <div className="card overflow-hidden">
                      <div className="p-4 border-b border-gray-100"><h3 className="font-medium">Помесячная динамика</h3></div>
                      <div className="p-4">
                        <div className="space-y-2">
                          {Object.entries(data.monthly || {}).sort().reverse().slice(0, 6).map(([month, info]: [string, any]) => (
                            <div key={month} className="flex items-center gap-3 text-sm">
                              <span className="w-20 text-gray-500">{month}</span>
                              <span className="text-green-600 w-24 text-right">+{fmt(info.payments)} ₽</span>
                              <span className="text-red-600 w-24 text-right">-{fmt(info.expenses)} ₽</span>
                              <span className={`font-medium w-24 text-right ${info.payments - info.expenses >= 0 ? "text-green-600" : "text-red-600"}`}>
                                = {fmt(info.payments - info.expenses)} ₽
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* WAREHOUSE TAB */}
              {activeTab === "warehouse" && (
                <div>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Материалов</p>
                      <p className="text-2xl font-bold">{data.summary?.totalMaterials}</p>
                    </div>
                    <div className="card p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <p className="text-sm text-gray-500">Ниже минимума</p>
                      </div>
                      <p className="text-2xl font-bold text-red-600">{data.summary?.lowStockCount}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Стоимость склада</p>
                      <p className="text-2xl font-bold">{fmt(data.summary?.totalStockValue || 0)} ₽</p>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500">
                          <th className="text-left p-3">Материал</th>
                          <th className="text-left p-3">Категория</th>
                          <th className="text-center p-3">Остаток</th>
                          <th className="text-center p-3">Мин.</th>
                          <th className="text-right p-3">Цена</th>
                          <th className="text-right p-3">Стоимость</th>
                          <th className="text-center p-3">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.report || []).map((r: any) => (
                          <tr key={r.id} className={`border-t border-gray-50 ${r.isLow ? "bg-red-50" : "hover:bg-gray-50"}`}>
                            <td className="p-3 text-sm font-medium">{r.name}</td>
                            <td className="p-3 text-sm text-gray-500">{r.category || "—"}</td>
                            <td className="p-3 text-sm text-center">{r.currentStock} {r.unit}</td>
                            <td className="p-3 text-sm text-center text-gray-400">{r.minStock} {r.unit}</td>
                            <td className="p-3 text-sm text-right">{fmt(r.avgPrice)} ₽</td>
                            <td className="p-3 text-sm text-right font-medium">{fmt(r.stockValue)} ₽</td>
                            <td className="p-3 text-center">
                              {r.isLow ? (
                                <span className="badge bg-red-100 text-red-700 text-xs">Мало</span>
                              ) : (
                                <span className="badge bg-green-100 text-green-700 text-xs">OK</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TECH ORDERS TAB */}
              {activeTab === "techOrders" && techOrdersData && (
                <div>
                  <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Нарядов</p>
                      <p className="text-2xl font-bold">{techOrdersData.orders.length}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Техников</p>
                      <p className="text-2xl font-bold">{techOrdersData.technicians.length}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Всего единиц</p>
                      <p className="text-2xl font-bold">{techOrdersData.orders.reduce((s: number, o: any) => s + o.unitCount, 0)}</p>
                    </div>
                  </div>

                  <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-gray-50 text-xs text-gray-500">
                            <th className="text-left p-2 sticky left-0 bg-gray-50 z-10 min-w-[100px]">Наряд</th>
                            <th className="text-left p-2 min-w-[80px]">Статус</th>
                            <th className="text-left p-2 min-w-[120px]">Клиент</th>
                            <th className="text-left p-2 min-w-[100px]">Врач</th>
                            <th className="text-center p-2 min-w-[50px]">Ед.</th>
                            {techOrdersData.technicians.map(t => (
                              <th key={t.id} className="text-center p-2 min-w-[80px]">
                                <span className="block truncate" title={t.name}>{t.name.split(" ")[0]}</span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {techOrdersData.orders.map((o: any) => (
                            <tr key={o.orderId} className="border-t border-gray-50 hover:bg-gray-50">
                              <td className="p-2 text-sm font-mono font-medium sticky left-0 bg-white z-10">{o.orderNumber}</td>
                              <td className="p-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                  o.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                                  o.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700" :
                                  o.status === "READY" ? "bg-emerald-100 text-emerald-700" :
                                  "bg-gray-100 text-gray-600"
                                }`}>{STATUS_LABELS[o.status] || o.status}</span>
                              </td>
                              <td className="p-2 text-sm truncate max-w-[150px]">{o.client}</td>
                              <td className="p-2 text-sm text-gray-500 truncate max-w-[120px]">{o.doctor || "—"}</td>
                              <td className="p-2 text-sm text-center font-medium">{o.unitCount}</td>
                              {techOrdersData.technicians.map(t => (
                                <td key={t.id} className="p-2 text-sm text-center">
                                  {o.techUnits[t.id] ? (
                                    <span className="inline-block bg-zetta-100 text-zetta-700 text-xs font-medium px-2 py-0.5 rounded-full">{o.techUnits[t.id]}</span>
                                  ) : (
                                    <span className="text-gray-200">—</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* PROFITABILITY TAB */}
              {activeTab === "profitability" && profitData && (
                <div>
                  <div className="grid grid-cols-5 gap-4 mb-6">
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Заказов</p>
                      <p className="text-2xl font-bold">{profitData.summary.totalOrders}</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Выручка</p>
                      <p className="text-2xl font-bold text-green-600">{fmt(profitData.summary.totalRevenue)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Себестоимость</p>
                      <p className="text-2xl font-bold text-red-600">{fmt(profitData.summary.totalCost)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Маржа</p>
                      <p className={`text-2xl font-bold ${profitData.summary.totalMargin >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(profitData.summary.totalMargin)} ₽</p>
                    </div>
                    <div className="card p-4">
                      <p className="text-sm text-gray-500 mb-1">Ср. маржа %</p>
                      <p className={`text-2xl font-bold ${profitData.summary.avgMarginPercent >= 0 ? "text-green-600" : "text-red-600"}`}>{profitData.summary.avgMarginPercent}%</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm text-gray-500">Сортировка:</span>
                    {(["marginPercent", "margin", "revenue"] as const).map(key => (
                      <button
                        key={key}
                        onClick={() => setProfitSort(key)}
                        className={`text-xs px-3 py-1 rounded-full transition-colors ${profitSort === key ? "bg-zetta-100 text-zetta-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                      >
                        {key === "marginPercent" ? "Маржа %" : key === "margin" ? "Маржа ₽" : "Выручка"}
                      </button>
                    ))}
                  </div>

                  <div className="card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500">
                          <th className="text-left p-3">Наряд</th>
                          <th className="text-left p-3">Клиент</th>
                          <th className="text-left p-3">Врач</th>
                          <th className="text-left p-3">Дата</th>
                          <th className="text-right p-3">Выручка</th>
                          <th className="text-right p-3">Работа</th>
                          <th className="text-right p-3">Материалы</th>
                          <th className="text-right p-3">Себестоим.</th>
                          <th className="text-right p-3">Маржа</th>
                          <th className="text-right p-3">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...profitData.orders]
                          .sort((a: any, b: any) => b[profitSort] - a[profitSort])
                          .map((o: any, i: number) => (
                          <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="p-3 text-sm font-mono font-medium">{o.orderNumber}</td>
                            <td className="p-3 text-sm">{o.client}</td>
                            <td className="p-3 text-sm text-gray-500">{o.doctor || "—"}</td>
                            <td className="p-3 text-sm text-gray-500">{o.deliveredAt ? new Date(o.deliveredAt).toLocaleDateString("ru-RU") : "—"}</td>
                            <td className="p-3 text-sm text-right">{fmt(o.revenue)} ₽</td>
                            <td className="p-3 text-sm text-right text-gray-500">{fmt(o.laborCost)} ₽</td>
                            <td className="p-3 text-sm text-right text-gray-500">{fmt(o.materialCost)} ₽</td>
                            <td className="p-3 text-sm text-right">{fmt(o.totalCost)} ₽</td>
                            <td className={`p-3 text-sm text-right font-medium ${o.margin >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(o.margin)} ₽</td>
                            <td className="p-3 text-right">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                o.marginPercent >= 50 ? "bg-green-100 text-green-700" :
                                o.marginPercent >= 20 ? "bg-yellow-100 text-yellow-700" :
                                o.marginPercent >= 0 ? "bg-orange-100 text-orange-700" :
                                "bg-red-100 text-red-700"
                              }`}>{o.marginPercent}%</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Детальный отчёт модалка */}
        {detailClient && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  Детальный отчёт: {detailData?.client?.name || "..."}
                </h2>
                <button onClick={() => { setDetailClient(null); setDetailData(null); }} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
              </div>
              <div className="overflow-auto flex-1 p-4">
                {detailLoading ? (
                  <div className="text-center py-12 text-gray-400">Загрузка...</div>
                ) : !detailData ? (
                  <div className="text-center py-12 text-gray-400">Нет данных</div>
                ) : (
                  <div className="space-y-6">
                    {/* Клиент */}
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div><span className="text-gray-500">Полное название:</span> {detailData.client.fullName}</div>
                      {detailData.client.inn && <div><span className="text-gray-500">ИНН:</span> {detailData.client.inn}</div>}
                      {detailData.client.contractNumber && <div><span className="text-gray-500">Договор:</span> {detailData.client.contractNumber}</div>}
                    </div>

                    {/* Сводка */}
                    <div className="grid grid-cols-5 gap-3">
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">Нарядов</p>
                        <p className="text-lg font-bold">{detailData.summary.totalOrders}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">Сумма</p>
                        <p className="text-lg font-bold">{fmt(detailData.summary.totalAmount)} ₽</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">Скидки</p>
                        <p className="text-lg font-bold text-red-500">-{fmt(detailData.summary.totalDiscount)} ₽</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">Оплачено</p>
                        <p className="text-lg font-bold text-green-600">{fmt(detailData.summary.totalPaid)} ₽</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500">Баланс</p>
                        <p className={`text-lg font-bold ${detailData.summary.balance > 0 ? "text-red-600" : "text-green-600"}`}>
                          {fmt(detailData.summary.balance)} ₽
                        </p>
                      </div>
                    </div>

                    {/* Наряды */}
                    <div>
                      <h3 className="font-medium mb-2">Наряды ({detailData.orders.length})</h3>
                      <div className="space-y-3">
                        {detailData.orders.map((o: any, idx: number) => (
                          <div key={idx} className="border border-gray-100 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <span className="font-mono text-sm font-medium text-zetta-600">{o.orderNumber}</span>
                                <span className="text-xs text-gray-400">{new Date(o.date).toLocaleDateString("ru-RU")}</span>
                                <span className={`badge text-xs ${
                                  o.status === "DELIVERED" ? "bg-green-100 text-green-800" :
                                  o.status === "CANCELLED" ? "bg-gray-200 text-gray-500" :
                                  "bg-blue-100 text-blue-800"
                                }`}>{STATUS_LABELS[o.status] || o.status}</span>
                              </div>
                              <span className="font-medium text-sm">{fmt(o.total)} ₽</span>
                            </div>
                            {o.patient && <p className="text-xs text-gray-500 mb-1">Пациент: {o.patient}</p>}
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400">
                                  <th className="text-left py-1">Код</th>
                                  <th className="text-left py-1">Работа</th>
                                  <th className="text-center py-1">Кол-во</th>
                                  <th className="text-right py-1">Цена</th>
                                  <th className="text-center py-1">Скидка</th>
                                  <th className="text-right py-1">Итого</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.items.map((item: any, iIdx: number) => (
                                  <tr key={iIdx} className="border-t border-gray-50">
                                    <td className="py-1 font-mono">{item.code}</td>
                                    <td className="py-1">{item.name}</td>
                                    <td className="py-1 text-center">{item.quantity}</td>
                                    <td className="py-1 text-right">{fmt(item.price)} ₽</td>
                                    <td className="py-1 text-center">{item.discount > 0 ? `${item.discount}%` : "—"}</td>
                                    <td className="py-1 text-right font-medium">{fmt(item.total)} ₽</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Оплаты */}
                    {detailData.payments.length > 0 && (
                      <div>
                        <h3 className="font-medium mb-2">Оплаты ({detailData.payments.length})</h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400">
                              <th className="text-left py-1">Дата</th>
                              <th className="text-right py-1">Сумма</th>
                              <th className="text-left py-1">Способ</th>
                              <th className="text-left py-1">Примечание</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailData.payments.map((p: any, pIdx: number) => (
                              <tr key={pIdx} className="border-t border-gray-50">
                                <td className="py-1.5">{new Date(p.date).toLocaleDateString("ru-RU")}</td>
                                <td className="py-1.5 text-right font-medium text-green-600">{fmt(p.amount)} ₽</td>
                                <td className="py-1.5 text-gray-500">{p.method}</td>
                                <td className="py-1.5 text-gray-400">{p.notes || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
