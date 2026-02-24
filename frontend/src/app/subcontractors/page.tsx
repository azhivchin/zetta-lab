"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { authApi, getToken } from "@/lib/api";
import { Plus, X, Users, DollarSign, Clock, Check, AlertCircle, Trash2, Save, Pencil, FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { exportToExcel, exportToPDF } from "@/lib/export-utils";

interface Subcontractor {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  specializations: string | null;
  inn: string | null;
  isActive: boolean;
  notes: string | null;
  _count: { orders: number };
}

interface SubOrder {
  id: string;
  description: string;
  price: string | number;
  status: string;
  sentAt: string;
  dueDate: string | null;
  completedAt: string | null;
  isPaid: boolean;
  notes: string | null;
  order: { orderNumber: string; client: { name: string; shortName: string | null } };
}

interface Order {
  id: string;
  orderNumber: string;
  client: { name: string; shortName: string | null };
}

interface Summary {
  totalUnpaid: number;
  unpaidCount: number;
  monthTotal: number;
  monthCount: number;
  activeOrders: number;
}

const STATUS_LABELS: Record<string, string> = {
  SENT: "Отправлено", IN_PROGRESS: "В работе", COMPLETED: "Выполнено",
  RETURNED: "Возвращено", CANCELLED: "Отменено",
};
const STATUS_COLORS: Record<string, string> = {
  SENT: "bg-blue-100 text-blue-700", IN_PROGRESS: "bg-yellow-100 text-yellow-700",
  COMPLETED: "bg-green-100 text-green-700", RETURNED: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default function SubcontractorsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [selectedSub, setSelectedSub] = useState<Subcontractor | null>(null);
  const [subOrders, setSubOrders] = useState<SubOrder[]>([]);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);

  // Prices tab
  const [detailTab, setDetailTab] = useState<"orders" | "prices">("orders");
  const [subPrices, setSubPrices] = useState<any[]>([]);
  const [workItems, setWorkItems] = useState<{ id: string; name: string; code: string; basePrice: number; unit: string }[]>([]);
  const [selectedWorkItem, setSelectedWorkItem] = useState("");
  const [newPriceVal, setNewPriceVal] = useState("");

  // Edit order
  const [editOrder, setEditOrder] = useState<any>(null);
  const [editOrderForm, setEditOrderForm] = useState({ description: "", price: "", dueDate: "", notes: "" });

  // Create sub form
  const [newSub, setNewSub] = useState({ name: "", contactPerson: "", phone: "", specializations: "", inn: "", notes: "" });
  // Create order form
  const [newOrder, setNewOrder] = useState({ subcontractorId: "", orderId: "", description: "", price: "", dueDate: "", notes: "" });

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const fmt = (n: number | string) => Number(n).toLocaleString("ru-RU");
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("ru-RU");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [subsRes, summaryRes] = await Promise.all([
        authApi("/subcontractors?isActive=true"),
        authApi("/subcontractors/summary"),
      ]);
      if (subsRes.ok) {
        const d = await subsRes.json();
        setSubs(d.data || []);
      }
      if (summaryRes.ok) {
        const d = await summaryRes.json();
        setSummary(d.data);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const selectSub = async (sub: Subcontractor) => {
    setSelectedSub(sub);
    setDetailTab("orders");
    try {
      const res = await authApi(`/subcontractors/${sub.id}`);
      if (res.ok) {
        const d = await res.json();
        setSubOrders(d.data.orders || []);
      }
    } catch (e) { console.error(e); }
  };

  const loadSubPrices = async (subId: string) => {
    try {
      const res = await authApi(`/subcontractors/${subId}/prices`);
      if (res.ok) {
        const d = await res.json();
        setSubPrices(d.data || []);
      }
    } catch (e) { console.error(e); }
  };

  const loadWorkItems = async () => {
    if (workItems.length > 0) return;
    try {
      const res = await authApi("/work-catalog/items?limit=500");
      if (res.ok) {
        const d = await res.json();
        setWorkItems(d.data?.items || d.data || []);
      }
    } catch (e) { console.error(e); }
  };

  const handleAddSubPrice = async (subId: string) => {
    if (!selectedWorkItem || !newPriceVal) return;
    try {
      const res = await authApi(`/subcontractors/${subId}/prices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workItemId: selectedWorkItem, price: parseFloat(newPriceVal) }),
      });
      if (res.ok) {
        await loadSubPrices(subId);
        setSelectedWorkItem("");
        setNewPriceVal("");
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteSubPrice = async (subId: string, workItemId: string) => {
    try {
      await authApi(`/subcontractors/${subId}/prices/${workItemId}`, { method: "DELETE" });
      await loadSubPrices(subId);
    } catch (e) { console.error(e); }
  };

  const switchDetailTab = async (tab: "orders" | "prices") => {
    setDetailTab(tab);
    if (tab === "prices" && selectedSub) {
      await loadSubPrices(selectedSub.id);
      await loadWorkItems();
    }
  };

  const handleCreate = async () => {
    if (!newSub.name) { setError("Укажите название"); return; }
    setSaving(true); setError("");
    try {
      const res = await authApi("/subcontractors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSub),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setNewSub({ name: "", contactPerson: "", phone: "", specializations: "", inn: "", notes: "" });
        fetchData();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const openOrderModal = async () => {
    try {
      const res = await authApi("/orders?limit=200&status=IN_PROGRESS,NEW");
      if (res.ok) {
        const d = await res.json();
        setOrders(d.data?.orders || []);
      }
    } catch (e) { console.error(e); }
    if (selectedSub) setNewOrder(prev => ({ ...prev, subcontractorId: selectedSub.id }));
    setShowOrderModal(true);
  };

  const handleCreateOrder = async () => {
    if (!newOrder.subcontractorId || !newOrder.orderId || !newOrder.description || !newOrder.price) {
      setError("Заполните все поля"); return;
    }
    setSaving(true); setError("");
    try {
      const res = await authApi("/subcontractors/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newOrder,
          price: parseFloat(newOrder.price),
          dueDate: newOrder.dueDate || undefined,
          notes: newOrder.notes || undefined,
        }),
      });
      if (res.ok) {
        setShowOrderModal(false);
        setNewOrder({ subcontractorId: "", orderId: "", description: "", price: "", dueDate: "", notes: "" });
        if (selectedSub) selectSub(selectedSub);
        fetchData();
      } else {
        const d = await res.json();
        setError(d.error?.message || "Ошибка");
      }
    } catch { setError("Ошибка"); }
    setSaving(false);
  };

  const updateOrderStatus = async (id: string, status: string) => {
    try {
      await authApi(`/subcontractors/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (selectedSub) selectSub(selectedSub);
    } catch (e) { console.error(e); }
  };

  const markPaid = async (id: string) => {
    try {
      await authApi(`/subcontractors/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPaid: true }),
      });
      if (selectedSub) selectSub(selectedSub);
      fetchData();
    } catch (e) { console.error(e); }
  };

  const handleEditOrder = async () => {
    if (!editOrder) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (editOrderForm.description) body.description = editOrderForm.description;
      if (editOrderForm.price) body.price = parseFloat(editOrderForm.price);
      if (editOrderForm.dueDate) body.dueDate = editOrderForm.dueDate;
      body.notes = editOrderForm.notes;

      const res = await authApi(`/subcontractors/orders/${editOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditOrder(null);
        if (selectedSub) selectSub(selectedSub);
      }
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const openEditOrder = (order: any) => {
    setEditOrderForm({
      description: order.description || "",
      price: String(Number(order.price)),
      dueDate: order.dueDate ? new Date(order.dueDate).toISOString().split("T")[0] : "",
      notes: order.notes || "",
    });
    setEditOrder(order);
  };

  const handleExport = (format: "excel" | "pdf") => {
    const headers = ["Название", "Специализация", "Контакт", "Телефон", "Заказов"];
    const rows = subs.map((s: any) => [
      s.name,
      s.specializations || "—",
      s.contactPerson || "—",
      s.phone || "—",
      s._count?.orders || 0,
    ]);
    if (format === "excel") exportToExcel("Субподрядчики", headers, rows);
    else exportToPDF("Субподрядчики", headers, rows);
  };

  if (loading) {
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
          <PageHeader title="Субподрядчики">
            <div className="flex gap-2">
              <button onClick={() => handleExport("excel")} className="btn-secondary flex items-center gap-2 text-sm" title="Экспорт Excel">
                <FileSpreadsheet className="w-4 h-4" /> Excel
              </button>
              <button onClick={() => handleExport("pdf")} className="btn-secondary flex items-center gap-2 text-sm" title="Экспорт PDF">
                <FileText className="w-4 h-4" /> PDF
              </button>
              <button onClick={openOrderModal} className="btn-secondary flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4" /> Отправить работу
              </button>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
                <Plus className="w-4 h-4" /> Добавить
              </button>
            </div>
          </PageHeader>

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="card p-4">
                <span className="text-sm text-gray-500">Задолженность</span>
                <p className="text-2xl font-bold text-red-600 mt-1">{fmt(summary.totalUnpaid)} ₽</p>
                <p className="text-xs text-gray-400">{summary.unpaidCount} неоплач.</p>
              </div>
              <div className="card p-4">
                <span className="text-sm text-gray-500">За месяц</span>
                <p className="text-2xl font-bold text-gray-700 mt-1">{fmt(summary.monthTotal)} ₽</p>
                <p className="text-xs text-gray-400">{summary.monthCount} заказов</p>
              </div>
              <div className="card p-4">
                <span className="text-sm text-gray-500">В работе</span>
                <p className="text-2xl font-bold text-blue-600 mt-1">{summary.activeOrders}</p>
              </div>
              <div className="card p-4">
                <span className="text-sm text-gray-500">Субподрядчиков</span>
                <p className="text-2xl font-bold text-gray-700 mt-1">{subs.length}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-6">
            {/* Left: list */}
            <div className="col-span-1">
              <div className="card overflow-hidden">
                <div className="p-3 border-b border-gray-100 font-medium text-sm">Субподрядчики</div>
                <div className="divide-y divide-gray-50">
                  {subs.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">Нет субподрядчиков</div>
                  ) : subs.map(sub => (
                    <button
                      key={sub.id}
                      onClick={() => selectSub(sub)}
                      className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${selectedSub?.id === sub.id ? "bg-zetta-50 border-l-2 border-zetta-500" : ""}`}
                    >
                      <p className="text-sm font-medium">{sub.name}</p>
                      {sub.specializations && <p className="text-xs text-gray-400 truncate">{sub.specializations}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{sub._count.orders} заказов</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: detail + orders */}
            <div className="col-span-2">
              {!selectedSub ? (
                <div className="card p-12 text-center text-gray-400">
                  <Users className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Выберите субподрядчика</p>
                </div>
              ) : (
                <>
                  {/* Info card */}
                  <div className="card p-4 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-lg font-bold">{selectedSub.name}</h2>
                      {selectedSub.inn && <span className="text-xs text-gray-400">ИНН {selectedSub.inn}</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      {selectedSub.contactPerson && <div><span className="text-gray-400">Контакт:</span> {selectedSub.contactPerson}</div>}
                      {selectedSub.phone && <div><span className="text-gray-400">Тел:</span> {selectedSub.phone}</div>}
                      {selectedSub.specializations && <div><span className="text-gray-400">Спец.:</span> {selectedSub.specializations}</div>}
                    </div>
                  </div>

                  {/* Tabs: Orders / Prices */}
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
                    <button
                      onClick={() => switchDetailTab("orders")}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${detailTab === "orders" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      <Clock className="w-3.5 h-3.5" /> Заказы
                    </button>
                    <button
                      onClick={() => switchDetailTab("prices")}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${detailTab === "prices" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    >
                      <DollarSign className="w-3.5 h-3.5" /> Прайс-лист
                    </button>
                  </div>

                  {/* Prices tab */}
                  {detailTab === "prices" && (
                    <div className="card p-4">
                      {subPrices.length > 0 && (
                        <table className="w-full text-sm mb-4">
                          <thead>
                            <tr className="text-left text-gray-500 text-xs border-b">
                              <th className="pb-2">Код</th>
                              <th className="pb-2">Работа</th>
                              <th className="pb-2 text-right">Базовая</th>
                              <th className="pb-2 text-right">Цена подряда</th>
                              <th className="pb-2 text-right">Разница</th>
                              <th className="pb-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {subPrices.map((p: any) => {
                              const diff = Number(p.price) - Number(p.workItem.basePrice);
                              return (
                                <tr key={p.id} className="border-b border-gray-100">
                                  <td className="py-2 text-gray-500">{p.workItem.code}</td>
                                  <td className="py-2">{p.workItem.name}</td>
                                  <td className="py-2 text-right text-gray-500">{fmt(Number(p.workItem.basePrice))}</td>
                                  <td className="py-2 text-right font-medium">{fmt(Number(p.price))}</td>
                                  <td className={`py-2 text-right ${diff > 0 ? "text-red-600" : diff < 0 ? "text-green-600" : "text-gray-400"}`}>
                                    {diff > 0 ? "+" : ""}{fmt(diff)}
                                  </td>
                                  <td className="py-2 text-right">
                                    <button onClick={() => handleDeleteSubPrice(selectedSub!.id, p.workItem.id)} className="text-gray-400 hover:text-red-500">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                      <div className="flex items-center gap-2">
                        <select value={selectedWorkItem} onChange={e => setSelectedWorkItem(e.target.value)} className="input-field flex-1">
                          <option value="">Выберите работу...</option>
                          {workItems.filter(w => !subPrices.some((p: any) => p.workItem.id === w.id)).map(w => (
                            <option key={w.id} value={w.id}>{w.code} — {w.name} (базовая: {fmt(Number(w.basePrice))})</option>
                          ))}
                        </select>
                        <input type="number" placeholder="Цена" value={newPriceVal} onChange={e => setNewPriceVal(e.target.value)} className="input-field w-32" />
                        <button onClick={() => handleAddSubPrice(selectedSub!.id)} disabled={!selectedWorkItem || !newPriceVal} className="btn-primary flex items-center gap-1 disabled:opacity-50">
                          <Save className="w-4 h-4" /> Добавить
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Orders table */}
                  {detailTab === "orders" && (
                  <div className="card overflow-hidden">
                    <div className="p-3 border-b border-gray-100 font-medium text-sm">Заказы</div>
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left p-2.5 text-xs font-medium text-gray-500 uppercase">Наряд</th>
                          <th className="text-left p-2.5 text-xs font-medium text-gray-500 uppercase">Описание</th>
                          <th className="text-right p-2.5 text-xs font-medium text-gray-500 uppercase">Сумма</th>
                          <th className="text-center p-2.5 text-xs font-medium text-gray-500 uppercase">Статус</th>
                          <th className="text-right p-2.5 text-xs font-medium text-gray-500 uppercase">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subOrders.length === 0 ? (
                          <tr><td colSpan={5} className="p-6 text-center text-gray-400 text-sm">Нет заказов</td></tr>
                        ) : subOrders.map(o => (
                          <tr key={o.id} className="border-b border-gray-50">
                            <td className="p-2.5">
                              <p className="text-sm font-medium">{o.order.orderNumber}</p>
                              <p className="text-xs text-gray-400">{o.order.client?.shortName || o.order.client?.name}</p>
                            </td>
                            <td className="p-2.5 text-sm">{o.description}</td>
                            <td className="p-2.5 text-sm text-right font-medium">{fmt(o.price)} ₽</td>
                            <td className="p-2.5 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] || "bg-gray-100"}`}>
                                {STATUS_LABELS[o.status] || o.status}
                              </span>
                              {o.isPaid && <span className="ml-1 text-xs text-green-600">Оплач.</span>}
                            </td>
                            <td className="p-2.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openEditOrder(o)} className="p-1 text-gray-400 hover:text-blue-600" title="Редактировать">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                {o.status === "SENT" && (
                                  <button onClick={() => updateOrderStatus(o.id, "IN_PROGRESS")} className="text-xs text-blue-600 hover:underline">В работу</button>
                                )}
                                {o.status === "IN_PROGRESS" && (
                                  <button onClick={() => updateOrderStatus(o.id, "COMPLETED")} className="text-xs text-green-600 hover:underline">Выполнено</button>
                                )}
                                {!o.isPaid && o.status === "COMPLETED" && (
                                  <button onClick={() => markPaid(o.id)} className="p-1 text-gray-400 hover:text-green-600" title="Оплатить">
                                    <DollarSign className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Create subcontractor modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Новый субподрядчик</h2>
                <button onClick={() => { setShowCreateModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <input placeholder="Название *" value={newSub.name} onChange={(e) => setNewSub(p => ({...p, name: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <input placeholder="Контактное лицо" value={newSub.contactPerson} onChange={(e) => setNewSub(p => ({...p, contactPerson: e.target.value}))} className="input-field" />
                  <input placeholder="Телефон" value={newSub.phone} onChange={(e) => setNewSub(p => ({...p, phone: e.target.value}))} className="input-field" />
                </div>
                <input placeholder="Специализации (через запятую)" value={newSub.specializations} onChange={(e) => setNewSub(p => ({...p, specializations: e.target.value}))} className="input-field" />
                <input placeholder="ИНН" value={newSub.inn} onChange={(e) => setNewSub(p => ({...p, inn: e.target.value}))} className="input-field" />
                <input placeholder="Примечание" value={newSub.notes} onChange={(e) => setNewSub(p => ({...p, notes: e.target.value}))} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowCreateModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleCreate} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Создать"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Create order modal */}
        {showOrderModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Отправить работу на подряд</h2>
                <button onClick={() => { setShowOrderModal(false); setError(""); }}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              {error && <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg mb-3 text-sm">{error}</div>}
              <div className="space-y-3">
                <select value={newOrder.subcontractorId} onChange={(e) => setNewOrder(p => ({...p, subcontractorId: e.target.value}))} className="input-field">
                  <option value="">— Субподрядчик —</option>
                  {subs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={newOrder.orderId} onChange={(e) => setNewOrder(p => ({...p, orderId: e.target.value}))} className="input-field">
                  <option value="">— Наряд —</option>
                  {orders.map(o => <option key={o.id} value={o.id}>{o.orderNumber} — {o.client?.shortName || o.client?.name}</option>)}
                </select>
                <input placeholder="Описание работы *" value={newOrder.description} onChange={(e) => setNewOrder(p => ({...p, description: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Стоимость *" value={newOrder.price} onChange={(e) => setNewOrder(p => ({...p, price: e.target.value}))} className="input-field" />
                  <input type="date" value={newOrder.dueDate} onChange={(e) => setNewOrder(p => ({...p, dueDate: e.target.value}))} className="input-field" placeholder="Срок" />
                </div>
                <input placeholder="Примечание" value={newOrder.notes} onChange={(e) => setNewOrder(p => ({...p, notes: e.target.value}))} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => { setShowOrderModal(false); setError(""); }} className="btn-secondary">Отмена</button>
                <button onClick={handleCreateOrder} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Отправить"}</button>
              </div>
            </div>
          </div>
        )}

        {/* Edit order modal */}
        {editOrder && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Редактировать заказ</h2>
                <button onClick={() => setEditOrder(null)}><X className="w-5 h-5 text-gray-400" /></button>
              </div>
              <div className="space-y-3">
                <input placeholder="Описание" value={editOrderForm.description} onChange={(e) => setEditOrderForm(p => ({...p, description: e.target.value}))} className="input-field" />
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" placeholder="Цена" value={editOrderForm.price} onChange={(e) => setEditOrderForm(p => ({...p, price: e.target.value}))} className="input-field" />
                  <input type="date" value={editOrderForm.dueDate} onChange={(e) => setEditOrderForm(p => ({...p, dueDate: e.target.value}))} className="input-field" />
                </div>
                <input placeholder="Примечание" value={editOrderForm.notes} onChange={(e) => setEditOrderForm(p => ({...p, notes: e.target.value}))} className="input-field" />
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button onClick={() => setEditOrder(null)} className="btn-secondary">Отмена</button>
                <button onClick={handleEditOrder} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? "..." : "Сохранить"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
