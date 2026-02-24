"use client";
import { useEffect, useState, useCallback } from "react";
import { authApi } from "@/lib/api";
import Sidebar from "@/components/Sidebar";
import { PageHeader, TabPanel, StatsCard } from "@/components/ui";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Area,
} from "recharts";
import type { PieLabelRenderProps } from "recharts";

const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#f97316", "#14b8a6", "#a855f7",
  "#64748b", "#84cc16", "#e11d48", "#0ea5e9", "#d946ef", "#facc15", "#fb923c", "#2dd4bf", "#818cf8", "#f472b6"];

interface RevenueMonth { month: string; revenue: number; expenses: number; profit: number }
interface OrderMonth { month: string; count: number; amount: number }
interface DeadlineSummary { total: number; onTime: number; late: number; onTimeRate: number; avgDelay: number }
interface ClientDeadline { name: string; total: number; onTime: number; onTimeRate: number; avgDelay: number }
interface Technician {
  id: string; name: string; department: string | null; role: string;
  stagesCompleted: number; salary: number; reworks: number; reworkCost: number; reworkRate: number;
}
interface ForecastPoint { month: string; actual?: number; forecast?: number }
interface ClientDist { name: string; count: number; revenue: number }
interface DoctorRow {
  doctorId: string; doctorName: string; specialty: string | null;
  clientName: string; revenue: number; count: number; avgCheck: number; percent: number;
}
interface DailyRow {
  date: string; dayOfWeek: string; ordersCount: number; ordersAmount: number;
  paymentsAmount: number; cumulative: number;
}

const ROLE_LABELS: Record<string, string> = {
  SENIOR_TECH: "Ст. техник", TECHNICIAN: "Техник", CAD_SPECIALIST: "CAD",
  GYPSUM_WORKER: "Гипсовщик", CERAMIST: "Керамист",
};

const TABS = [
  { key: "revenue", label: "Доходы" },
  { key: "doctors", label: "Врачи" },
  { key: "deadlines", label: "Сроки" },
  { key: "forecast", label: "Прогнозы" },
  { key: "technicians", label: "Техники" },
];

const tooltipStyle = { backgroundColor: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" };
const tickStyle = { fill: "#6b7280", fontSize: 12 };
const gridStroke = "#e5e7eb";

export default function AnalyticsPage() {
  const [tab, setTab] = useState("revenue");
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [revenueView, setRevenueView] = useState<"months" | "days">("months");
  const [dailyMonth, setDailyMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  // Revenue
  const [revMonths, setRevMonths] = useState<RevenueMonth[]>([]);
  const [ordMonths, setOrdMonths] = useState<OrderMonth[]>([]);

  // Daily
  const [dailyData, setDailyData] = useState<DailyRow[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);

  // Deadlines
  const [dlSummary, setDlSummary] = useState<DeadlineSummary | null>(null);
  const [dlClients, setDlClients] = useState<ClientDeadline[]>([]);

  // Technicians
  const [techs, setTechs] = useState<Technician[]>([]);

  // Forecast
  const [revForecast, setRevForecast] = useState<ForecastPoint[]>([]);
  const [ordForecast, setOrdForecast] = useState<ForecastPoint[]>([]);
  const [revTrend, setRevTrend] = useState("up");
  const [ordTrend, setOrdTrend] = useState("up");

  // Clients
  const [clientDist, setClientDist] = useState<ClientDist[]>([]);

  // Doctors
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [doctorClient, setDoctorClient] = useState("");

  const fetchRevenue = useCallback(async () => {
    try {
      const res = await authApi(`/analytics/revenue?year=${year}`);
      if (res.ok) {
        const d = (await res.json()).data;
        setRevMonths(d.months);
        setOrdMonths(d.ordersByMonth);
      }
    } catch { /* ignore */ }
  }, [year]);

  const fetchDeadlines = useCallback(async () => {
    try {
      const res = await authApi(`/analytics/deadlines?dateFrom=${year}-01-01&dateTo=${year}-12-31`);
      if (res.ok) {
        const d = (await res.json()).data;
        setDlSummary(d.summary);
        setDlClients(d.byClient || []);
      }
    } catch { /* ignore */ }
  }, [year]);

  const fetchTechnicians = useCallback(async () => {
    try {
      const res = await authApi(`/analytics/technicians?dateFrom=${year}-01-01&dateTo=${year}-12-31`);
      if (res.ok) setTechs((await res.json()).data);
    } catch { /* ignore */ }
  }, [year]);

  const fetchForecast = useCallback(async () => {
    try {
      const res = await authApi("/analytics/forecast?months=3");
      if (res.ok) {
        const d = (await res.json()).data;
        const revAll: ForecastPoint[] = [
          ...d.revenue.history.map((h: { month: string; actual: number }) => ({ month: h.month, actual: h.actual })),
          ...d.revenue.forecast.map((f: { month: string; forecast: number }) => ({ month: f.month, forecast: f.forecast })),
        ];
        if (d.revenue.history.length > 0 && d.revenue.forecast.length > 0) {
          const lastActual = d.revenue.history[d.revenue.history.length - 1];
          revAll[d.revenue.history.length - 1] = { ...revAll[d.revenue.history.length - 1], forecast: lastActual.actual };
        }
        setRevForecast(revAll);
        setRevTrend(d.revenue.trend);

        const ordAll: ForecastPoint[] = [
          ...d.orders.history.map((h: { month: string; actual: number }) => ({ month: h.month, actual: h.actual })),
          ...d.orders.forecast.map((f: { month: string; forecast: number }) => ({ month: f.month, forecast: f.forecast })),
        ];
        if (d.orders.history.length > 0 && d.orders.forecast.length > 0) {
          const lastA = d.orders.history[d.orders.history.length - 1];
          ordAll[d.orders.history.length - 1] = { ...ordAll[d.orders.history.length - 1], forecast: lastA.actual };
        }
        setOrdForecast(ordAll);
        setOrdTrend(d.orders.trend);
      }
    } catch { /* ignore */ }
  }, []);

  const fetchClients = useCallback(async () => {
    try {
      const res = await authApi(`/analytics/clients?year=${year}`);
      if (res.ok) setClientDist((await res.json()).data.clients);
    } catch { /* ignore */ }
  }, [year]);

  const fetchDoctors = useCallback(async () => {
    setDoctorsLoading(true);
    try {
      const params = new URLSearchParams({
        dateFrom: `${year}-01-01`,
        dateTo: `${year}-12-31`,
      });
      if (doctorClient) params.set("clientId", doctorClient);
      const res = await authApi(`/analytics/doctors?${params}`);
      if (res.ok) setDoctors((await res.json()).data || []);
    } catch { /* ignore */ }
    setDoctorsLoading(false);
  }, [year, doctorClient]);

  const fetchDaily = useCallback(async () => {
    setDailyLoading(true);
    try {
      const res = await authApi(`/analytics/daily?month=${dailyMonth}`);
      if (res.ok) setDailyData((await res.json()).data || []);
    } catch { /* ignore */ }
    setDailyLoading(false);
  }, [dailyMonth]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchRevenue(), fetchDeadlines(), fetchTechnicians(), fetchForecast(), fetchClients()])
      .finally(() => setLoading(false));
  }, [fetchRevenue, fetchDeadlines, fetchTechnicians, fetchForecast, fetchClients]);

  useEffect(() => {
    if (tab === "doctors") fetchDoctors();
  }, [tab, fetchDoctors]);

  useEffect(() => {
    if (revenueView === "days") fetchDaily();
  }, [revenueView, fetchDaily]);

  const handleExportAnalytics = (format: "excel" | "pdf") => {
    if (tab === "revenue" && revenueView === "months") {
      const h = ["Месяц", "Выручка", "Расходы", "Прибыль"];
      const r = revMonths.map(m => [monthLabel(m.month), m.revenue, m.expenses, m.profit]);
      if (format === "excel") exportToExcel(`Доходы ${year}`, h, r);
      else exportToPDF(`Доходы ${year}`, h, r);
    } else if (tab === "doctors") {
      const h = ["#", "Врач", "Специальность", "Клиника", "Выручка", "Заказов", "Ср. чек", "%"];
      const r = doctors.map((d, i) => [i + 1, d.doctorName, d.specialty || "—", d.clientName, d.revenue, d.count, d.avgCheck, d.percent]);
      if (format === "excel") exportToExcel(`Врачи ${year}`, h, r);
      else exportToPDF(`Врачи ${year}`, h, r);
    } else if (tab === "technicians") {
      const h = ["Техник", "Отдел", "Этапов", "ЗП", "Переделки", "Стоимость брака", "% брака"];
      const r = techs.map(t => [t.name, t.department || ROLE_LABELS[t.role] || t.role, t.stagesCompleted, t.salary, t.reworks, t.reworkCost, t.reworkRate]);
      if (format === "excel") exportToExcel(`Техники ${year}`, h, r);
      else exportToPDF(`Техники ${year}`, h, r);
    }
  };

  const fmtMoney = (n: number) => n >= 1000000
    ? `${(n / 1000000).toFixed(1)} млн`
    : n >= 1000 ? `${Math.round(n / 1000)} тыс` : String(n);
  const fmtK = (n: number) => `${(n / 1000).toFixed(0)}k`;
  const fmtNum = (n: number) => n.toLocaleString("ru-RU");
  const monthLabel = (m: string) => MONTHS_SHORT[parseInt(m.split("-")[1]) - 1] || m;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <PageHeader title="Аналитика" subtitle="Графики, тренды и прогнозы">
            <div className="flex items-center gap-3">
              {(tab === "revenue" || tab === "doctors" || tab === "technicians") && (
                <>
                  <button onClick={() => handleExportAnalytics("excel")} className="btn-secondary text-sm px-3 py-1.5">Excel</button>
                  <button onClick={() => handleExportAnalytics("pdf")} className="btn-secondary text-sm px-3 py-1.5">PDF</button>
                </>
              )}
              <button onClick={() => setYear(y => y - 1)} className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">&#8592;</button>
              <span className="text-lg font-semibold text-gray-900">{year}</span>
              <button onClick={() => setYear(y => y + 1)} className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">&#8594;</button>
            </div>
          </PageHeader>

          <TabPanel
            tabs={TABS}
            active={tab}
            onChange={setTab}
            variant="pills"
          />

          {loading ? (
            <div className="text-center py-20 text-gray-400">Загрузка...</div>
          ) : tab === "revenue" ? (
            <div className="space-y-6">
              {/* View toggle */}
              <div className="flex items-center gap-2">
                <button onClick={() => setRevenueView("months")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${revenueView === "months" ? "bg-zetta-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  По месяцам
                </button>
                <button onClick={() => setRevenueView("days")}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${revenueView === "days" ? "bg-zetta-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  По дням
                </button>
                {revenueView === "days" && (
                  <input type="month" value={dailyMonth} onChange={e => setDailyMonth(e.target.value)}
                    className="input-field ml-2 w-44" />
                )}
              </div>

              {revenueView === "months" ? (
                <>
                  {/* Revenue / Expenses / Profit */}
                  <div className="card p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Выручка / Расходы / Прибыль</h3>
                    <ResponsiveContainer width="100%" height={350}>
                      <ComposedChart data={revMonths}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                        <XAxis dataKey="month" tick={tickStyle} tickFormatter={monthLabel} />
                        <YAxis tick={tickStyle} tickFormatter={fmtK} />
                        <Tooltip contentStyle={tooltipStyle}
                          formatter={(v: unknown, name: unknown) => [`${Number(v).toLocaleString("ru-RU")} ₽`, String(name) === "revenue" ? "Выручка" : String(name) === "expenses" ? "Расходы" : "Прибыль"]}
                          labelFormatter={(v: unknown) => monthLabel(String(v))} />
                        <Legend formatter={(v: unknown) => String(v) === "revenue" ? "Выручка" : String(v) === "expenses" ? "Расходы" : "Прибыль"} />
                        <Bar dataKey="revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="profit" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Orders volume + Clients pie */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="card p-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-4">Объём заказов (шт.)</h3>
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={ordMonths}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                          <XAxis dataKey="month" tick={tickStyle} tickFormatter={monthLabel} />
                          <YAxis tick={tickStyle} />
                          <Tooltip contentStyle={tooltipStyle}
                            formatter={(v: unknown) => [Number(v), "Заказов"]} labelFormatter={(v: unknown) => monthLabel(String(v))} />
                          <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="card p-6">
                      <h3 className="text-sm font-semibold text-gray-700 mb-4">Топ клиентов по выручке</h3>
                      {clientDist.length === 0 ? (
                        <p className="text-gray-400 text-sm text-center py-10">Нет данных</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={250}>
                          <PieChart>
                            <Pie data={clientDist.slice(0, 8)} dataKey="revenue" nameKey="name" cx="50%" cy="50%"
                              outerRadius={90} label={(props: PieLabelRenderProps) => `${String(props.name || "").substring(0, 12)} ${((Number(props.percent) || 0) * 100).toFixed(0)}%`}
                              labelLine={{ stroke: "#9ca3af" }}>
                              {clientDist.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle}
                              formatter={(v: unknown) => [`${Number(v).toLocaleString("ru-RU")} ₽`, "Выручка"]} />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* Daily view */
                <div className="card p-6">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">Дневные объёмы</h3>
                  {dailyLoading ? (
                    <div className="text-center py-12 text-gray-400">Загрузка...</div>
                  ) : dailyData.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-10">Нет данных за выбранный месяц</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={dailyData}>
                          <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                          <XAxis dataKey="date" tick={tickStyle} tickFormatter={v => String(v).split("-")[2]} />
                          <YAxis tick={tickStyle} tickFormatter={fmtK} />
                          <Tooltip contentStyle={tooltipStyle}
                            formatter={(v: unknown, name: unknown) => [`${Number(v).toLocaleString("ru-RU")} ₽`, String(name) === "ordersAmount" ? "Заказы" : String(name) === "cumulative" ? "Накопительно" : "Оплаты"]}
                            labelFormatter={(v: unknown) => `${String(v)} (${dailyData.find(d => d.date === String(v))?.dayOfWeek || ""})`} />
                          <Legend formatter={(v: unknown) => String(v) === "ordersAmount" ? "Заказы" : String(v) === "cumulative" ? "Накопительно" : "Оплаты"} />
                          <Bar dataKey="ordersAmount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                          <Line type="monotone" dataKey="cumulative" stroke="#22c55e" strokeWidth={2} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-500 text-xs uppercase">
                              <th className="text-left px-3 py-2">Дата</th>
                              <th className="text-left px-3 py-2">День</th>
                              <th className="text-right px-3 py-2">Заказов</th>
                              <th className="text-right px-3 py-2">Сумма</th>
                              <th className="text-right px-3 py-2">Оплаты</th>
                              <th className="text-right px-3 py-2">Накопительно</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyData.map(d => (
                              <tr key={d.date} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="px-3 py-2 text-gray-900 font-mono text-xs">{d.date}</td>
                                <td className="px-3 py-2 text-gray-500">{d.dayOfWeek}</td>
                                <td className="px-3 py-2 text-right text-gray-700">{d.ordersCount}</td>
                                <td className="px-3 py-2 text-right text-gray-900 font-medium">{fmtNum(d.ordersAmount)} ₽</td>
                                <td className="px-3 py-2 text-right text-green-600">{fmtNum(d.paymentsAmount)} ₽</td>
                                <td className="px-3 py-2 text-right text-zetta-600 font-medium">{fmtNum(d.cumulative)} ₽</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : tab === "doctors" ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <select value={doctorClient} onChange={e => setDoctorClient(e.target.value)}
                  className="input-field w-64">
                  <option value="">Все клиники</option>
                  {clientDist.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </select>
              </div>

              {doctorsLoading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : doctors.length === 0 ? (
                <div className="card p-12 text-center text-gray-400">Нет данных о врачах за выбранный период</div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase">
                        <th className="text-left px-4 py-3">#</th>
                        <th className="text-left px-4 py-3">Врач</th>
                        <th className="text-left px-4 py-3">Специальность</th>
                        <th className="text-left px-4 py-3">Клиника</th>
                        <th className="text-right px-4 py-3">Выручка</th>
                        <th className="text-right px-4 py-3">Заказов</th>
                        <th className="text-right px-4 py-3">Ср. чек</th>
                        <th className="text-right px-4 py-3">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doctors.map((d, i) => (
                        <tr key={d.doctorId} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{d.doctorName}</td>
                          <td className="px-4 py-3 text-gray-500">{d.specialty || "—"}</td>
                          <td className="px-4 py-3 text-gray-600">{d.clientName}</td>
                          <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmtNum(d.revenue)} ₽</td>
                          <td className="px-4 py-3 text-right text-zetta-600">{d.count}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{fmtNum(d.avgCheck)} ₽</td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-zetta-50 text-zetta-700">{d.percent}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : tab === "deadlines" ? (
            <div className="space-y-6">
              {dlSummary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <StatsCard label="Всего сдано" value={dlSummary.total} />
                  <StatsCard label="Вовремя" value={dlSummary.onTime} color="green" />
                  <StatsCard label="С опозданием" value={dlSummary.late} color="red" />
                  <StatsCard label="% вовремя" value={`${dlSummary.onTimeRate}%`}
                    color={dlSummary.onTimeRate >= 80 ? "green" : dlSummary.onTimeRate >= 60 ? "yellow" : "red"} />
                  <StatsCard label="Ср. задержка" value={`${dlSummary.avgDelay} дн.`} color="yellow" />
                </div>
              )}

              <div className="card p-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">Сроки по клиентам</h3>
                {dlClients.length === 0 ? (
                  <p className="text-gray-400 text-sm">Нет данных</p>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(300, dlClients.length * 35)}>
                    <BarChart data={dlClients} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis type="number" tick={tickStyle} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} width={120} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="onTime" name="Вовремя" fill="#22c55e" stackId="a" />
                      <Bar dataKey="total" name="Всего" fill="#6366f1" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          ) : tab === "forecast" ? (
            <div className="space-y-6">
              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Прогноз выручки</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${revTrend === "up" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {revTrend === "up" ? "Рост" : "Снижение"}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={350}>
                  <ComposedChart data={revForecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="month" tick={tickStyle} tickFormatter={monthLabel} />
                    <YAxis tick={tickStyle} tickFormatter={fmtK} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: unknown, name: unknown) => [`${Number(v).toLocaleString("ru-RU")} ₽`, String(name) === "actual" ? "Факт" : "Прогноз"]}
                      labelFormatter={(v: unknown) => monthLabel(String(v))} />
                    <Legend formatter={(v: unknown) => String(v) === "actual" ? "Факт" : "Прогноз"} />
                    <Area type="monotone" dataKey="actual" fill="#6366f1" fillOpacity={0.15} stroke="#6366f1" strokeWidth={2} />
                    <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 4, fill: "#f59e0b" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="card p-6">
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700">Прогноз заказов</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ordTrend === "up" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {ordTrend === "up" ? "Рост" : "Снижение"}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={ordForecast}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                    <XAxis dataKey="month" tick={tickStyle} tickFormatter={monthLabel} />
                    <YAxis tick={tickStyle} />
                    <Tooltip contentStyle={tooltipStyle}
                      formatter={(v: unknown, name: unknown) => [Number(v), String(name) === "actual" ? "Факт" : "Прогноз"]}
                      labelFormatter={(v: unknown) => monthLabel(String(v))} />
                    <Legend formatter={(v: unknown) => String(v) === "actual" ? "Факт" : "Прогноз"} />
                    <Area type="monotone" dataKey="actual" fill="#8b5cf6" fillOpacity={0.15} stroke="#8b5cf6" strokeWidth={2} />
                    <Line type="monotone" dataKey="forecast" stroke="#f59e0b" strokeWidth={2} strokeDasharray="8 4" dot={{ r: 4, fill: "#f59e0b" }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            /* Technicians tab */
            <div className="space-y-6">
              {techs.length === 0 ? (
                <div className="card p-12 text-center text-gray-400">Нет данных о работе техников за выбранный период</div>
              ) : (
                <>
                  <div className="card p-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-4">Выполненные этапы</h3>
                    <ResponsiveContainer width="100%" height={Math.max(300, techs.length * 40)}>
                      <BarChart data={techs} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                        <XAxis type="number" tick={tickStyle} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "#6b7280", fontSize: 11 }} width={140} />
                        <Tooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="stagesCompleted" name="Этапов" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase">
                          <th className="text-left px-4 py-3">Техник</th>
                          <th className="text-left px-4 py-3">Отдел</th>
                          <th className="text-right px-4 py-3">Этапов</th>
                          <th className="text-right px-4 py-3">ЗП</th>
                          <th className="text-right px-4 py-3">Переделки</th>
                          <th className="text-right px-4 py-3">Стоимость брака</th>
                          <th className="text-right px-4 py-3">% брака</th>
                        </tr>
                      </thead>
                      <tbody>
                        {techs.map(t => (
                          <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-900 font-medium">{t.name}</td>
                            <td className="px-4 py-3 text-gray-500">{t.department || ROLE_LABELS[t.role] || t.role}</td>
                            <td className="px-4 py-3 text-right text-zetta-600 font-mono">{t.stagesCompleted}</td>
                            <td className="px-4 py-3 text-right text-gray-700">{t.salary > 0 ? `${t.salary.toLocaleString("ru-RU")} ₽` : "—"}</td>
                            <td className="px-4 py-3 text-right text-red-600">{t.reworks || "—"}</td>
                            <td className="px-4 py-3 text-right text-orange-600">{t.reworkCost > 0 ? `${t.reworkCost.toLocaleString("ru-RU")} ₽` : "—"}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                t.reworkRate === 0 ? "bg-green-100 text-green-700" :
                                t.reworkRate < 5 ? "bg-yellow-100 text-yellow-700" :
                                "bg-red-100 text-red-700"
                              }`}>
                                {t.reworkRate}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
