"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { PageHeader, TabPanel } from "@/components/ui";
import { authApi, getToken } from "@/lib/api";
import { Calculator, CheckCircle2, Clock, Users, Settings, Save, FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";

type Tab = "records" | "rates" | "departments" | "decomposition";

interface SalaryRecord {
  id: string;
  period: string;
  amount: string | number;
  isPaid: boolean;
  paidAt: string | null;
  details: Array<{
    orderId: string;
    orderNumber: string;
    stageName: string;
    works: string[];
    amount: number;
  }>;
  user: { id: string; firstName: string; lastName: string; role: string };
}

interface Totals {
  total: number;
  paid: number;
  unpaid: number;
}

interface WorkItem {
  id: string;
  code: string;
  name: string;
  basePrice: string | number;
  techPayRate: string | number | null;
  techPayPercent: string | number | null;
  category: { id: string; code: string; name: string } | null;
}

interface DeptTech {
  userId: string;
  name: string;
  department: string | null;
  months: Record<string, number>;
  total: number;
}

interface DeptGroup {
  department: string;
  technicians: DeptTech[];
  total: number;
}

interface ProcessTech {
  userId: string;
  name: string;
  processes: Record<string, number>;
  total: number;
}

const ROLE_LABELS: Record<string, string> = {
  SENIOR_TECH: "Ст. техник", TECHNICIAN: "Техник", CAD_SPECIALIST: "CAD",
  GYPSUM_WORKER: "Гипсовщик", CERAMIST: "Керамист",
};

const PROCESS_LABELS: Record<string, string> = {
  DIGITAL_MODELING: "Цифр. моделир.",
  TECHNICAL: "Техническая",
  AESTHETIC: "Эстетическая",
  MILLING: "Фрезеровка",
  PRINTING: "Печать",
  CASTING: "Литьё",
};

const MONTHS_SHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

const TABS = [
  { key: "records", label: "Ведомость" },
  { key: "rates", label: "Ставки" },
  { key: "departments", label: "По отделам" },
  { key: "decomposition", label: "Декомпозиция" },
];

export default function SalaryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("records");
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [totals, setTotals] = useState<Totals>({ total: 0, paid: 0, unpaid: 0 });
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);

  // Rates tab state
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [editedRates, setEditedRates] = useState<Record<string, { rate: string; percent: string }>>({});
  const [savingRates, setSavingRates] = useState<Record<string, boolean>>({});

  // Department tab state
  const [deptYear, setDeptYear] = useState(new Date().getFullYear());
  const [deptData, setDeptData] = useState<DeptGroup[]>([]);
  const [deptLoading, setDeptLoading] = useState(false);

  // Decomposition tab state
  const [decompYear, setDecompYear] = useState(new Date().getFullYear());
  const [decompMonth, setDecompMonth] = useState(new Date().getMonth() + 1);
  const [decompTechs, setDecompTechs] = useState<ProcessTech[]>([]);
  const [decompTotals, setDecompTotals] = useState<Record<string, number>>({});
  const [decompLoading, setDecompLoading] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi(`/salary/records?period=${selectedPeriod}`);
      if (res.ok) {
        const d = await res.json();
        setRecords(d.data?.records || []);
        setTotals(d.data?.totals || { total: 0, paid: 0, unpaid: 0 });
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [selectedPeriod]);

  const fetchWorkItems = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await authApi("/work-catalog");
      if (res.ok) {
        const d = await res.json();
        setWorkItems(d.data || []);
      }
    } catch (e) { console.error(e); }
    setRatesLoading(false);
  }, []);

  const fetchDeptData = useCallback(async () => {
    setDeptLoading(true);
    try {
      const res = await authApi(`/salary/by-department?year=${deptYear}`);
      if (res.ok) {
        const d = await res.json();
        setDeptData(d.data || []);
      }
    } catch (e) { console.error(e); }
    setDeptLoading(false);
  }, [deptYear]);

  const fetchDecomp = useCallback(async () => {
    setDecompLoading(true);
    try {
      const period = `${decompYear}-${String(decompMonth).padStart(2, "0")}`;
      const res = await authApi(`/salary/decomposition?period=${period}`);
      if (res.ok) {
        const d = await res.json();
        setDecompTechs(d.data?.technicians || []);
        setDecompTotals(d.data?.processTotals || {});
      }
    } catch (e) { console.error(e); }
    setDecompLoading(false);
  }, [decompYear, decompMonth]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);
  useEffect(() => { if (activeTab === "rates") fetchWorkItems(); }, [activeTab, fetchWorkItems]);
  useEffect(() => { if (activeTab === "departments") fetchDeptData(); }, [activeTab, fetchDeptData]);
  useEffect(() => { if (activeTab === "decomposition") fetchDecomp(); }, [activeTab, fetchDecomp]);

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const res = await authApi("/salary/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: selectedPeriod }),
      });
      if (res.ok) fetchRecords();
    } catch (e) { console.error(e); }
    setCalculating(false);
  };

  const handleMarkPaid = async (ids: string[]) => {
    try {
      await authApi("/salary/pay", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      fetchRecords();
    } catch (e) { console.error(e); }
  };

  const handleEditRate = (id: string, field: "rate" | "percent", value: string) => {
    setEditedRates(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const handleSaveRate = async (item: WorkItem) => {
    const edited = editedRates[item.id];
    if (!edited) return;
    setSavingRates(prev => ({ ...prev, [item.id]: true }));
    try {
      const body: Record<string, number | null> = {};
      if (edited.rate !== undefined) {
        body.techPayRate = edited.rate ? parseFloat(edited.rate) : null;
      }
      if (edited.percent !== undefined) {
        body.techPayPercent = edited.percent ? parseFloat(edited.percent) : null;
      }
      const res = await authApi(`/work-catalog/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditedRates(prev => { const n = { ...prev }; delete n[item.id]; return n; });
        fetchWorkItems();
      }
    } catch (e) { console.error(e); }
    setSavingRates(prev => ({ ...prev, [item.id]: false }));
  };

  const fmt = (n: string | number) => Number(n).toLocaleString("ru-RU");

  const periods = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("ru-RU", { year: "numeric", month: "long" });
    periods.push({ value, label });
  }

  const getRateValue = (item: WorkItem, field: "rate" | "percent"): string => {
    const edited = editedRates[item.id];
    if (edited && edited[field] !== undefined) return edited[field];
    if (field === "rate") return item.techPayRate ? String(Number(item.techPayRate)) : "";
    return item.techPayPercent ? String(Number(item.techPayPercent)) : "";
  };

  const isEdited = (id: string) => !!editedRates[id];

  const handleExportRecords = (format: "excel" | "pdf") => {
    const headers = ["Техник", "Роль", "Начислено", "Статус"];
    const rows = records.map(r => [
      `${r.user.lastName} ${r.user.firstName}`,
      ROLE_LABELS[r.user.role] || r.user.role,
      fmt(r.amount),
      r.isPaid ? "Выплачено" : "К выплате",
    ]);
    const title = `Зарплата — ${selectedPeriod}`;
    if (format === "excel") exportToExcel(title, headers, rows);
    else exportToPDF(title, headers, rows);
  };

  // Generate month keys for department tab
  const deptMonthKeys = Array.from({ length: 12 }, (_, i) => `${deptYear}-${String(i + 1).padStart(2, "0")}`);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Зарплата">
            <div className="flex gap-2">
              {activeTab === "records" && records.length > 0 && (
                <>
                  <button onClick={() => handleExportRecords("excel")} className="btn-secondary flex items-center gap-1.5 text-sm">
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                  <button onClick={() => handleExportRecords("pdf")} className="btn-secondary flex items-center gap-1.5 text-sm">
                    <FileText className="w-4 h-4" /> PDF
                  </button>
                </>
              )}
              {activeTab === "records" && (
                <button onClick={handleCalculate} disabled={calculating} className="btn-primary flex items-center gap-2 disabled:opacity-50">
                  <Calculator className="w-4 h-4" />
                  {calculating ? "Расчёт..." : "Рассчитать за период"}
                </button>
              )}
            </div>
          </PageHeader>

          <TabPanel tabs={TABS} active={activeTab} onChange={t => setActiveTab(t as Tab)} variant="pills" />

          {/* RECORDS TAB */}
          {activeTab === "records" && (
            <>
              <div className="flex items-center gap-4 mb-6">
                <select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)} className="input-field w-64">
                  {periods.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">Итого начислено</span>
                    <Users className="w-4 h-4 text-gray-400" />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{fmt(totals.total)} ₽</p>
                </div>
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">Выплачено</span>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  </div>
                  <p className="text-2xl font-bold text-green-600">{fmt(totals.paid)} ₽</p>
                </div>
                <div className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-500">К выплате</span>
                    <Clock className="w-4 h-4 text-orange-500" />
                  </div>
                  <p className="text-2xl font-bold text-orange-600">{fmt(totals.unpaid)} ₽</p>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : records.length === 0 ? (
                <div className="card p-12 text-center">
                  <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-2">Нет данных за этот период</p>
                  <p className="text-sm text-gray-400">Нажмите &quot;Рассчитать за период&quot; для расчёта зарплаты</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {records.map(record => (
                    <div key={record.id} className="card overflow-hidden">
                      <div
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandedRecord(expandedRecord === record.id ? null : record.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${record.isPaid ? "bg-green-500" : "bg-zetta-500"}`}>
                            {record.user.firstName[0]}{record.user.lastName[0]}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{record.user.lastName} {record.user.firstName}</p>
                            <span className="text-xs text-gray-500">{ROLE_LABELS[record.user.role] || record.user.role}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-xl font-bold text-gray-900">{fmt(record.amount)} ₽</p>
                          {record.isPaid ? (
                            <span className="badge bg-green-100 text-green-700">Выплачено</span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleMarkPaid([record.id]); }}
                              className="btn-primary text-xs py-1 px-3"
                            >
                              Выплатить
                            </button>
                          )}
                        </div>
                      </div>

                      {expandedRecord === record.id && record.details && (
                        <div className="border-t border-gray-100 bg-gray-50 p-4">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Детализация</h4>
                          {(record.details as Array<{ orderNumber: string; stageName: string; works: string[]; amount: number }>).length === 0 ? (
                            <p className="text-sm text-gray-400">Нет выполненных работ за период</p>
                          ) : (
                            <div className="space-y-2">
                              {(record.details as Array<{ orderId: string; orderNumber: string; stageName: string; works: string[]; amount: number }>).map((d, idx) => (
                                <div key={idx} className="bg-white rounded-lg p-3 text-sm flex items-center justify-between">
                                  <div>
                                    <span className="font-mono text-zetta-600">{d.orderNumber}</span>
                                    <span className="text-gray-500 ml-2">{d.stageName}</span>
                                    {d.works.length > 0 && (
                                      <p className="text-xs text-gray-400 mt-0.5">{d.works.join(", ")}</p>
                                    )}
                                  </div>
                                  <span className="font-medium">{fmt(d.amount)} ₽</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {records.some(r => !r.isPaid) && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleMarkPaid(records.filter(r => !r.isPaid).map(r => r.id))}
                        className="btn-primary"
                      >
                        Выплатить всем ({fmt(totals.unpaid)} ₽)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* RATES TAB */}
          {activeTab === "rates" && (
            <>
              <div className="card p-4 mb-6 bg-blue-50 border-blue-200">
                <p className="text-sm text-blue-700">
                  Настройте ставки оплаты техникам за каждый вид работы. Можно указать фиксированную ставку за единицу или процент от стоимости работы.
                  При расчёте зарплаты фиксированная ставка имеет приоритет над процентом.
                </p>
              </div>

              {ratesLoading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500">
                        <th className="text-left p-3 w-20">Код</th>
                        <th className="text-left p-3">Работа</th>
                        <th className="text-left p-3 w-36">Категория</th>
                        <th className="text-right p-3 w-28">Цена</th>
                        <th className="text-center p-3 w-36">Ставка (₽/ед.)</th>
                        <th className="text-center p-3 w-32">Процент (%)</th>
                        <th className="text-center p-3 w-28">Итого*</th>
                        <th className="text-center p-3 w-20"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {workItems.map(item => {
                        const rate = getRateValue(item, "rate");
                        const percent = getRateValue(item, "percent");
                        const basePrice = Number(item.basePrice);
                        const calcPay = rate ? Number(rate) : (percent ? basePrice * Number(percent) / 100 : 0);
                        return (
                          <tr key={item.id} className="border-t border-gray-50 hover:bg-gray-50">
                            <td className="p-3 text-sm font-mono text-gray-500">{item.code}</td>
                            <td className="p-3 text-sm font-medium">{item.name}</td>
                            <td className="p-3 text-sm text-gray-500">{item.category?.name || "—"}</td>
                            <td className="p-3 text-sm text-right">{fmt(basePrice)} ₽</td>
                            <td className="p-3">
                              <input
                                type="number"
                                value={rate}
                                onChange={(e) => handleEditRate(item.id, "rate", e.target.value)}
                                placeholder="0"
                                className="input-field w-full text-center text-sm"
                                min="0"
                                step="10"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="number"
                                value={percent}
                                onChange={(e) => handleEditRate(item.id, "percent", e.target.value)}
                                placeholder="0"
                                className="input-field w-full text-center text-sm"
                                min="0"
                                max="100"
                                step="1"
                              />
                            </td>
                            <td className="p-3 text-sm text-center font-medium">
                              {calcPay > 0 ? (
                                <span className="text-green-600">{fmt(calcPay)} ₽</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {isEdited(item.id) && (
                                <button
                                  onClick={() => handleSaveRate(item)}
                                  disabled={savingRates[item.id]}
                                  className="text-zetta-600 hover:text-zetta-700 disabled:opacity-50"
                                  title="Сохранить"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {workItems.length === 0 && (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-400 text-sm">
                            Нет работ в каталоге
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="p-3 border-t border-gray-100 bg-gray-50">
                    <p className="text-xs text-gray-400">* Расчётная оплата технику за 1 единицу работы. Фиксированная ставка имеет приоритет над процентом.</p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* DEPARTMENTS TAB */}
          {activeTab === "departments" && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => setDeptYear(y => y - 1)} className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">&#8592;</button>
                <span className="text-lg font-semibold text-gray-900">{deptYear}</span>
                <button onClick={() => setDeptYear(y => y + 1)} className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-600 hover:bg-gray-50">&#8594;</button>
              </div>

              {deptLoading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : deptData.length === 0 ? (
                <div className="card p-12 text-center text-gray-400">Нет данных о зарплатах за {deptYear} год</div>
              ) : (
                <div className="space-y-6">
                  {deptData.map(group => (
                    <div key={group.department} className="card overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-700">{group.department}</h3>
                        <span className="text-sm font-medium text-gray-900">{fmt(group.total)} ₽</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100 text-gray-500 text-xs">
                              <th className="text-left px-4 py-2 sticky left-0 bg-white min-w-[160px]">Техник</th>
                              {MONTHS_SHORT.map((m, i) => (
                                <th key={i} className="text-right px-3 py-2 min-w-[80px]">{m}</th>
                              ))}
                              <th className="text-right px-4 py-2 min-w-[100px] font-semibold">Итого</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.technicians.map(tech => (
                              <tr key={tech.userId} className="border-b border-gray-50 hover:bg-gray-50">
                                <td className="px-4 py-2 text-gray-900 font-medium sticky left-0 bg-white">{tech.name}</td>
                                {deptMonthKeys.map(mk => (
                                  <td key={mk} className="px-3 py-2 text-right text-gray-600 font-mono text-xs">
                                    {tech.months[mk] ? fmt(tech.months[mk]) : "—"}
                                  </td>
                                ))}
                                <td className="px-4 py-2 text-right text-gray-900 font-semibold">{fmt(tech.total)} ₽</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* DECOMPOSITION TAB */}
          {activeTab === "decomposition" && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <select value={`${decompYear}-${String(decompMonth).padStart(2, "0")}`}
                  onChange={e => {
                    const [y, m] = e.target.value.split("-");
                    setDecompYear(parseInt(y));
                    setDecompMonth(parseInt(m));
                  }}
                  className="input-field w-64">
                  {periods.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>

              {decompLoading ? (
                <div className="text-center py-12 text-gray-400">Загрузка...</div>
              ) : decompTechs.length === 0 ? (
                <div className="card p-12 text-center text-gray-400">Нет данных по процессам за выбранный период</div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100 text-gray-500 text-xs uppercase">
                          <th className="text-left px-4 py-3 sticky left-0 bg-gray-50 min-w-[160px]">Техник</th>
                          {Object.entries(PROCESS_LABELS).map(([key, label]) => (
                            <th key={key} className="text-right px-3 py-3 min-w-[100px]">{label}</th>
                          ))}
                          <th className="text-right px-4 py-3 min-w-[100px]">Итого</th>
                        </tr>
                      </thead>
                      <tbody>
                        {decompTechs.map(tech => (
                          <tr key={tech.userId} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-3 text-gray-900 font-medium sticky left-0 bg-white">{tech.name}</td>
                            {Object.keys(PROCESS_LABELS).map(pk => (
                              <td key={pk} className="px-3 py-3 text-right text-gray-600 font-mono text-xs">
                                {tech.processes[pk] ? fmt(tech.processes[pk]) : "—"}
                              </td>
                            ))}
                            <td className="px-4 py-3 text-right text-gray-900 font-semibold">{fmt(tech.total)} ₽</td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                          <td className="px-4 py-3 text-gray-700 sticky left-0 bg-gray-50">Итого</td>
                          {Object.keys(PROCESS_LABELS).map(pk => (
                            <td key={pk} className="px-3 py-3 text-right text-gray-900 font-mono text-xs">
                              {decompTotals[pk] ? fmt(decompTotals[pk]) : "—"}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right text-gray-900">
                            {fmt(Object.values(decompTotals).reduce((s, v) => s + v, 0))} ₽
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
