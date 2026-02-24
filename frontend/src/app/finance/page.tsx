"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import { DollarSign, TrendingUp, TrendingDown, FileText, CreditCard, Plus, X, Download, Check, Trash2, ChevronDown, Pencil, FileSpreadsheet } from "lucide-react";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";
import { PageHeader, TabPanel } from "@/components/ui";
import { useReferences } from "@/lib/useReferences";

interface Summary {
  totalRevenue: string | number;
  monthRevenue: string | number;
  totalExpenses: string | number;
  monthExpenses: string | number;
  unpaidInvoices: Array<{ id: string; number: string; total: string | number; date: string; client: { name: string; shortName: string | null } }>;
  recentPayments: Array<{ id: string; amount: string | number; method: string; date: string; notes: string | null; client: { name: string; shortName: string | null } }>;
}

interface Invoice {
  id: string;
  number: string;
  total: string | number;
  isPaid: boolean;
  date: string;
  dueDate: string | null;
  notes: string | null;
  client: { name: string; shortName: string | null };
  items: Array<{ id: string; description: string; quantity: number; price: string | number; total: string | number }>;
}

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: string | number;
  isRecurring: boolean;
  date: string;
}

interface Order {
  id: string;
  orderNumber: string;
  totalPrice: string | number;
  client: { id: string; name: string; shortName: string | null };
  items: Array<{ workItem: { name: string }; quantity: number; price: string | number; total: string | number }>;
}

interface OrgReq { id: string; name: string; shortName: string | null; isDefault: boolean }

interface Account {
  id: string;
  name: string;
  type: string;
  balance: string | number;
  isDefault: boolean;
  isActive: boolean;
}

type TabType = "overview" | "invoices" | "payments" | "expenses" | "accounts";

export default function FinancePage() {
  const router = useRouter();
  const { labelMap: METHOD_LABELS } = useReferences("payment_method");
  const { asOptions: EXPENSE_CATEGORIES } = useReferences("expense_category");
  const { labelMap: ACCOUNT_TYPE_LABELS } = useReferences("account_type");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>("overview");
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [clients, setClients] = useState<Array<{ id: string; name: string; shortName: string | null }>>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [newPayment, setNewPayment] = useState({ clientId: "", amount: "", method: "bank", date: "", notes: "", accountId: "" });
  const [newExpense, setNewExpense] = useState({ category: "materials", description: "", amount: "", isRecurring: false, date: "", accountId: "" });

  // Edit expense
  const [editExpense, setEditExpense] = useState<any>(null);
  const [editExpenseForm, setEditExpenseForm] = useState({ category: "", description: "", amount: "", date: "", accountId: "" });

  // Order selection for payment
  const [clientOrders, setClientOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");

  // Dedicated payments list (from GET /finance/payments)
  const [payments, setPayments] = useState<any[]>([]);

  // Invoice form
  const [invoiceClientId, setInvoiceClientId] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceOrgReqId, setInvoiceOrgReqId] = useState("");
  const [invoiceContract, setInvoiceContract] = useState("");
  const [invoicePeriod, setInvoicePeriod] = useState("");
  const [invoiceVariant, setInvoiceVariant] = useState<"DETAILED" | "SIMPLIFIED">("DETAILED");
  const [invoiceItems, setInvoiceItems] = useState<Array<{ description: string; quantity: number; price: string }>>([
    { description: "", quantity: 1, price: "" },
  ]);
  const [orgRequisites, setOrgRequisites] = useState<OrgReq[]>([]);
  const [docDropdown, setDocDropdown] = useState<string | null>(null); // invoiceId for open dropdown
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, expensesRes, clientsRes, reqRes] = await Promise.all([
        authApi("/finance/summary"),
        authApi("/finance/expenses?limit=30"),
        authApi("/clients?limit=200"),
        authApi("/settings/requisites"),
      ]);
      if (summaryRes.ok) {
        const d = await summaryRes.json();
        setSummary(d.data);
      }
      if (expensesRes.ok) {
        const d = await expensesRes.json();
        setExpenses(d.data?.expenses || []);
      }
      if (clientsRes.ok) {
        const d = await clientsRes.json();
        setClients(d.data?.clients || d.data || []);
      }
      if (reqRes.ok) {
        const d = await reqRes.json();
        setOrgRequisites(d.data || []);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await authApi("/finance/invoices?limit=100");
      if (res.ok) {
        const d = await res.json();
        setInvoices(d.data?.invoices || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  // Close doc dropdown on outside click
  useEffect(() => {
    if (!docDropdown) return;
    const handler = () => setDocDropdown(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [docDropdown]);

  const fetchAccounts = async () => {
    try {
      const res = await authApi("/accounts");
      if (res.ok) {
        const d = await res.json();
        setAccounts(d.data?.accounts || []);
        setTotalBalance(d.data?.totalBalance || 0);
      }
    } catch (e) { console.error(e); }
  };

  const switchTab = (t: TabType) => {
    setTab(t);
    if (t === "invoices") fetchInvoices();
    if (t === "payments") fetchPayments();
    if (t === "accounts") fetchAccounts();
  };

  const fetchPayments = async () => {
    try {
      const res = await authApi("/finance/payments?limit=100");
      if (res.ok) {
        const d = await res.json();
        setPayments(d.data?.payments || []);
      }
    } catch (e) { console.error(e); }
  };

  const fetchExpenses = async () => {
    try {
      const res = await authApi("/finance/expenses?limit=30");
      if (res.ok) {
        const d = await res.json();
        setExpenses(d.data?.expenses || []);
      }
    } catch (e) { console.error(e); }
  };

  const fetchClientOrders = async (clientId: string) => {
    if (!clientId) { setClientOrders([]); return; }
    try {
      const res = await authApi(`/orders?clientId=${clientId}&limit=50`);
      if (res.ok) {
        const d = await res.json();
        setClientOrders(d.data?.orders || d.data || []);
      }
    } catch (e) { console.error(e); }
  };

  const handleEditExpense = async () => {
    if (!editExpense) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editExpenseForm.category) body.category = editExpenseForm.category;
      if (editExpenseForm.description) body.description = editExpenseForm.description;
      if (editExpenseForm.amount) body.amount = parseFloat(editExpenseForm.amount);
      if (editExpenseForm.date) body.date = editExpenseForm.date;
      if (editExpenseForm.accountId) body.accountId = editExpenseForm.accountId;

      const res = await authApi(`/finance/expenses/${editExpense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditExpense(null);
        fetchExpenses();
        fetchData();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const openEditExpense = (expense: any) => {
    setEditExpense(expense);
    setEditExpenseForm({
      category: expense.category || "",
      description: expense.description || "",
      amount: String(Number(expense.amount)),
      date: expense.date ? new Date(expense.date).toISOString().split("T")[0] : "",
      accountId: expense.accountId || "",
    });
    fetchAccounts();
    setError("");
  };

  const handleExportPayments = (format: "excel" | "pdf") => {
    const headers = ["Дата", "Клиент", "Способ", "Сумма", "Наряд", "Примечание"];
    const rows = payments.map((p: any) => [
      new Date(p.date).toLocaleDateString("ru-RU"),
      p.client?.shortName || p.client?.name || "—",
      METHOD_LABELS[p.method] || p.method || "—",
      Number(p.amount).toLocaleString("ru-RU"),
      p.orderId || "—",
      p.notes || "—",
    ]);
    if (format === "excel") exportToExcel("Платежи", headers, rows);
    else exportToPDF("Платежи", headers, rows);
  };

  const handleExportExpenses = (format: "excel" | "pdf") => {
    const headers = ["Категория", "Описание", "Сумма", "Дата"];
    const rows = expenses.map((e: any) => [
      EXPENSE_CATEGORIES.find((c: any) => c.value === e.category)?.label || e.category || "—",
      e.description || "—",
      Number(e.amount).toLocaleString("ru-RU"),
      new Date(e.date).toLocaleDateString("ru-RU"),
    ]);
    if (format === "excel") exportToExcel("Расходы", headers, rows);
    else exportToPDF("Расходы", headers, rows);
  };

  const fmt = (n: string | number) => Number(n).toLocaleString("ru-RU");
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ru-RU");

  const handlePayment = async () => {
    if (!newPayment.clientId || !newPayment.amount) { setError("Заполните обязательные поля"); return; }
    setSaving(true); setError("");
    try {
      const res = await authApi("/finance/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: newPayment.clientId,
          amount: parseFloat(newPayment.amount),
          method: newPayment.method,
          date: newPayment.date || undefined,
          notes: newPayment.notes || undefined,
          accountId: newPayment.accountId || undefined,
          orderId: selectedOrderId || undefined,
        }),
      });
      if (res.ok) {
        setShowPaymentModal(false);
        setNewPayment({ clientId: "", amount: "", method: "bank", date: "", notes: "", accountId: "" });
        setSelectedOrderId("");
        setClientOrders([]);
        fetchData();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const handleExpense = async () => {
    if (!newExpense.description || !newExpense.amount) { setError("Заполните поля"); return; }
    setSaving(true); setError("");
    try {
      const res = await authApi("/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: newExpense.category,
          description: newExpense.description,
          amount: parseFloat(newExpense.amount),
          isRecurring: newExpense.isRecurring,
          date: newExpense.date || undefined,
          accountId: newExpense.accountId || undefined,
        }),
      });
      if (res.ok) {
        setShowExpenseModal(false);
        setNewExpense({ category: "materials", description: "", amount: "", isRecurring: false, date: "", accountId: "" });
        fetchData();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const handleCreateInvoice = async () => {
    if (!invoiceClientId) { setError("Выберите заказчика"); return; }
    const validItems = invoiceItems.filter(i => i.description.trim() && parseFloat(i.price) > 0);
    if (validItems.length === 0) { setError("Добавьте хотя бы одну позицию"); return; }
    setSaving(true); setError("");
    try {
      const res = await authApi("/finance/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: invoiceClientId,
          dueDate: invoiceDueDate || undefined,
          notes: invoiceNotes || undefined,
          orgRequisitesId: invoiceOrgReqId || undefined,
          contractReference: invoiceContract || undefined,
          billingPeriod: invoicePeriod || undefined,
          variant: invoiceVariant,
          items: validItems.map(i => ({
            description: i.description,
            quantity: i.quantity,
            price: parseFloat(i.price),
          })),
        }),
      });
      if (res.ok) {
        setShowInvoiceModal(false);
        setInvoiceClientId("");
        setInvoiceDueDate("");
        setInvoiceNotes("");
        setInvoiceOrgReqId("");
        setInvoiceContract("");
        setInvoicePeriod("");
        setInvoiceVariant("DETAILED");
        setInvoiceItems([{ description: "", quantity: 1, price: "" }]);
        fetchInvoices();
        fetchData();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const markInvoicePaid = async (id: string) => {
    try {
      await authApi(`/finance/invoices/${id}/pay`, { method: "PATCH" });
      fetchInvoices();
      fetchData();
    } catch (e) { console.error(e); }
  };

  const downloadPdf = (id: string, type: string, variant?: string) => {
    const token = getToken();
    const base = window.location.origin + "/zetta/api";
    const params = new URLSearchParams({ token: token || "" });
    if (variant) params.set("variant", variant);
    window.open(`${base}/finance/invoices/${id}/${type}?${params.toString()}`, "_blank");
    setDocDropdown(null);
  };

  const addInvoiceItem = () => {
    setInvoiceItems(prev => [...prev, { description: "", quantity: 1, price: "" }]);
  };

  const removeInvoiceItem = (idx: number) => {
    setInvoiceItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateInvoiceItem = (idx: number, field: string, value: string | number) => {
    setInvoiceItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const invoiceTotal = invoiceItems.reduce((s, i) => s + (parseFloat(i.price) || 0) * i.quantity, 0);

  if (loading) {
    return (
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 flex items-center justify-center"><p className="text-gray-400">Загрузка...</p></main>
      </div>
    );
  }

  const profit = Number(summary?.monthRevenue || 0) - Number(summary?.monthExpenses || 0);

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <PageHeader title="Финансы">
            <div className="flex gap-2">
              <button onClick={() => setShowInvoiceModal(true)} className="btn-secondary flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4" /> Счёт
              </button>
              <button onClick={() => { fetchAccounts(); setShowPaymentModal(true); }} className="btn-secondary flex items-center gap-2 text-sm">
                <CreditCard className="w-4 h-4" /> Оплата
              </button>
              <button onClick={() => { fetchAccounts(); setShowExpenseModal(true); }} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Расход
              </button>
            </div>
          </PageHeader>

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Выручка (месяц)</span>
                  <TrendingUp className="w-4 h-4 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-green-600">{fmt(summary.monthRevenue)} ₽</p>
                <p className="text-xs text-gray-400 mt-1">Всего: {fmt(summary.totalRevenue)} ₽</p>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Расходы (месяц)</span>
                  <TrendingDown className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-2xl font-bold text-red-600">{fmt(summary.monthExpenses)} ₽</p>
                <p className="text-xs text-gray-400 mt-1">Всего: {fmt(summary.totalExpenses)} ₽</p>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Прибыль (месяц)</span>
                  <DollarSign className={`w-4 h-4 ${profit >= 0 ? "text-green-500" : "text-red-500"}`} />
                </div>
                <p className={`text-2xl font-bold ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>{fmt(profit)} ₽</p>
              </div>
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">Неоплаченные счета</span>
                  <FileText className="w-4 h-4 text-orange-500" />
                </div>
                <p className="text-2xl font-bold text-orange-600">{summary.unpaidInvoices.length}</p>
                <p className="text-xs text-gray-400 mt-1">
                  На сумму: {fmt(summary.unpaidInvoices.reduce((s, i) => s + Number(i.total), 0))} ₽
                </p>
              </div>
            </div>
          )}

          {/* Tabs */}
          <TabPanel
            tabs={[
              { key: "overview", label: "Обзор" },
              { key: "invoices", label: "Счета" },
              { key: "payments", label: "Оплаты" },
              { key: "expenses", label: "Расходы" },
              { key: "accounts", label: "Платёж. счета" },
            ]}
            active={tab}
            onChange={(t) => switchTab(t as TabType)}
            variant="pills"
          />

          {/* Overview */}
          {tab === "overview" && summary && (
            <div className="grid grid-cols-2 gap-6">
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-gray-100"><h2 className="font-medium">Последние оплаты</h2></div>
                {summary.recentPayments.length === 0 ? (
                  <p className="p-4 text-sm text-gray-400">Нет оплат</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {summary.recentPayments.map(p => (
                      <div key={p.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{p.client?.shortName || p.client?.name}</p>
                          <p className="text-xs text-gray-400">{fmtDate(p.date)} / {METHOD_LABELS[p.method] || p.method}</p>
                        </div>
                        <span className="text-sm font-bold text-green-600">+{fmt(p.amount)} ₽</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="card overflow-hidden">
                <div className="p-4 border-b border-gray-100"><h2 className="font-medium">Неоплаченные счета</h2></div>
                {summary.unpaidInvoices.length === 0 ? (
                  <p className="p-4 text-sm text-gray-400">Все счета оплачены</p>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {summary.unpaidInvoices.map(inv => (
                      <div key={inv.id} className="p-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{inv.number}</p>
                          <p className="text-xs text-gray-400">{inv.client?.shortName || inv.client?.name} / {fmtDate(inv.date)}</p>
                        </div>
                        <span className="text-sm font-bold text-orange-600">{fmt(inv.total)} ₽</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Invoices */}
          {tab === "invoices" && (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Номер</th>
                    <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Заказчик</th>
                    <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Дата</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Сумма</th>
                    <th className="text-center p-3 text-xs font-medium text-gray-500 uppercase">Статус</th>
                    <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-gray-400">Нет счетов</td></tr>
                  ) : invoices.map(inv => (
                    <tr key={inv.id} className="border-b border-gray-100">
                      <td className="p-3 text-sm font-medium">{inv.number}</td>
                      <td className="p-3 text-sm">{inv.client?.shortName || inv.client?.name}</td>
                      <td className="p-3 text-sm text-gray-500">{fmtDate(inv.date)}</td>
                      <td className="p-3 text-sm text-right font-medium">{fmt(inv.total)} ₽</td>
                      <td className="p-3 text-center">
                        {inv.isPaid ? (
                          <span className="badge bg-green-100 text-green-700 text-xs">Оплачен</span>
                        ) : (
                          <span className="badge bg-orange-100 text-orange-700 text-xs">Не оплачен</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!inv.isPaid && (
                            <button onClick={() => markInvoicePaid(inv.id)} className="p-1.5 text-gray-400 hover:text-green-600" title="Отметить оплаченным">
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {/* Document download dropdown */}
                          <div className="relative">
                            <button
                              onClick={() => setDocDropdown(docDropdown === inv.id ? null : inv.id)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 flex items-center gap-0.5"
                              title="Скачать документ"
                            >
                              <Download className="w-4 h-4" />
                              <ChevronDown className="w-3 h-3" />
                            </button>
                            {docDropdown === inv.id && (
                              <div className="absolute right-0 top-8 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52">
                                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Счёт</p>
                                <button onClick={() => downloadPdf(inv.id, "pdf", "DETAILED")} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">Подробный</button>
                                <button onClick={() => downloadPdf(inv.id, "pdf", "SIMPLIFIED")} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">Упрощённый</button>
                                <hr className="my-1 border-gray-100" />
                                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Акт</p>
                                <button onClick={() => downloadPdf(inv.id, "act-pdf", "DETAILED")} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">Подробный</button>
                                <button onClick={() => downloadPdf(inv.id, "act-pdf", "SIMPLIFIED")} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">Упрощённый</button>
                                <hr className="my-1 border-gray-100" />
                                <button onClick={() => downloadPdf(inv.id, "torg12-pdf")} className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">ТОРГ-12</button>
                                <hr className="my-1 border-gray-100" />
                                <button onClick={() => downloadPdf(inv.id, "bundle-pdf")} className="w-full text-left px-3 py-1.5 text-sm font-medium text-zetta-600 hover:bg-gray-50">Пакет (Счёт + Акт)</button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Payments */}
          {tab === "payments" && (
            <div>
              <div className="flex justify-end gap-2 mb-3">
                <button onClick={() => handleExportPayments("excel")} className="btn-secondary flex items-center gap-1.5 text-xs">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button onClick={() => handleExportPayments("pdf")} className="btn-secondary flex items-center gap-1.5 text-xs">
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Дата</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Заказчик</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Способ</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Сумма</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Наряд</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Примечание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-400">Нет оплат</td></tr>
                    ) : payments.map((p: any) => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="p-3 text-sm text-gray-500">{fmtDate(p.date)}</td>
                        <td className="p-3 text-sm">{p.client?.shortName || p.client?.name}</td>
                        <td className="p-3 text-sm">{METHOD_LABELS[p.method] || p.method}</td>
                        <td className="p-3 text-sm text-right font-medium text-green-600">+{fmt(p.amount)} ₽</td>
                        <td className="p-3 text-sm text-gray-500">{p.order?.orderNumber || (p.orderId ? p.orderId.slice(0, 8) + "..." : "—")}</td>
                        <td className="p-3 text-sm text-gray-500">{p.notes || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Expenses */}
          {tab === "expenses" && (
            <div>
              <div className="flex justify-end gap-2 mb-3">
                <button onClick={() => handleExportExpenses("excel")} className="btn-secondary flex items-center gap-1.5 text-xs">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
                </button>
                <button onClick={() => handleExportExpenses("pdf")} className="btn-secondary flex items-center gap-1.5 text-xs">
                  <FileText className="w-3.5 h-3.5" /> PDF
                </button>
              </div>
              <div className="card overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Дата</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Категория</th>
                      <th className="text-left p-3 text-xs font-medium text-gray-500 uppercase">Описание</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Сумма</th>
                      <th className="text-right p-3 text-xs font-medium text-gray-500 uppercase">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400">Нет расходов</td></tr>
                    ) : expenses.map(e => (
                      <tr key={e.id} className="border-b border-gray-100">
                        <td className="p-3 text-sm text-gray-500">{fmtDate(e.date)}</td>
                        <td className="p-3 text-sm">
                          <span className="badge bg-gray-100 text-gray-700 text-xs">
                            {EXPENSE_CATEGORIES.find(c => c.value === e.category)?.label || e.category}
                          </span>
                          {e.isRecurring && <span className="ml-1 text-xs text-blue-500">Повтор</span>}
                        </td>
                        <td className="p-3 text-sm">{e.description}</td>
                        <td className="p-3 text-sm text-right font-medium text-red-600">-{fmt(e.amount)} ₽</td>
                        <td className="p-3 text-right">
                          <button onClick={() => openEditExpense(e)} className="p-1.5 text-gray-400 hover:text-blue-600" title="Редактировать">
                            <Pencil className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Accounts */}
          {tab === "accounts" && (
            <div>
              {/* Total balance */}
              <div className="card p-4 mb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-gray-500">Общий баланс</span>
                    <p className={`text-2xl font-bold ${totalBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {fmt(totalBalance)} ₽
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{accounts.length} счетов</span>
                </div>
              </div>

              {/* Account cards */}
              <div className="grid grid-cols-3 gap-4">
                {accounts.length === 0 ? (
                  <div className="col-span-3 card p-8 text-center text-gray-400">
                    Нет платёжных счетов. Создайте через API или настройки.
                  </div>
                ) : accounts.map(acc => (
                  <div key={acc.id} className={`card p-4 ${!acc.isActive ? "opacity-50" : ""}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${acc.type === "cash" ? "bg-green-500" : acc.type === "bank" ? "bg-blue-500" : acc.type === "card" ? "bg-purple-500" : "bg-orange-500"}`} />
                        <span className="text-sm font-medium">{acc.name}</span>
                      </div>
                      {acc.isDefault && (
                        <span className="text-[10px] bg-zetta-100 text-zetta-700 px-1.5 py-0.5 rounded">Осн.</span>
                      )}
                    </div>
                    <p className={`text-xl font-bold ${Number(acc.balance) >= 0 ? "text-gray-900" : "text-red-600"}`}>
                      {fmt(acc.balance)} ₽
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{ACCOUNT_TYPE_LABELS[acc.type] || acc.type}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Invoice creation modal */}
        {showInvoiceModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый счёт</h2>
                <button onClick={() => { setShowInvoiceModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Заказчик *</label>
                    <select value={invoiceClientId} onChange={(e) => setInvoiceClientId(e.target.value)} className="input-field">
                      <option value="">— Выберите —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Наши реквизиты</label>
                    <select value={invoiceOrgReqId} onChange={(e) => setInvoiceOrgReqId(e.target.value)} className="input-field">
                      <option value="">— Авто (по клиенту/дефолт) —</option>
                      {orgRequisites.map(r => (
                        <option key={r.id} value={r.id}>{r.shortName || r.name}{r.isDefault ? " (по умолч.)" : ""}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Оплатить до</label>
                    <input type="date" value={invoiceDueDate} onChange={(e) => setInvoiceDueDate(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Ссылка на договор</label>
                    <input placeholder="Договор №12 от 01.01.2026" value={invoiceContract} onChange={(e) => setInvoiceContract(e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Период</label>
                    <input placeholder="Февраль 2026" value={invoicePeriod} onChange={(e) => setInvoicePeriod(e.target.value)} className="input-field" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Детализация документов</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={invoiceVariant === "DETAILED"} onChange={() => setInvoiceVariant("DETAILED")} className="w-4 h-4" />
                      <span className="text-sm">Подробный (с пациентами)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" checked={invoiceVariant === "SIMPLIFIED"} onChange={() => setInvoiceVariant("SIMPLIFIED")} className="w-4 h-4" />
                      <span className="text-sm">Упрощённый</span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-500 font-medium">Позиции *</label>
                    <button onClick={addInvoiceItem} className="text-xs text-zetta-600 hover:text-zetta-500">+ Добавить строку</button>
                  </div>
                  <div className="space-y-2">
                    {invoiceItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          placeholder="Описание работы"
                          value={item.description}
                          onChange={(e) => updateInvoiceItem(idx, "description", e.target.value)}
                          className="input-field flex-1"
                        />
                        <input
                          type="number"
                          placeholder="Кол-во"
                          value={item.quantity}
                          min={1}
                          onChange={(e) => updateInvoiceItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="input-field w-20"
                        />
                        <input
                          type="number"
                          placeholder="Цена"
                          value={item.price}
                          onChange={(e) => updateInvoiceItem(idx, "price", e.target.value)}
                          className="input-field w-28"
                        />
                        <span className="text-sm text-gray-500 w-24 text-right">
                          {fmt((parseFloat(item.price) || 0) * item.quantity)} ₽
                        </span>
                        {invoiceItems.length > 1 && (
                          <button onClick={() => removeInvoiceItem(idx)} className="text-gray-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="text-right mt-2">
                    <span className="text-sm font-bold">Итого: {fmt(invoiceTotal)} ₽</span>
                  </div>
                </div>

                <input placeholder="Примечание" value={invoiceNotes} onChange={(e) => setInvoiceNotes(e.target.value)} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowInvoiceModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleCreateInvoice} disabled={saving} className="btn-primary disabled:opacity-50">
                  {saving ? "..." : "Создать счёт"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Payment modal */}
        {showPaymentModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новая оплата</h2>
                <button onClick={() => { setShowPaymentModal(false); setError(""); setClientOrders([]); setSelectedOrderId(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <select value={newPayment.clientId} onChange={(e) => { setNewPayment(p => ({...p, clientId: e.target.value})); setSelectedOrderId(""); fetchClientOrders(e.target.value); }} className="input-field">
                  <option value="">— Заказчик —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                </select>
                {clientOrders.length > 0 && (
                  <select value={selectedOrderId} onChange={(e) => setSelectedOrderId(e.target.value)} className="input-field">
                    <option value="">— Без привязки к наряду —</option>
                    {clientOrders.map((o: any) => (
                      <option key={o.id} value={o.id}>#{o.orderNumber} — {Number(o.totalPrice || 0).toLocaleString("ru-RU")} ₽</option>
                    ))}
                  </select>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Сумма *" value={newPayment.amount} onChange={(e) => setNewPayment(p => ({...p, amount: e.target.value}))} className="input-field" />
                  <select value={newPayment.method} onChange={(e) => setNewPayment(p => ({...p, method: e.target.value}))} className="input-field">
                    {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <input type="date" value={newPayment.date} onChange={(e) => setNewPayment(p => ({...p, date: e.target.value}))} className="input-field" />
                <input placeholder="Примечание" value={newPayment.notes} onChange={(e) => setNewPayment(p => ({...p, notes: e.target.value}))} className="input-field" />
                {accounts.length > 0 && (
                  <select value={newPayment.accountId} onChange={(e) => setNewPayment(p => ({...p, accountId: e.target.value}))} className="input-field">
                    <option value="">— Счёт (необязательно) —</option>
                    {accounts.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)} ₽)</option>)}
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowPaymentModal(false); setError(""); setClientOrders([]); setSelectedOrderId(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handlePayment} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Записать"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Expense modal */}
        {showExpenseModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый расход</h2>
                <button onClick={() => { setShowExpenseModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <select value={newExpense.category} onChange={(e) => setNewExpense(p => ({...p, category: e.target.value}))} className="input-field">
                  {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input placeholder="Описание *" value={newExpense.description} onChange={(e) => setNewExpense(p => ({...p, description: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Сумма *" value={newExpense.amount} onChange={(e) => setNewExpense(p => ({...p, amount: e.target.value}))} className="input-field" />
                  <input type="date" value={newExpense.date} onChange={(e) => setNewExpense(p => ({...p, date: e.target.value}))} className="input-field" />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={newExpense.isRecurring} onChange={(e) => setNewExpense(p => ({...p, isRecurring: e.target.checked}))} className="w-4 h-4" />
                  <span className="text-sm text-gray-700">Повторяющийся расход</span>
                </label>
                {accounts.length > 0 && (
                  <select value={newExpense.accountId} onChange={(e) => setNewExpense(p => ({...p, accountId: e.target.value}))} className="input-field">
                    <option value="">— Счёт (необязательно) —</option>
                    {accounts.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)} ₽)</option>)}
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowExpenseModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleExpense} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Записать"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit expense modal */}
        {editExpense && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Редактировать расход</h2>
                <button onClick={() => { setEditExpense(null); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <select value={editExpenseForm.category} onChange={(e) => setEditExpenseForm(p => ({...p, category: e.target.value}))} className="input-field">
                  {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
                <input placeholder="Описание" value={editExpenseForm.description} onChange={(e) => setEditExpenseForm(p => ({...p, description: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Сумма" value={editExpenseForm.amount} onChange={(e) => setEditExpenseForm(p => ({...p, amount: e.target.value}))} className="input-field" />
                  <input type="date" value={editExpenseForm.date} onChange={(e) => setEditExpenseForm(p => ({...p, date: e.target.value}))} className="input-field" />
                </div>
                {accounts.length > 0 && (
                  <select value={editExpenseForm.accountId} onChange={(e) => setEditExpenseForm(p => ({...p, accountId: e.target.value}))} className="input-field">
                    <option value="">— Счёт (необязательно) —</option>
                    {accounts.filter(a => a.isActive).map(a => <option key={a.id} value={a.id}>{a.name} ({fmt(a.balance)} ₽)</option>)}
                  </select>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setEditExpense(null); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleEditExpense} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Сохранить"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
