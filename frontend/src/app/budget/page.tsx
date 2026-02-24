"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import { TrendingUp, TrendingDown, DollarSign, Calendar, Edit3, Save, X, ChevronDown, ChevronUp, FileSpreadsheet } from "lucide-react";
import { PageHeader, TabPanel } from "@/components/ui";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";

interface PLRow {
  category: string;
  label: string;
  type: "income" | "expense";
  plan: number;
  fact: number;
  variance: number;
  variancePercent: number;
}

interface PLSummary {
  revenue: number;
  expenses: number;
  profit: number;
  marginPercent: number;
  planRevenue: number;
  planExpenses: number;
  planProfit: number;
}

interface MonthData {
  period: string;
  revenue: number;
  expenses: number;
  profit: number;
  marginPercent: number;
}

interface CreditItem {
  id: string;
  name: string;
  lender: string | null;
  totalAmount: string | number;
  remainingAmount: string | number;
  monthlyPayment: string | number | null;
  interestRate: string | number | null;
  isActive: boolean;
  startDate: string;
  endDate: string | null;
}

const MONTHS = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

type TabType = "pl" | "monthly" | "credits";

export default function BudgetPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("pl");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // P&L data
  const [plRows, setPlRows] = useState<PLRow[]>([]);
  const [plSummary, setPlSummary] = useState<PLSummary | null>(null);

  // Monthly data
  const [monthlyData, setMonthlyData] = useState<MonthData[]>([]);
  const [ytd, setYtd] = useState<{ revenue: number; expenses: number; profit: number; marginPercent: number } | null>(null);

  // Credits
  const [credits, setCredits] = useState<CreditItem[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [totalMonthly, setTotalMonthly] = useState(0);
  const [expandedCredit, setExpandedCredit] = useState<string | null>(null);
  const [creditDetail, setCreditDetail] = useState<any>(null);

  // Plan editing
  const [editing, setEditing] = useState(false);
  const [planEdits, setPlanEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const handleExportBudget = (format: "excel" | "pdf") => {
    if (tab === "pl") {
      const headers = ["Статья", "План", "Факт", "Отклонение", "%"];
      const rows = plRows.map(r => [r.label, r.plan > 0 ? fmt(r.plan) : "—", r.fact > 0 ? fmt(r.fact) : "—", fmt(r.variance), r.plan > 0 ? `${r.variancePercent}%` : "—"]);
      const title = `P&L — ${MONTHS[month - 1]} ${year}`;
      if (format === "excel") exportToExcel(title, headers, rows);
      else exportToPDF(title, headers, rows);
    } else if (tab === "monthly") {
      const headers = ["Месяц", "Выручка", "Расходы", "Прибыль", "Маржа"];
      const rows = monthlyData.map((m, i) => [MONTHS[i], fmt(m.revenue), fmt(m.expenses), fmt(m.profit), `${m.marginPercent}%`]);
      if (format === "excel") exportToExcel(`Бюджет по месяцам ${year}`, headers, rows);
      else exportToPDF(`Бюджет по месяцам ${year}`, headers, rows);
    } else if (tab === "credits") {
      const headers = ["Название", "Кредитор", "Сумма", "Остаток", "Платёж/мес", "Ставка"];
      const rows = credits.map(c => [c.name, c.lender || "—", fmt(Number(c.totalAmount)), fmt(Number(c.remainingAmount)), c.monthlyPayment ? fmt(Number(c.monthlyPayment)) : "—", c.interestRate ? `${c.interestRate}%` : "—"]);
      if (format === "excel") exportToExcel("Кредиты", headers, rows);
      else exportToPDF("Кредиты", headers, rows);
    }
  };

  const fetchPL = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi(`/budget/pl?year=${year}&month=${String(month).padStart(2, "0")}`);
      if (res.ok) {
        const d = await res.json();
        setPlRows(d.data.rows || []);
        setPlSummary(d.data.summary || null);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [year, month]);

  const fetchMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi(`/budget/pl-monthly?year=${year}`);
      if (res.ok) {
        const d = await res.json();
        setMonthlyData(d.data.months || []);
        setYtd(d.data.ytd || null);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [year]);

  const fetchCredits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi("/credits?isActive=true");
      if (res.ok) {
        const d = await res.json();
        setCredits(d.data.credits || []);
        setTotalDebt(d.data.totalDebt || 0);
        setTotalMonthly(d.data.totalMonthly || 0);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (tab === "pl") fetchPL();
    else if (tab === "monthly") fetchMonthly();
    else if (tab === "credits") fetchCredits();
  }, [tab, fetchPL, fetchMonthly, fetchCredits]);

  const toggleCreditExpand = async (creditId: string) => {
    if (expandedCredit === creditId) {
      setExpandedCredit(null);
      setCreditDetail(null);
      return;
    }
    setExpandedCredit(creditId);
    setCreditDetail(null);
    try {
      const res = await authApi(`/credits/${creditId}`);
      if (res.ok) {
        const d = await res.json();
        setCreditDetail(d.data);
      }
    } catch (e) { console.error(e); }
  };

  // Group payments by month for monthly grid
  const getMonthlyPayments = (payments: any[]) => {
    const map = new Map<string, { amount: number; principal: number; interest: number }>();
    for (const p of payments) {
      const d = new Date(p.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = map.get(key) || { amount: 0, principal: 0, interest: 0 };
      existing.amount += Number(p.amount);
      existing.principal += Number(p.principal || 0);
      existing.interest += Number(p.interest || 0);
      map.set(key, existing);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  };

  const startEditing = () => {
    const edits: Record<string, string> = {};
    plRows.forEach(r => { edits[r.category] = String(r.plan || ""); });
    setPlanEdits(edits);
    setEditing(true);
  };

  const savePlan = async () => {
    setSaving(true);
    try {
      const targets = Object.entries(planEdits)
        .filter(([, v]) => v !== "")
        .map(([category, amount]) => ({
          period: `${year}-${String(month).padStart(2, "0")}`,
          category,
          amount: parseFloat(amount) || 0,
        }));

      await authApi("/budget/targets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets }),
      });

      setEditing(false);
      fetchPL();
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  if (loading && !plRows.length && !monthlyData.length) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center"><p className="text-gray-400">Загрузка...</p></main>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Бюджет и P&L">
            <div className="flex items-center gap-3">
              <button onClick={() => handleExportBudget("excel")} className="btn-secondary flex items-center gap-1.5 text-sm">
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="input-field w-28">
                {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {tab === "pl" && (
                <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="input-field w-36">
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              )}
            </div>
          </PageHeader>

          {/* Summary cards */}
          {plSummary && tab === "pl" && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Выручка</span>
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-green-600">{fmt(plSummary.revenue)} ₽</p>
                {plSummary.planRevenue > 0 && (
                  <p className="text-xs text-gray-400 mt-1">План: {fmt(plSummary.planRevenue)} ₽</p>
                )}
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Расходы</span>
                  <TrendingDown className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-2xl font-bold text-red-600">{fmt(plSummary.expenses)} ₽</p>
                {plSummary.planExpenses > 0 && (
                  <p className="text-xs text-gray-400 mt-1">План: {fmt(plSummary.planExpenses)} ₽</p>
                )}
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Прибыль</span>
                  <DollarSign className={`w-4 h-4 ${plSummary.profit >= 0 ? "text-green-500" : "text-red-500"}`} />
                </div>
                <p className={`text-2xl font-bold ${plSummary.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {fmt(plSummary.profit)} ₽
                </p>
                {plSummary.planProfit !== 0 && (
                  <p className="text-xs text-gray-400 mt-1">План: {fmt(plSummary.planProfit)} ₽</p>
                )}
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Маржа</span>
                  <Calendar className="w-4 h-4 text-blue-500" />
                </div>
                <p className={`text-2xl font-bold ${plSummary.marginPercent >= 20 ? "text-green-600" : plSummary.marginPercent >= 0 ? "text-orange-600" : "text-red-600"}`}>
                  {plSummary.marginPercent}%
                </p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <TabPanel
            tabs={[
              { key: "pl", label: "P&L" },
              { key: "monthly", label: "По месяцам" },
              { key: "credits", label: "Кредиты" },
            ]}
            active={tab}
            onChange={(t) => setTab(t as TabType)}
          />

          {/* P&L Table */}
          {tab === "pl" && (
            <div className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="font-medium text-sm">Отчёт о прибылях и убытках — {MONTHS[month - 1]} {year}</h2>
                {!editing ? (
                  <button onClick={startEditing} className="flex items-center gap-1 text-xs text-zetta-600 hover:text-zetta-500">
                    <Edit3 className="w-3.5 h-3.5" /> Редактировать план
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
                      <X className="w-3.5 h-3.5" /> Отмена
                    </button>
                    <button onClick={savePlan} disabled={saving} className="flex items-center gap-1 text-xs text-green-600 hover:text-green-500">
                      <Save className="w-3.5 h-3.5" /> {saving ? "..." : "Сохранить"}
                    </button>
                  </div>
                )}
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase w-48">Статья</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase w-32">План</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase w-32">Факт</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase w-32">Отклонение</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase w-20">%</th>
                  </tr>
                </thead>
                <tbody>
                  {plRows.map(row => (
                    <tr key={row.category} className={`border-b border-gray-50 ${row.category === "revenue" ? "bg-green-50/30" : ""}`}>
                      <td className="p-3 text-sm font-medium">{row.label}</td>
                      <td className="p-3 text-sm text-right text-gray-500">
                        {editing ? (
                          <input
                            type="number"
                            value={planEdits[row.category] || ""}
                            onChange={(e) => setPlanEdits(prev => ({ ...prev, [row.category]: e.target.value }))}
                            className="input-field w-28 text-right text-sm"
                            placeholder="0"
                          />
                        ) : (
                          row.plan > 0 ? `${fmt(row.plan)} ₽` : "—"
                        )}
                      </td>
                      <td className={`p-3 text-sm text-right font-medium ${row.type === "income" ? "text-green-600" : "text-red-600"}`}>
                        {row.fact > 0 ? `${fmt(row.fact)} ₽` : "—"}
                      </td>
                      <td className={`p-3 text-sm text-right ${row.variance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {row.plan > 0 || row.fact > 0 ? `${row.variance >= 0 ? "+" : ""}${fmt(row.variance)} ₽` : "—"}
                      </td>
                      <td className={`p-3 text-sm text-right ${row.variancePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {row.plan > 0 ? `${row.variancePercent}%` : "—"}
                      </td>
                    </tr>
                  ))}
                  {/* Итого */}
                  {plSummary && (
                    <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                      <td className="p-3 text-sm">ИТОГО (Прибыль)</td>
                      <td className="p-3 text-sm text-right">{plSummary.planProfit !== 0 ? `${fmt(plSummary.planProfit)} ₽` : "—"}</td>
                      <td className={`p-3 text-sm text-right ${plSummary.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {fmt(plSummary.profit)} ₽
                      </td>
                      <td className="p-3 text-sm text-right">—</td>
                      <td className={`p-3 text-sm text-right ${plSummary.marginPercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {plSummary.marginPercent}%
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Monthly Table */}
          {tab === "monthly" && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase sticky left-0 bg-gray-50">Месяц</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Выручка</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Расходы</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Прибыль</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Маржа</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((m, i) => (
                      <tr key={m.period} className="border-b border-gray-50 hover:bg-gray-50/50">
                        <td className="p-3 text-sm font-medium sticky left-0 bg-white">{MONTHS[i]}</td>
                        <td className="p-3 text-sm text-right text-green-600">{m.revenue > 0 ? `${fmt(m.revenue)} ₽` : "—"}</td>
                        <td className="p-3 text-sm text-right text-red-600">{m.expenses > 0 ? `${fmt(m.expenses)} ₽` : "—"}</td>
                        <td className={`p-3 text-sm text-right font-medium ${m.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {m.revenue > 0 || m.expenses > 0 ? `${fmt(m.profit)} ₽` : "—"}
                        </td>
                        <td className={`p-3 text-sm text-right ${m.marginPercent >= 20 ? "text-green-600" : m.marginPercent >= 0 ? "text-orange-600" : "text-red-600"}`}>
                          {m.revenue > 0 ? `${m.marginPercent}%` : "—"}
                        </td>
                      </tr>
                    ))}
                    {ytd && (
                      <tr className="bg-gray-50 font-bold border-t-2 border-gray-200">
                        <td className="p-3 text-sm sticky left-0 bg-gray-50">YTD ({year})</td>
                        <td className="p-3 text-sm text-right text-green-600">{fmt(ytd.revenue)} ₽</td>
                        <td className="p-3 text-sm text-right text-red-600">{fmt(ytd.expenses)} ₽</td>
                        <td className={`p-3 text-sm text-right ${ytd.profit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(ytd.profit)} ₽</td>
                        <td className={`p-3 text-sm text-right ${ytd.marginPercent >= 0 ? "text-green-600" : "text-red-600"}`}>{ytd.marginPercent}%</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Credits */}
          {tab === "credits" && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="card p-4">
                  <span className="text-sm text-gray-500">Общий долг</span>
                  <p className="text-2xl font-bold text-red-600 mt-1">{fmt(totalDebt)} ₽</p>
                </div>
                <div className="card p-4">
                  <span className="text-sm text-gray-500">Ежемесячный платёж</span>
                  <p className="text-2xl font-bold text-orange-600 mt-1">{fmt(totalMonthly)} ₽</p>
                </div>
                <div className="card p-4">
                  <span className="text-sm text-gray-500">Активных кредитов</span>
                  <p className="text-2xl font-bold text-gray-700 mt-1">{credits.length}</p>
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Название</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Кредитор</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Сумма</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Остаток</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Платёж/мес</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Ставка</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Дата</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credits.length === 0 ? (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-400">Нет активных кредитов</td></tr>
                    ) : credits.map(c => {
                      const paidPercent = Number(c.totalAmount) > 0
                        ? Math.round(((Number(c.totalAmount) - Number(c.remainingAmount)) / Number(c.totalAmount)) * 100)
                        : 0;
                      const isExpanded = expandedCredit === c.id;
                      return (
                        <React.Fragment key={c.id}>
                        <tr className="border-b border-gray-50 cursor-pointer hover:bg-gray-50" onClick={() => toggleCreditExpand(c.id)}>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                              <div>
                                <p className="text-sm font-medium">{c.name}</p>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                  <div className="bg-zetta-500 h-1.5 rounded-full" style={{ width: `${paidPercent}%` }} />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-0.5">Погашено {paidPercent}%</p>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-sm text-gray-500">{c.lender || "—"}</td>
                          <td className="p-3 text-sm text-right">{fmt(Number(c.totalAmount))} ₽</td>
                          <td className="p-3 text-sm text-right font-medium text-red-600">{fmt(Number(c.remainingAmount))} ₽</td>
                          <td className="p-3 text-sm text-right">{c.monthlyPayment ? `${fmt(Number(c.monthlyPayment))} ₽` : "—"}</td>
                          <td className="p-3 text-sm text-right">{c.interestRate ? `${Number(c.interestRate)}%` : "—"}</td>
                          <td className="p-3 text-sm text-gray-500">{new Date(c.startDate).toLocaleDateString("ru-RU")}</td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <div className="bg-gray-50 p-4 border-b border-gray-200">
                                {!creditDetail ? (
                                  <p className="text-sm text-gray-400 text-center py-2">Загрузка...</p>
                                ) : (
                                  <div>
                                    <div className="flex items-center gap-6 mb-3 text-sm">
                                      <span className="text-gray-500">Всего выплачено: <span className="font-medium text-green-600">{fmt(creditDetail.totalPaid)} ₽</span></span>
                                      {creditDetail.totalPrincipal > 0 && <span className="text-gray-500">Основной долг: <span className="font-medium">{fmt(creditDetail.totalPrincipal)} ₽</span></span>}
                                      {creditDetail.totalInterest > 0 && <span className="text-gray-500">Проценты: <span className="font-medium text-orange-600">{fmt(creditDetail.totalInterest)} ₽</span></span>}
                                      <span className="text-gray-500">Переплата: <span className="font-medium text-red-600">{fmt(creditDetail.totalPaid - (Number(creditDetail.totalAmount) - Number(creditDetail.remainingAmount)))} ₽</span></span>
                                    </div>
                                    {creditDetail.payments?.length > 0 ? (
                                      <table className="w-full text-sm">
                                        <thead>
                                          <tr className="text-xs text-gray-500 border-b border-gray-200">
                                            <th className="text-left py-1.5 px-2">Месяц</th>
                                            <th className="text-right py-1.5 px-2">Сумма</th>
                                            <th className="text-right py-1.5 px-2">Основной</th>
                                            <th className="text-right py-1.5 px-2">Проценты</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {getMonthlyPayments(creditDetail.payments).map(([period, info]) => (
                                            <tr key={period} className="border-b border-gray-100">
                                              <td className="py-1.5 px-2 text-gray-600">{period}</td>
                                              <td className="py-1.5 px-2 text-right font-medium">{fmt(info.amount)} ₽</td>
                                              <td className="py-1.5 px-2 text-right text-gray-500">{info.principal > 0 ? `${fmt(info.principal)} ₽` : "—"}</td>
                                              <td className="py-1.5 px-2 text-right text-orange-600">{info.interest > 0 ? `${fmt(info.interest)} ₽` : "—"}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    ) : (
                                      <p className="text-sm text-gray-400">Нет платежей</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
